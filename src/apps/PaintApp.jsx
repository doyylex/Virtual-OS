import { useCallback, useEffect, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { paintFileDropEventName } from '../services/fileDropTargets.js';
import { isImageFileName } from '../services/fileIcons.js';
import { joinFileName } from '../services/fileNames.js';
import { findNameConflict, resolveSaveConflict } from '../services/saveConflicts.js';
import { useDialogStore } from '../store/useDialogStore.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const paintColors = [
  '#111111',
  '#4f4f4f',
  '#9a9a9a',
  '#ffffff',
  '#7f1d1d',
  '#d92727',
  '#ff6b6b',
  '#f28c28',
  '#ffd166',
  '#f4d43f',
  '#a3d65c',
  '#2aa84a',
  '#0b7a53',
  '#22c7a9',
  '#54d6ff',
  '#1e78d6',
  '#173c9c',
  '#7b3fd6',
  '#b66cff',
  '#d94aa0',
  '#ff8dc7',
  '#8a5a2b',
  '#c58b55',
];

const toolLabels = {
  pencil: 'Lapiz',
  eraser: 'Goma',
  bucket: 'Balde',
  line: 'Linea',
  rectangle: 'Rectangulo',
  ellipse: 'Elipse',
  text: 'Texto',
};

const disabledPaintTools = new Set(['text']);
const enabledToolEntries = Object.entries(toolLabels).filter(([tool]) => !disabledPaintTools.has(tool));
const isTextToolEnabled = !disabledPaintTools.has('text');
const shapeTools = new Set(['line', 'rectangle', 'ellipse']);
const maxUndoHistoryLimit = 12;
const maxUndoMemoryBytes = 96 * 1024 * 1024;
const floodFillTolerance = 30;
const floodFillEdgeTolerance = 118;
const floodFillEdgePasses = 4;
const textFontOptions = [
  { label: 'Tahoma', value: 'Tahoma, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Courier', value: '"Courier New", Consolas, monospace' },
];
const defaultTextFontFamily = textFontOptions[0].value;
const defaultTextSize = 22;
const minTextSize = 8;
const maxTextSize = 96;
const textInputPadding = { x: 4, y: 2 };
const minTextBoxWidth = 72;
const minTextBoxHeight = 32;
const defaultCanvasSize = { width: 640, height: 360 };
const minCanvasSize = { width: 64, height: 64 };
const maxCanvasSize = { width: 2400, height: 1800 };
const minZoomPercent = 25;
const maxZoomPercent = 400;
const zoomButtonStep = 25;
const zoomSliderStep = 5;
const zoomPresets = [25, 50, 100, 200, 400];
const fitZoomPadding = 28;
const defaultImageFileName = 'roso-paint.png';
const imageFileExtension = '.png';
const recycleBinFolderId = 'recycle-bin-folder';
const invalidFileNamePattern = /[<>:"/\\|?*]/;
const hexColorPattern = /^#?[0-9a-fA-F]{6}$/;

const validateFileName = (name) => (invalidFileNamePattern.test(name) ? 'El nombre no puede usar caracteres reservados.' : '');

const isShapeTool = (tool) => shapeTools.has(tool);

const getTextLineHeight = (fontSize) => Math.round(fontSize * 1.22);

const getTextFont = ({ fontFamily, fontSize, isBold, isItalic }) =>
  `${isItalic ? 'italic ' : ''}${isBold ? '700 ' : '400 '}${fontSize}px ${fontFamily}`;

const getWrappedTextLines = (context, text, maxWidth) => {
  const rawLines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const safeMaxWidth = Math.max(1, maxWidth);

  return rawLines.flatMap((rawLine) => {
    if (!rawLine) {
      return [''];
    }

    const wrappedLines = [];
    let currentLine = '';

    for (const character of Array.from(rawLine)) {
      const nextLine = `${currentLine}${character}`;

      if (currentLine && context.measureText(nextLine).width > safeMaxWidth) {
        wrappedLines.push(currentLine);
        currentLine = character.trim() ? character : '';
      } else {
        currentLine = nextLine;
      }
    }

    return [...wrappedLines, currentLine];
  });
};

let textMeasureCanvas;

const getTextMeasureContext = () => {
  if (typeof document === 'undefined') {
    return null;
  }

  textMeasureCanvas ??= document.createElement('canvas');
  return textMeasureCanvas.getContext('2d');
};

const isTextDraftOverflowing = (draft) => {
  if (!draft || String(draft.value ?? '').length === 0) {
    return false;
  }

  const context = getTextMeasureContext();

  if (!context) {
    return false;
  }

  const inputWidth = draft.inputWidth ?? draft.minInputWidth;
  const inputHeight = draft.inputHeight ?? draft.lineHeight * 3;
  const maxTextWidth = Math.max(1, inputWidth - textInputPadding.x * 2);

  context.font = getTextFont(draft);

  const lines = getWrappedTextLines(context, draft.value, maxTextWidth);
  const availableHeight = Math.max(0, inputHeight - textInputPadding.y * 2);

  return lines.length * draft.lineHeight > availableHeight + 0.5;
};

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeCanvasDimension = (value, min, max, fallback) => {
  const numberValue = Number.parseInt(value, 10);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.round(clampNumber(numberValue, min, max));
};

const normalizeCanvasSize = (size, fallback = defaultCanvasSize) => ({
  width: normalizeCanvasDimension(size.width, minCanvasSize.width, maxCanvasSize.width, fallback.width),
  height: normalizeCanvasDimension(size.height, minCanvasSize.height, maxCanvasSize.height, fallback.height),
});

const normalizeZoomPercent = (value, fallback = 100) => {
  const numberValue = Number.parseFloat(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.round(clampNumber(numberValue, minZoomPercent, maxZoomPercent) / zoomSliderStep) * zoomSliderStep;
};

const getFitZoomLevel = (canvasSize, viewportSize) => {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return 1;
  }

  const availableWidth = Math.max(1, viewportSize.width - fitZoomPadding);
  const availableHeight = Math.max(1, viewportSize.height - fitZoomPadding);

  return clampNumber(Math.min(availableWidth / canvasSize.width, availableHeight / canvasSize.height), 0.1, 4);
};

const normalizeHexColor = (value) => {
  const cleanValue = String(value ?? '').trim();

  if (!hexColorPattern.test(cleanValue)) {
    return null;
  }

  return `#${cleanValue.replace('#', '').toLowerCase()}`;
};

const getPencilCursor = (color) => {
  const cursorColor = normalizeHexColor(color) ?? paintColors[0];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25">
      <path d="M12 1h1v8h-1zM12 16h1v8h-1zM1 12h8v1H1zM16 12h8v1h-8z" fill="#000"/>
      <path d="M12 10h1v5h-1zM10 12h5v1h-5z" fill="#fff"/>
      <circle cx="12.5" cy="12.5" r="3.2" fill="${cursorColor}" stroke="#000" stroke-width="1"/>
    </svg>
  `;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
};

const getShapeCursor = (color) => {
  const cursorColor = normalizeHexColor(color) ?? paintColors[0];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25">
      <path d="M12 1h1v8h-1zM12 16h1v8h-1zM1 12h8v1H1zM16 12h8v1h-8z" fill="#000"/>
      <path d="M12 10h1v5h-1zM10 12h5v1h-5z" fill="#fff"/>
      <rect x="8.5" y="8.5" width="8" height="8" fill="none" stroke="${cursorColor}" stroke-width="2"/>
      <rect x="8.5" y="8.5" width="8" height="8" fill="none" stroke="#000" stroke-width="1"/>
    </svg>
  `;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
};

const getBucketCursor = (color) => {
  const cursorColor = normalizeHexColor(color) ?? paintColors[0];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <g transform="rotate(-25 13 11)">
        <rect x="7" y="5" width="12" height="10" rx="1.5" fill="#d8e7ff" stroke="#000" stroke-width="1.3"/>
        <path d="M8 7h10" stroke="#ffffff" stroke-width="1.2"/>
        <path d="M8 13h10" stroke="#6c7d9d" stroke-width="1"/>
      </g>
      <path d="M17 16c2.8 1.9 4.5 3.7 4.5 5.4a3.1 3.1 0 0 1-6.2 0c0-1.7 1.1-3.5 1.7-5.4z" fill="${cursorColor}" stroke="#000" stroke-width="1.2"/>
      <path d="M12 23h1v4h-1zM10 25h5v1h-5z" fill="#000"/>
    </svg>
  `;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 23, copy`;
};

const getCanvasCursor = (tool, color) => {
  if (tool === 'eraser') {
    return undefined;
  }

  if (tool === 'bucket') {
    return getBucketCursor(color);
  }

  if (tool === 'text') {
    return 'text';
  }

  return isShapeTool(tool) ? getShapeCursor(color) : getPencilCursor(color);
};

const getCanvasPoint = (canvas, event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
};

const getCanvasPixelPoint = (canvas, event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;

  return {
    x: Math.floor((event.clientX - rect.left) * scaleX),
    y: Math.floor((event.clientY - rect.top) * scaleY),
  };
};

const parseHexColorToRgba = (color) => {
  const normalizedColor = normalizeHexColor(color) ?? paintColors[0];
  const colorValue = normalizedColor.replace('#', '');

  return [
    Number.parseInt(colorValue.slice(0, 2), 16),
    Number.parseInt(colorValue.slice(2, 4), 16),
    Number.parseInt(colorValue.slice(4, 6), 16),
    255,
  ];
};

const isSimilarColor = (data, index, color, tolerance = floodFillTolerance) =>
  Math.abs(data[index] - color[0]) <= tolerance &&
  Math.abs(data[index + 1] - color[1]) <= tolerance &&
  Math.abs(data[index + 2] - color[2]) <= tolerance &&
  Math.abs(data[index + 3] - color[3]) <= tolerance;

const isEditableTarget = (target) =>
  target instanceof HTMLElement &&
  (target.matches('input, textarea, select') || target.isContentEditable);

const isTextEditorTarget = (target) =>
  target instanceof HTMLElement &&
  (target.matches('.ros-paint-text-input') ||
    Boolean(target.closest('[data-paint-text-box="true"], [data-paint-text-controls="true"]')));

export function PaintApp({ launchData, windowId }) {
  const appRef = useRef(null);
  const canvasRef = useRef(null);
  const hasLoadedLinkedFileRef = useRef(false);
  const linkedImageFileRef = useRef(null);
  const isClosePromptOpenRef = useRef(false);
  const saveCanvasToRosoOsRef = useRef(null);
  const hasUnsavedChangesRef = useRef(false);
  const undoHistoryRef = useRef([]);
  const viewportRef = useRef(null);
  const textInputRef = useRef(null);
  const textDraftRef = useRef(null);
  const textDraftIdRef = useRef(0);
  const settledTextDraftIdRef = useRef(null);
  const textResizeRef = useRef(null);
  const zoomStateRef = useRef({ effectiveZoom: 1, zoomMode: 'manual', zoomPercent: 100 });
  const drawingRef = useRef({ isDrawing: false, lastPoint: null, startPoint: null, snapshot: null, tool: 'pencil' });
  const toolRef = useRef('pencil');
  const colorRef = useRef(paintColors[0]);
  const sizeRef = useRef(6);
  const [activeTool, setActiveTool] = useState('pencil');
  const [activeColor, setActiveColor] = useState(paintColors[0]);
  const [hexColor, setHexColor] = useState(paintColors[0]);
  const [brushSize, setBrushSize] = useState(6);
  const [textFontFamily, setTextFontFamily] = useState(defaultTextFontFamily);
  const [textSize, setTextSize] = useState(defaultTextSize);
  const [textSizeDraft, setTextSizeDraft] = useState(String(defaultTextSize));
  const [isTextBold, setIsTextBold] = useState(false);
  const [isTextItalic, setIsTextItalic] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [textDraft, setTextDraft] = useState(null);
  const [canvasSize, setCanvasSize] = useState(defaultCanvasSize);
  const [canvasSizeDraft, setCanvasSizeDraft] = useState({
    width: String(defaultCanvasSize.width),
    height: String(defaultCanvasSize.height),
  });
  const [zoomMode, setZoomMode] = useState('manual');
  const [zoomPercent, setZoomPercent] = useState(100);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [savedFileId, setSavedFileId] = useState(() => launchData?.fileId ?? null);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const showAlert = useDialogStore((state) => state.showAlert);
  const showChoiceDialog = useDialogStore((state) => state.showChoiceDialog);
  const showSaveFileDialog = useDialogStore((state) => state.showSaveFileDialog);
  const createFileAsync = useFileSystemStore((state) => state.createFileAsync);
  const getNode = useFileSystemStore((state) => state.getNode);
  const nodes = useFileSystemStore((state) => state.nodes);
  const linkedFile = useFileSystemStore((state) =>
    savedFileId ? state.nodes.find((node) => node.id === savedFileId) ?? null : null,
  );
  const updateFileContentAsync = useFileSystemStore((state) => state.updateFileContentAsync);
  const registerBeforeClose = useWindowStore((state) => state.registerBeforeClose);
  const setWindowTitle = useWindowStore((state) => state.setWindowTitle);
  const playSound = useSystemSound();
  const linkedImageFile = linkedFile?.type === 'file' && isImageFileName(linkedFile.name) ? linkedFile : null;
  const fitZoomLevel = getFitZoomLevel(canvasSize, viewportSize);
  const effectiveZoom = zoomMode === 'fit' ? fitZoomLevel : zoomPercent / 100;
  const effectiveZoomPercent = Math.round(effectiveZoom * 100);
  const zoomSliderValue = normalizeZoomPercent(zoomMode === 'fit' ? effectiveZoomPercent : zoomPercent, zoomPercent);
  const canZoomOut = zoomSliderValue > minZoomPercent;
  const canZoomIn = zoomSliderValue < maxZoomPercent;
  const resolvedActiveTool = disabledPaintTools.has(activeTool) ? 'pencil' : activeTool;

  useEffect(() => {
    if (!windowId || activeWindowId === windowId) {
      appRef.current?.focus({ preventScroll: true });
    }
  }, [activeWindowId, windowId]);

  useEffect(() => {
    toolRef.current = resolvedActiveTool;
  }, [resolvedActiveTool]);

  useEffect(() => {
    colorRef.current = activeColor;
  }, [activeColor]);

  useEffect(() => {
    sizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    if (!windowId) {
      return;
    }

    setWindowTitle(windowId, `Paint - ${linkedImageFile?.name ?? 'Sin titulo'}`);
  }, [linkedImageFile?.name, setWindowTitle, windowId]);

  useEffect(() => {
    linkedImageFileRef.current = linkedImageFile;
  }, [linkedImageFile]);

  useEffect(() => {
    if (!textDraft?.id) {
      return;
    }

    textInputRef.current?.focus({ preventScroll: true });
  }, [textDraft?.id]);

  useEffect(() => {
    textDraftRef.current = textDraft;
  }, [textDraft]);

  useEffect(() => {
    zoomStateRef.current = {
      effectiveZoom,
      zoomMode,
      zoomPercent,
    };
  }, [effectiveZoom, zoomMode, zoomPercent]);

  const setDirtyState = useCallback((nextHasUnsavedChanges) => {
    hasUnsavedChangesRef.current = nextHasUnsavedChanges;
    setHasUnsavedChanges(nextHasUnsavedChanges);
  }, []);

  const markUnsavedChanges = useCallback(() => {
    setDirtyState(true);
  }, [setDirtyState]);

  const markSavedChanges = useCallback(() => {
    setDirtyState(false);
  }, [setDirtyState]);

  const prepareContext = useCallback((context) => {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.imageSmoothingEnabled = true;
  }, []);

  const syncCanvasBackingStore = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const nextWidth = Math.max(1, Math.floor(canvasSize.width));
    const nextHeight = Math.max(1, Math.floor(canvasSize.height));

    if (canvas.width === nextWidth && canvas.height === nextHeight) {
      return;
    }

    const context = canvas.getContext('2d');
    const snapshot = document.createElement('canvas');
    const hasSnapshot = canvas.width > 0 && canvas.height > 0;

    if (hasSnapshot) {
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext('2d').drawImage(canvas, 0, 0);
    }

    canvas.width = nextWidth;
    canvas.height = nextHeight;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (hasSnapshot) {
      context.drawImage(snapshot, 0, 0);
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    prepareContext(context);
  }, [canvasSize.height, canvasSize.width, prepareContext]);

  useEffect(() => {
    syncCanvasBackingStore();
  }, [syncCanvasBackingStore]);

  useEffect(() => {
    const updateViewportSize = () => {
      const bounds = viewportRef.current?.getBoundingClientRect();

      if (!bounds) {
        return;
      }

      setViewportSize({
        width: Math.max(0, Math.floor(bounds.width)),
        height: Math.max(0, Math.floor(bounds.height)),
      });
    };

    updateViewportSize();

    const observer = new ResizeObserver(() => {
      updateViewportSize();
    });

    if (viewportRef.current) {
      observer.observe(viewportRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  const drawImageToCanvas = useCallback((source) =>
    new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');

      if (!canvas || !context) {
        reject(new Error('El lienzo no esta listo.'));
        return;
      }

      const image = new Image();

      image.onload = () => {
        const nextCanvasSize = normalizeCanvasSize({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        const scale = Math.min(nextCanvasSize.width / image.naturalWidth, nextCanvasSize.height / image.naturalHeight, 1);
        const imageWidth = image.naturalWidth * scale;
        const imageHeight = image.naturalHeight * scale;
        const imageX = (nextCanvasSize.width - imageWidth) / 2;
        const imageY = (nextCanvasSize.height - imageHeight) / 2;

        canvas.width = nextCanvasSize.width;
        canvas.height = nextCanvasSize.height;
        setCanvasSize(nextCanvasSize);
        setCanvasSizeDraft({
          width: String(nextCanvasSize.width),
          height: String(nextCanvasSize.height),
        });

        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, imageX, imageY, imageWidth, imageHeight);
        context.restore();
        prepareContext(context);
        resolve();
      };

      image.onerror = () => reject(new Error('No se pudo cargar la imagen PNG.'));
      image.src = source;
    }), [prepareContext]);

  useEffect(() => {
    if (!linkedImageFile?.content || hasLoadedLinkedFileRef.current) {
      return undefined;
    }

    let isCancelled = false;
    syncCanvasBackingStore();

    void drawImageToCanvas(linkedImageFile.content)
      .then(() => {
        if (isCancelled) {
          return;
        }

        hasLoadedLinkedFileRef.current = true;
        undoHistoryRef.current = [];
        setCanUndo(false);
        markSavedChanges();
      })
      .catch(() => {
        if (!isCancelled) {
          hasLoadedLinkedFileRef.current = true;
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [drawImageToCanvas, linkedImageFile?.content, markSavedChanges, syncCanvasBackingStore]);

  const loadImageFileIntoPaint = useCallback(async (node) => {
    if (node?.type !== 'file' || !isImageFileName(node.name)) {
      return false;
    }

    try {
      await drawImageToCanvas(node.content);
      setSavedFileId(node.id);
      linkedImageFileRef.current = node;
      hasLoadedLinkedFileRef.current = true;
      undoHistoryRef.current = [];
      setCanUndo(false);
      markSavedChanges();
      playSound('open');
      return true;
    } catch (error) {
      await showAlert({
        title: 'Paint',
        message: 'ERROR AL ABRIR',
        detail: error?.message ?? 'No se pudo cargar la imagen PNG.',
        confirmLabel: 'Aceptar',
        icon: 'warning',
      });
      playSound('error');
      return false;
    }
  }, [drawImageToCanvas, markSavedChanges, playSound, showAlert]);

  const createCanvasSnapshot = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      return null;
    }

    const snapshot = document.createElement('canvas');
    const snapshotContext = snapshot.getContext('2d');

    if (!snapshotContext) {
      return null;
    }

    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshotContext.drawImage(canvas, 0, 0);

    return snapshot;
  }, []);

  const pushSnapshotToUndo = useCallback((snapshot, snapshotCanvasSize = canvasSize) => {
    if (!snapshot) {
      return;
    }

    const historyEntry = {
      canvasSize: { ...snapshotCanvasSize },
      snapshot,
    };
    const snapshotBytes = snapshot.width * snapshot.height * 4;
    const getEntryBytes = (entry) => entry.snapshot.width * entry.snapshot.height * 4;
    let nextHistory = [...undoHistoryRef.current, historyEntry].slice(-maxUndoHistoryLimit);
    let totalBytes = nextHistory.reduce((total, item) => total + getEntryBytes(item), 0);

    while (nextHistory.length > 1 && totalBytes > maxUndoMemoryBytes) {
      const removedEntry = nextHistory.shift();
      totalBytes -= getEntryBytes(removedEntry);
    }

    if (snapshotBytes > maxUndoMemoryBytes) {
      nextHistory = [historyEntry];
    }

    undoHistoryRef.current = nextHistory;
    setCanUndo(true);
  }, [canvasSize]);

  const pushUndoSnapshot = useCallback(() => {
    pushSnapshotToUndo(createCanvasSnapshot());
  }, [createCanvasSnapshot, pushSnapshotToUndo]);

  const restoreCanvasSnapshot = useCallback((snapshot, restoredCanvasSize = { width: snapshot.width, height: snapshot.height }) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!context) {
      return;
    }

    const nextCanvasSize = normalizeCanvasSize(restoredCanvasSize, {
      width: snapshot.width,
      height: snapshot.height,
    });

    if (canvas.width !== nextCanvasSize.width || canvas.height !== nextCanvasSize.height) {
      canvas.width = nextCanvasSize.width;
      canvas.height = nextCanvasSize.height;
      setCanvasSize(nextCanvasSize);
      setCanvasSizeDraft({
        width: String(nextCanvasSize.width),
        height: String(nextCanvasSize.height),
      });
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(snapshot, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);
    prepareContext(context);
  }, [prepareContext]);

  const undoLastAction = useCallback(() => {
    const historyEntry = undoHistoryRef.current.pop();

    if (!historyEntry) {
      return;
    }

    restoreCanvasSnapshot(historyEntry.snapshot, historyEntry.canvasSize);
    drawingRef.current = { isDrawing: false, lastPoint: null, startPoint: null, snapshot: null, tool: toolRef.current };
    setCanUndo(undoHistoryRef.current.length > 0);
    markUnsavedChanges();
    playSound('click');
  }, [markUnsavedChanges, playSound, restoreCanvasSnapshot]);

  const drawLine = useCallback((fromPoint, toPoint) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!context) {
      return;
    }

    const isEraser = toolRef.current === 'eraser';

    context.strokeStyle = isEraser ? '#ffffff' : colorRef.current;
    context.lineWidth = isEraser ? sizeRef.current * 1.8 : sizeRef.current;
    context.beginPath();
    context.moveTo(fromPoint.x, fromPoint.y);
    context.lineTo(toPoint.x, toPoint.y);
    context.stroke();
  }, []);

  const drawPoint = useCallback((point) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!context) {
      return;
    }

    const isEraser = toolRef.current === 'eraser';
    const pointSize = isEraser ? sizeRef.current * 1.8 : sizeRef.current;

    context.fillStyle = isEraser ? '#ffffff' : colorRef.current;
    context.beginPath();
    context.arc(point.x, point.y, pointSize / 2, 0, Math.PI * 2);
    context.fill();
  }, []);

  const drawShape = useCallback((tool, startPoint, endPoint) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!context || !startPoint || !endPoint) {
      return;
    }

    const left = Math.min(startPoint.x, endPoint.x);
    const top = Math.min(startPoint.y, endPoint.y);
    const width = Math.abs(endPoint.x - startPoint.x);
    const height = Math.abs(endPoint.y - startPoint.y);

    context.save();
    context.strokeStyle = colorRef.current;
    context.lineWidth = sizeRef.current;
    context.beginPath();

    if (tool === 'line') {
      context.moveTo(startPoint.x, startPoint.y);
      context.lineTo(endPoint.x, endPoint.y);
    }

    if (tool === 'rectangle') {
      context.rect(left, top, width, height);
    }

    if (tool === 'ellipse') {
      context.ellipse(
        left + width / 2,
        top + height / 2,
        Math.max(width / 2, 0.5),
        Math.max(height / 2, 0.5),
        0,
        0,
        Math.PI * 2,
      );
    }

    context.stroke();
    context.restore();
  }, []);

  const fillCanvasArea = useCallback((pixelPoint, fillColor) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context || canvas.width <= 0 || canvas.height <= 0) {
      return false;
    }

    const startX = Math.min(Math.max(pixelPoint.x, 0), canvas.width - 1);
    const startY = Math.min(Math.max(pixelPoint.y, 0), canvas.height - 1);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const startIndex = (startY * width + startX) * 4;
    const targetColor = [
      data[startIndex],
      data[startIndex + 1],
      data[startIndex + 2],
      data[startIndex + 3],
    ];
    const replacementColor = parseHexColorToRgba(fillColor);

    if (isSimilarColor(data, startIndex, replacementColor)) {
      return false;
    }

    const rowStride = width * 4;
    const filledPixels = new Uint8Array(width * height);
    let fillMinX = startX;
    let fillMaxX = startX;
    let fillMinY = startY;
    let fillMaxY = startY;
    const isTargetOffset = (index) =>
      Math.abs(data[index] - targetColor[0]) <= floodFillTolerance &&
      Math.abs(data[index + 1] - targetColor[1]) <= floodFillTolerance &&
      Math.abs(data[index + 2] - targetColor[2]) <= floodFillTolerance &&
      Math.abs(data[index + 3] - targetColor[3]) <= floodFillTolerance;
    const isTargetEdgeOffset = (index) =>
      Math.abs(data[index] - targetColor[0]) <= floodFillEdgeTolerance &&
      Math.abs(data[index + 1] - targetColor[1]) <= floodFillEdgeTolerance &&
      Math.abs(data[index + 2] - targetColor[2]) <= floodFillEdgeTolerance &&
      Math.abs(data[index + 3] - targetColor[3]) <= floodFillEdgeTolerance;
    const paintOffset = (index) => {
      const pixelIndex = index / 4;

      if (filledPixels[pixelIndex]) {
        return;
      }

      const y = Math.floor(pixelIndex / width);
      const x = pixelIndex - y * width;

      filledPixels[pixelIndex] = 1;
      fillMinX = Math.min(fillMinX, x);
      fillMaxX = Math.max(fillMaxX, x);
      fillMinY = Math.min(fillMinY, y);
      fillMaxY = Math.max(fillMaxY, y);
      data[index] = replacementColor[0];
      data[index + 1] = replacementColor[1];
      data[index + 2] = replacementColor[2];
      data[index + 3] = replacementColor[3];
    };
    const stack = [startY * width + startX];

    while (stack.length > 0) {
      const pixel = stack.pop();
      const y = Math.floor(pixel / width);
      let x = pixel - y * width;
      let offset = (y * width + x) * 4;
      let hasNorthSpan = false;
      let hasSouthSpan = false;

      while (x >= 0 && isTargetOffset(offset)) {
        x -= 1;
        offset -= 4;
      }

      x += 1;
      offset += 4;

      while (x < width && isTargetOffset(offset)) {
        paintOffset(offset);

        if (y > 0 && isTargetOffset(offset - rowStride)) {
          if (!hasNorthSpan) {
            stack.push((y - 1) * width + x);
            hasNorthSpan = true;
          }
        } else {
          hasNorthSpan = false;
        }

        if (y < height - 1 && isTargetOffset(offset + rowStride)) {
          if (!hasSouthSpan) {
            stack.push((y + 1) * width + x);
            hasSouthSpan = true;
          }
        } else {
          hasSouthSpan = false;
        }

        x += 1;
        offset += 4;
      }
    }

    for (let pass = 0; pass < floodFillEdgePasses; pass += 1) {
      let didPaintEdgePixel = false;
      const edgePixels = [];
      const scanMinX = Math.max(0, fillMinX - 1);
      const scanMaxX = Math.min(width - 1, fillMaxX + 1);
      const scanMinY = Math.max(0, fillMinY - 1);
      const scanMaxY = Math.min(height - 1, fillMaxY + 1);

      for (let y = scanMinY; y <= scanMaxY; y += 1) {
        for (let x = scanMinX; x <= scanMaxX; x += 1) {
          const pixelIndex = y * width + x;
          const offset = pixelIndex * 4;

          if (filledPixels[pixelIndex] || !isTargetEdgeOffset(offset)) {
            continue;
          }

          const touchesFilledPixel =
            (x > 0 && filledPixels[pixelIndex - 1]) ||
            (x < width - 1 && filledPixels[pixelIndex + 1]) ||
            (y > 0 && filledPixels[pixelIndex - width]) ||
            (y < height - 1 && filledPixels[pixelIndex + width]) ||
            (x > 0 && y > 0 && filledPixels[pixelIndex - width - 1]) ||
            (x < width - 1 && y > 0 && filledPixels[pixelIndex - width + 1]) ||
            (x > 0 && y < height - 1 && filledPixels[pixelIndex + width - 1]) ||
            (x < width - 1 && y < height - 1 && filledPixels[pixelIndex + width + 1]);

          if (touchesFilledPixel) {
            edgePixels.push(offset);
          }
        }
      }

      for (const offset of edgePixels) {
        paintOffset(offset);
        didPaintEdgePixel = true;
      }

      if (!didPaintEdgePixel) {
        break;
      }
    }

    context.putImageData(imageData, 0, 0);
    prepareContext(context);
    return true;
  }, [prepareContext]);

  const focusTextInputSoon = useCallback(() => {
    const scheduleFocus = typeof window !== 'undefined' && window.requestAnimationFrame
      ? window.requestAnimationFrame
      : (callback) => setTimeout(callback, 0);

    scheduleFocus(() => {
      textInputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const updateTextDraftStyle = useCallback((patch) => {
    const currentDraft = textDraftRef.current;

    if (!currentDraft) {
      return;
    }

    const nextFontSize = patch.fontSize ?? currentDraft.fontSize;
    const nextLineHeight = patch.lineHeight ?? getTextLineHeight(nextFontSize);
    const currentInputWidth = currentDraft.inputWidth ?? currentDraft.minInputWidth ?? Math.max(160, nextFontSize * 8);
    const currentInputHeight = currentDraft.inputHeight ?? nextLineHeight * 3;
    const minimumWidth = Math.max(minTextBoxWidth, nextFontSize * 3);
    const minimumHeight = Math.max(minTextBoxHeight, nextLineHeight + textInputPadding.y * 2);
    const nextInputWidth = clampNumber(
      patch.inputWidth ?? currentInputWidth,
      minimumWidth,
      Math.max(minimumWidth, canvasSize.width - currentDraft.x),
    );
    const nextInputHeight = clampNumber(
      patch.inputHeight ?? Math.max(currentInputHeight, minimumHeight),
      minimumHeight,
      Math.max(minimumHeight, canvasSize.height - currentDraft.y),
    );
    const nextDraft = {
      ...currentDraft,
      ...patch,
      fontSize: nextFontSize,
      lineHeight: nextLineHeight,
      inputWidth: nextInputWidth,
      inputHeight: nextInputHeight,
      minInputWidth: nextInputWidth,
      x: clampNumber(currentDraft.x, 0, Math.max(0, canvasSize.width - nextInputWidth)),
      y: clampNumber(currentDraft.y, 0, Math.max(0, canvasSize.height - nextInputHeight)),
    };

    textDraftRef.current = nextDraft;
    setTextDraft(nextDraft);
  }, [canvasSize.height, canvasSize.width]);

  const applyTextSize = useCallback((value = textSizeDraft, shouldFocusTextInput = false) => {
    const nextSize = normalizeCanvasDimension(value, minTextSize, maxTextSize, textSize);
    const didChange = nextSize !== textSize;

    setTextSize(nextSize);
    setTextSizeDraft(String(nextSize));
    updateTextDraftStyle({
      fontSize: nextSize,
      lineHeight: getTextLineHeight(nextSize),
    });
    if (didChange) {
      playSound('click');
    }

    if (shouldFocusTextInput) {
      focusTextInputSoon();
    }
  }, [focusTextInputSoon, playSound, textSize, textSizeDraft, updateTextDraftStyle]);

  const drawTextToCanvas = useCallback((draft) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const text = draft?.value ?? '';

    if (!canvas || !context || text.trim().length === 0) {
      return false;
    }

    const snapshot = createCanvasSnapshot();

    if (!snapshot) {
      return false;
    }

    context.save();
    context.fillStyle = draft.color;
    context.font = getTextFont(draft);
    context.textBaseline = 'top';
    const inputWidth = draft.inputWidth ?? draft.minInputWidth;
    const inputHeight = draft.inputHeight ?? draft.lineHeight * 3;
    const maxTextWidth = Math.max(1, inputWidth - textInputPadding.x * 2);
    const lines = getWrappedTextLines(context, text, maxTextWidth);
    context.beginPath();
    context.rect(draft.x, draft.y, inputWidth, inputHeight);
    context.clip();
    lines.forEach((line, index) => {
      context.fillText(line, draft.x + textInputPadding.x, draft.y + textInputPadding.y + index * draft.lineHeight);
    });
    context.restore();
    prepareContext(context);
    pushSnapshotToUndo(snapshot);
    markUnsavedChanges();
    playSound('click');
    return true;
  }, [createCanvasSnapshot, markUnsavedChanges, playSound, prepareContext, pushSnapshotToUndo]);

  const commitTextDraft = useCallback(() => {
    const draft = textDraftRef.current;

    if (!draft || settledTextDraftIdRef.current === draft.id) {
      return;
    }

    settledTextDraftIdRef.current = draft.id;

    if (!isTextToolEnabled) {
      setTextDraft(null);
      textDraftRef.current = null;
      appRef.current?.focus({ preventScroll: true });
      return;
    }

    drawTextToCanvas(draft);
    setTextDraft(null);
    textDraftRef.current = null;
    appRef.current?.focus({ preventScroll: true });
  }, [drawTextToCanvas]);

  const cancelTextDraft = useCallback(() => {
    const draft = textDraftRef.current;

    if (!draft || settledTextDraftIdRef.current === draft.id) {
      return;
    }

    settledTextDraftIdRef.current = draft.id;
    setTextDraft(null);
    textDraftRef.current = null;
    appRef.current?.focus({ preventScroll: true });
  }, []);

  const handleTextEditorBlur = useCallback((event) => {
    if (isTextEditorTarget(event.relatedTarget)) {
      return;
    }

    commitTextDraft();
  }, [commitTextDraft]);

  const startTextDraft = useCallback((point) => {
    if (!isTextToolEnabled) {
      return;
    }

    commitTextDraft();

    const fontSize = textSize;
    const lineHeight = getTextLineHeight(fontSize);
    const inputWidth = Math.max(160, fontSize * 8);
    const inputHeight = lineHeight * 3;
    const x = clampNumber(point.x, 0, Math.max(0, canvasSize.width - inputWidth));
    const y = clampNumber(point.y, 0, Math.max(0, canvasSize.height - inputHeight));
    const id = textDraftIdRef.current + 1;
    const draft = {
      id,
      x,
      y,
      value: '',
      color: colorRef.current,
      fontFamily: textFontFamily,
      fontSize,
      isBold: isTextBold,
      isItalic: isTextItalic,
      lineHeight,
      inputWidth,
      inputHeight,
      minInputWidth: inputWidth,
    };

    textDraftIdRef.current = id;
    settledTextDraftIdRef.current = null;
    textDraftRef.current = draft;
    setTextDraft(draft);
  }, [canvasSize.height, canvasSize.width, commitTextDraft, isTextBold, isTextItalic, textFontFamily, textSize]);

  const startTextBoxResize = useCallback((event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const draft = textDraftRef.current;

    if (!draft) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    textResizeRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startInputWidth: draft.inputWidth ?? draft.minInputWidth,
      startInputHeight: draft.inputHeight ?? draft.lineHeight * 3,
      zoom: Math.max(0.1, zoomStateRef.current.effectiveZoom),
    };
  }, []);

  const resizeTextBox = useCallback((event) => {
    const resize = textResizeRef.current;

    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateTextDraftStyle({
      inputWidth: resize.startInputWidth + (event.clientX - resize.startClientX) / resize.zoom,
      inputHeight: resize.startInputHeight + (event.clientY - resize.startClientY) / resize.zoom,
    });
  }, [updateTextDraftStyle]);

  const stopTextBoxResize = useCallback((event) => {
    const resize = textResizeRef.current;

    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    textResizeRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    textInputRef.current?.focus({ preventScroll: true });
  }, []);

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    event.preventDefault();
    appRef.current?.focus({ preventScroll: true });

    const point = getCanvasPoint(canvas, event);
    const selectedTool = toolRef.current;

    if (selectedTool === 'text') {
      startTextDraft(point);
      drawingRef.current = { isDrawing: false, lastPoint: null, startPoint: null, snapshot: null, tool: selectedTool };
      return;
    }

    if (selectedTool === 'bucket') {
      const snapshot = createCanvasSnapshot();
      const didFill = snapshot ? fillCanvasArea(getCanvasPixelPoint(canvas, event), colorRef.current) : false;

      if (didFill) {
        pushSnapshotToUndo(snapshot);
        markUnsavedChanges();
        playSound('click');
      }

      drawingRef.current = { isDrawing: false, lastPoint: null, startPoint: null, snapshot: null, tool: selectedTool };
      return;
    }

    if (isShapeTool(selectedTool)) {
      const snapshot = createCanvasSnapshot();

      if (!snapshot) {
        return;
      }

      canvas.setPointerCapture(event.pointerId);
      drawingRef.current = {
        isDrawing: true,
        hasMoved: false,
        lastPoint: point,
        startPoint: point,
        snapshot,
        tool: selectedTool,
      };
      return;
    }

    canvas.setPointerCapture(event.pointerId);
    pushUndoSnapshot();
    drawingRef.current = { isDrawing: true, lastPoint: point, startPoint: null, snapshot: null, tool: selectedTool };
    drawPoint(point);
    markUnsavedChanges();
  };

  const handlePointerMove = (event) => {
    const canvas = canvasRef.current;
    const drawing = drawingRef.current;

    if (!canvas || !drawing.isDrawing || !drawing.lastPoint) {
      return;
    }

    event.preventDefault();

    const nextPoint = getCanvasPoint(canvas, event);
    const isShapeDrawing = isShapeTool(drawing.tool);

    if (isShapeDrawing) {
      const hasMoved = Math.hypot(nextPoint.x - drawing.startPoint.x, nextPoint.y - drawing.startPoint.y) >= 3;

      restoreCanvasSnapshot(drawing.snapshot);
      drawShape(drawing.tool, drawing.startPoint, nextPoint);
      drawingRef.current = {
        ...drawing,
        hasMoved,
        lastPoint: nextPoint,
      };
      return;
    }

    drawLine(drawing.lastPoint, nextPoint);
    drawingRef.current = { ...drawing, lastPoint: nextPoint };
  };

  const stopDrawing = (event) => {
    const canvas = canvasRef.current;
    const drawing = drawingRef.current;

    if (event.type === 'pointerleave' && drawing.isDrawing && isShapeTool(drawing.tool)) {
      return;
    }

    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    if (drawing.isDrawing && isShapeTool(drawing.tool) && drawing.snapshot) {
      if (event.type === 'pointercancel' || !drawing.hasMoved) {
        restoreCanvasSnapshot(drawing.snapshot);
      } else {
        restoreCanvasSnapshot(drawing.snapshot);
        drawShape(drawing.tool, drawing.startPoint, drawing.lastPoint);
        pushSnapshotToUndo(drawing.snapshot);
        markUnsavedChanges();
      }
    }

    drawingRef.current = { isDrawing: false, lastPoint: null, startPoint: null, snapshot: null, tool: toolRef.current };
  };

  const clearCanvas = () => {
    commitTextDraft();

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!context) {
      return;
    }

    pushUndoSnapshot();
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    markUnsavedChanges();
    playSound('click');
  };

  const preserveViewportAfterZoom = (currentZoom, nextZoom, anchor) => {
    const viewport = viewportRef.current;

    if (!viewport || currentZoom <= 0) {
      return;
    }

    const viewportBounds = viewport.getBoundingClientRect();
    const anchorX = anchor ? anchor.clientX - viewportBounds.left : viewport.clientWidth / 2;
    const anchorY = anchor ? anchor.clientY - viewportBounds.top : viewport.clientHeight / 2;
    const canvasX = (viewport.scrollLeft + anchorX) / currentZoom;
    const canvasY = (viewport.scrollTop + anchorY) / currentZoom;

    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, canvasX * nextZoom - anchorX);
      viewport.scrollTop = Math.max(0, canvasY * nextZoom - anchorY);
    });
  };

  const setManualZoom = (nextZoomPercent, options = {}) => {
    commitTextDraft();
    const currentZoomState = zoomStateRef.current;
    const normalizedZoomPercent = normalizeZoomPercent(nextZoomPercent, currentZoomState.zoomPercent);
    const nextZoom = normalizedZoomPercent / 100;

    preserveViewportAfterZoom(currentZoomState.effectiveZoom, nextZoom, options.anchor);
    zoomStateRef.current = {
      effectiveZoom: nextZoom,
      zoomMode: 'manual',
      zoomPercent: normalizedZoomPercent,
    };
    setZoomMode('manual');
    setZoomPercent(normalizedZoomPercent);

    if (options.playSound !== false) {
      playSound('click');
    }
  };

  const setFitZoom = () => {
    commitTextDraft();
    preserveViewportAfterZoom(zoomStateRef.current.effectiveZoom, fitZoomLevel);
    zoomStateRef.current = {
      effectiveZoom: fitZoomLevel,
      zoomMode: 'fit',
      zoomPercent: zoomStateRef.current.zoomPercent,
    };
    setZoomMode('fit');
    playSound('click');
  };

  const stepManualZoom = (direction) => {
    const currentZoomPercent = zoomStateRef.current.zoomMode === 'fit'
      ? Math.round(zoomStateRef.current.effectiveZoom * 100)
      : zoomStateRef.current.zoomPercent;

    setManualZoom(currentZoomPercent + direction * zoomButtonStep);
  };

  const handleZoomWheel = (event) => {
    if (!event.ctrlKey || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const currentZoomPercent = zoomStateRef.current.zoomMode === 'fit'
      ? Math.round(zoomStateRef.current.effectiveZoom * 100)
      : zoomStateRef.current.zoomPercent;

    setManualZoom(currentZoomPercent + direction * zoomButtonStep, {
      anchor: { clientX: event.clientX, clientY: event.clientY },
      playSound: false,
    });
  };

  const applyCanvasSize = () => {
    commitTextDraft();

    const nextCanvasSize = normalizeCanvasSize(canvasSizeDraft, canvasSize);

    setCanvasSizeDraft({
      width: String(nextCanvasSize.width),
      height: String(nextCanvasSize.height),
    });

    if (nextCanvasSize.width === canvasSize.width && nextCanvasSize.height === canvasSize.height) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const snapshot = createCanvasSnapshot();

    pushSnapshotToUndo(snapshot, canvasSize);

    if (canvas && context) {
      canvas.width = nextCanvasSize.width;
      canvas.height = nextCanvasSize.height;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      if (snapshot) {
        context.drawImage(snapshot, 0, 0);
      }

      prepareContext(context);
    }

    setCanvasSize(nextCanvasSize);
    markUnsavedChanges();
    playSound('click');
  };

  const showSaveSuccess = useCallback((fileName) =>
    showAlert({
      title: 'Paint',
      message: 'IMAGEN GUARDADA',
      detail: `${fileName} se guardo en Roso OS.`,
      confirmLabel: 'Aceptar',
      icon: 'info',
    }), [showAlert]);

  const showSaveError = useCallback((error) =>
    showAlert({
      title: 'Paint',
      message: 'ERROR AL GUARDAR',
      detail: error?.message ?? 'No se pudo guardar la imagen.',
      confirmLabel: 'Aceptar',
      icon: 'warning',
    }), [showAlert]);

  const saveCanvasToRosoOs = useCallback(async (forceSaveAs = false) => {
    commitTextDraft();

    const canvas = canvasRef.current;

    if (!canvas) {
      return false;
    }

    if (!forceSaveAs && linkedImageFile) {
      try {
        await updateFileContentAsync(linkedImageFile.id, canvas.toDataURL('image/png'));
        markSavedChanges();
        playSound('save');
        await showSaveSuccess(linkedImageFile.name);
        return true;
      } catch (error) {
        playSound('error');
        await showSaveError(error);
        return false;
      }
    }

    const saveData = await showSaveFileDialog({
      title: 'Guardar imagen',
      message: 'Elige el nombre y la carpeta de la imagen.',
      detail: 'La Papelera no esta disponible como destino.',
      defaultValue: linkedImageFile?.name ?? defaultImageFileName,
      lockedExtension: imageFileExtension,
      initialFolderId: linkedImageFile?.parentId ?? 'documents',
      confirmLabel: 'Guardar',
      blockedFolderIds: [recycleBinFolderId],
      validate: validateFileName,
    });

    if (!saveData) {
      return false;
    }

    try {
      const fileName = joinFileName(saveData.name.trim() || 'dibujo', imageFileExtension);
      const imageContent = canvas.toDataURL('image/png');

      if (
        linkedImageFile?.id &&
        saveData.folderId === linkedImageFile.parentId &&
        fileName.toLowerCase() === linkedImageFile.name.toLowerCase()
      ) {
        await updateFileContentAsync(linkedImageFile.id, imageContent);
        setSavedFileId(linkedImageFile.id);
        hasLoadedLinkedFileRef.current = true;
        markSavedChanges();
        playSound('save');
        await showSaveSuccess(linkedImageFile.name);
        return true;
      }

      const conflictNode = findNameConflict(nodes, saveData.folderId, fileName, linkedImageFile?.id);
      const conflictChoice = await resolveSaveConflict({
        conflictNode,
        fileName,
        showChoiceDialog,
        title: 'Guardar imagen',
      });

      if (conflictChoice === 'cancel') {
        return false;
      }

      const fileId = conflictChoice === 'overwrite' && conflictNode?.type === 'file'
        ? conflictNode.id
        : await createFileAsync(saveData.folderId, fileName, imageContent);

      if (conflictChoice === 'overwrite' && conflictNode?.type === 'file') {
        await updateFileContentAsync(conflictNode.id, imageContent);
      }

      const savedFile = getNode(fileId);

      setSavedFileId(fileId);
      hasLoadedLinkedFileRef.current = true;
      markSavedChanges();
      playSound('save');
      await showSaveSuccess(savedFile?.name ?? fileName);
      return true;
    } catch (error) {
      playSound('error');
      await showSaveError(error);
      return false;
    }
  }, [
    commitTextDraft,
    createFileAsync,
    getNode,
    linkedImageFile,
    markSavedChanges,
    nodes,
    playSound,
    showChoiceDialog,
    showSaveError,
    showSaveFileDialog,
    showSaveSuccess,
    updateFileContentAsync,
  ]);

  useEffect(() => {
    saveCanvasToRosoOsRef.current = saveCanvasToRosoOs;
  }, [saveCanvasToRosoOs]);

  const resolveUnsavedChanges = useCallback(async () => {
    commitTextDraft();

    if (!hasUnsavedChangesRef.current || isClosePromptOpenRef.current) {
      return !hasUnsavedChangesRef.current;
    }

    isClosePromptOpenRef.current = true;

    try {
      const canOverwriteLinkedFile = Boolean(linkedImageFileRef.current);
      const choice = await showChoiceDialog({
        title: 'Paint',
        message: 'Quieres guardar los cambios del dibujo?',
        detail: 'Si cierras o reemplazas el lienzo sin guardar, los cambios recientes se perderan.',
        icon: 'warning',
        cancelValue: 'cancel',
        choices: [
          { label: 'Guardar', value: 'save', autoFocus: true },
          ...(canOverwriteLinkedFile ? [{ label: 'Guardar como', value: 'saveAs' }] : []),
          { label: 'No guardar', value: 'discard' },
          { label: 'Cancelar', value: 'cancel' },
        ],
      });

      if (choice === 'discard') {
        return true;
      }

      if (choice === 'save') {
        return Boolean(await saveCanvasToRosoOsRef.current?.());
      }

      if (choice === 'saveAs') {
        return Boolean(await saveCanvasToRosoOsRef.current?.(true));
      }

      return false;
    } finally {
      isClosePromptOpenRef.current = false;
    }
  }, [commitTextDraft, showChoiceDialog]);

  useEffect(() => {
    if (!windowId) {
      return undefined;
    }

    return registerBeforeClose(windowId, resolveUnsavedChanges);
  }, [registerBeforeClose, resolveUnsavedChanges, windowId]);

  useEffect(() => {
    if (!windowId) {
      return undefined;
    }

    const handlePaintFileDrop = async (event) => {
      if (event.detail?.windowId !== windowId) {
        return;
      }

      const droppedNode = useFileSystemStore.getState().getNode(event.detail?.nodeId);

      if (droppedNode?.type !== 'file' || !isImageFileName(droppedNode.name)) {
        return;
      }

      const canReplaceCanvas = await resolveUnsavedChanges();

      if (canReplaceCanvas) {
        await loadImageFileIntoPaint(droppedNode);
      }
    };

    window.addEventListener(paintFileDropEventName, handlePaintFileDrop);
    return () => window.removeEventListener(paintFileDropEventName, handlePaintFileDrop);
  }, [loadImageFileIntoPaint, resolveUnsavedChanges, windowId]);

  const selectTool = (tool) => {
    if (disabledPaintTools.has(tool)) {
      return;
    }

    setActiveTool(tool);
    playSound('click');
  };

  const selectColor = (color) => {
    const nextColor = normalizeHexColor(color);

    if (!nextColor) {
      playSound('error');
      return;
    }

    setActiveColor(nextColor);
    setHexColor(nextColor);
    setActiveTool((currentTool) =>
      currentTool === 'eraser' || disabledPaintTools.has(currentTool) ? 'pencil' : currentTool,
    );
    playSound('click');
  };

  const handleHexColorChange = (value) => {
    setHexColor(value);

    const nextColor = normalizeHexColor(value);

    if (nextColor) {
      setActiveColor(nextColor);
      setActiveTool((currentTool) =>
        currentTool === 'eraser' || disabledPaintTools.has(currentTool) ? 'pencil' : currentTool,
      );
    }
  };

  const commitHexColor = () => {
    const nextColor = normalizeHexColor(hexColor);

    if (!nextColor) {
      setHexColor(activeColor);
      playSound('error');
      return;
    }

    selectColor(nextColor);
  };

  const focusPaint = (event) => {
    if (isEditableTarget(event.target) || isTextEditorTarget(event.target)) {
      return;
    }

    appRef.current?.focus({ preventScroll: true });
  };

  const handlePaintKeyDown = (event) => {
    if (isEditableTarget(event.target)) {
      return;
    }

    if (
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z'
    ) {
      event.preventDefault();
      undoLastAction();
    }
  };

  const visibleTextDraft = isTextToolEnabled ? textDraft : null;
  const textDraftInputWidth = visibleTextDraft ? visibleTextDraft.inputWidth ?? visibleTextDraft.minInputWidth : 0;
  const textDraftInputHeight = visibleTextDraft ? visibleTextDraft.inputHeight ?? visibleTextDraft.lineHeight * 3 : 0;
  const textDraftHasHiddenContent = isTextDraftOverflowing(visibleTextDraft);

  return (
    <div
      className="ros-paint-app"
      ref={appRef}
      tabIndex={0}
      onKeyDown={handlePaintKeyDown}
      onPointerDownCapture={focusPaint}
    >
      <div className="ros-app-toolbar ros-paint-toolbar" aria-label="Herramientas de Paint">
        <div className="ros-paint-tool-group" role="group" aria-label="Herramientas">
          {enabledToolEntries.map(([tool, label]) => (
            <button
              className="ros-app-toolbar-button ros-paint-tool-button"
              data-active={resolvedActiveTool === tool ? 'true' : 'false'}
              key={tool}
              type="button"
              aria-pressed={resolvedActiveTool === tool}
              onClick={() => selectTool(tool)}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="ros-app-toolbar-separator" aria-hidden="true" />

        <div className="ros-paint-palette" role="group" aria-label="Colores">
          {paintColors.map((color) => (
            <button
              className="ros-paint-color"
              data-active={activeColor === color && resolvedActiveTool !== 'eraser' ? 'true' : 'false'}
              key={color}
              type="button"
              style={{ backgroundColor: color }}
              aria-label={`Color ${color}`}
              onClick={() => selectColor(color)}
            />
          ))}
        </div>

        <label className="ros-paint-custom-color">
          <span>Hex</span>
          <input
            className="ros-paint-native-color"
            type="color"
            value={activeColor}
            aria-label="Elegir color"
            onChange={(event) => selectColor(event.target.value)}
          />
          <input
            className="ros-paint-hex-input"
            value={hexColor}
            spellCheck="false"
            aria-label="Color hexadecimal"
            onBlur={commitHexColor}
            onChange={(event) => handleHexColorChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitHexColor();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                setHexColor(activeColor);
              }
            }}
          />
        </label>

        {resolvedActiveTool === 'text' ? (
          <div
            className="ros-paint-text-controls"
            data-paint-text-controls="true"
            role="group"
            aria-label="Opciones de texto"
            onBlur={handleTextEditorBlur}
          >
            <label>
              <span>Fuente</span>
              <select
                value={textFontFamily}
                aria-label="Fuente de texto"
                onChange={(event) => {
                  const nextFontFamily = event.target.value;

                  setTextFontFamily(nextFontFamily);
                  updateTextDraftStyle({ fontFamily: nextFontFamily });
                  playSound('click');
                  focusTextInputSoon();
                }}
              >
                {textFontOptions.map((font) => (
                  <option key={font.label} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Tamano</span>
              <input
                type="number"
                min={minTextSize}
                max={maxTextSize}
                value={textSizeDraft}
                aria-label="Tamano de texto"
                onBlur={(event) => applyTextSize(event.currentTarget.value)}
                onChange={(event) => setTextSizeDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyTextSize(event.currentTarget.value, true);
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setTextSizeDraft(String(textSize));
                    focusTextInputSoon();
                  }
                }}
              />
            </label>

            <button
              className="ros-app-toolbar-button ros-paint-format-button"
              data-active={isTextBold ? 'true' : 'false'}
              type="button"
              aria-pressed={isTextBold}
              onClick={() => {
                const nextIsBold = !isTextBold;

                setIsTextBold(nextIsBold);
                updateTextDraftStyle({ isBold: nextIsBold });
                playSound('click');
                focusTextInputSoon();
              }}
            >
              B
            </button>

            <button
              className="ros-app-toolbar-button ros-paint-format-button"
              data-active={isTextItalic ? 'true' : 'false'}
              type="button"
              aria-pressed={isTextItalic}
              onClick={() => {
                const nextIsItalic = !isTextItalic;

                setIsTextItalic(nextIsItalic);
                updateTextDraftStyle({ isItalic: nextIsItalic });
                playSound('click');
                focusTextInputSoon();
              }}
            >
              I
            </button>
          </div>
        ) : (
          <label className="ros-paint-size-control">
            <span>Grosor</span>
            <input
              type="range"
              min="1"
              max="24"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
            <strong>{brushSize}px</strong>
          </label>
        )}

        <div className="ros-paint-zoom-control" role="group" aria-label="Zoom">
          <button
            className="ros-app-toolbar-button ros-paint-zoom-step-button"
            type="button"
            disabled={!canZoomOut}
            aria-label="Alejar"
            onClick={() => stepManualZoom(-1)}
          >
            -
          </button>
          <input
            className="ros-paint-zoom-slider"
            type="range"
            min={minZoomPercent}
            max={maxZoomPercent}
            step={zoomSliderStep}
            value={zoomSliderValue}
            aria-label="Nivel de zoom"
            onChange={(event) =>
              setManualZoom(event.target.value, {
                playSound: false,
              })
            }
          />
          <button
            className="ros-app-toolbar-button ros-paint-zoom-step-button"
            type="button"
            disabled={!canZoomIn}
            aria-label="Acercar"
            onClick={() => stepManualZoom(1)}
          >
            +
          </button>
          <strong className="ros-paint-zoom-value">
            {zoomMode === 'fit' ? `${effectiveZoomPercent}%` : `${zoomPercent}%`}
          </strong>
          {zoomPresets.map((preset) => (
            <button
              className="ros-app-toolbar-button ros-paint-zoom-button"
              data-active={zoomMode === 'manual' && zoomPercent === preset ? 'true' : 'false'}
              key={preset}
              type="button"
              aria-pressed={zoomMode === 'manual' && zoomPercent === preset}
              onClick={() => setManualZoom(preset)}
            >
              {preset}%
            </button>
          ))}
          <button
            className="ros-app-toolbar-button ros-paint-zoom-button"
            data-active={zoomMode === 'fit' ? 'true' : 'false'}
            type="button"
            aria-pressed={zoomMode === 'fit'}
            onClick={setFitZoom}
          >
            Ajustar
          </button>
        </div>

        <div className="ros-paint-canvas-size-control" role="group" aria-label="Tamano del lienzo">
          <span>Lienzo</span>
          <input
            type="number"
            min={minCanvasSize.width}
            max={maxCanvasSize.width}
            value={canvasSizeDraft.width}
            aria-label="Ancho del lienzo"
            onChange={(event) =>
              setCanvasSizeDraft((currentDraft) => ({ ...currentDraft, width: event.target.value }))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyCanvasSize();
              }
            }}
          />
          <span>x</span>
          <input
            type="number"
            min={minCanvasSize.height}
            max={maxCanvasSize.height}
            value={canvasSizeDraft.height}
            aria-label="Alto del lienzo"
            onChange={(event) =>
              setCanvasSizeDraft((currentDraft) => ({ ...currentDraft, height: event.target.value }))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyCanvasSize();
              }
            }}
          />
          <button className="ros-app-toolbar-button" type="button" onClick={applyCanvasSize}>
            Aplicar
          </button>
        </div>

        <span className="ros-app-toolbar-separator" aria-hidden="true" />

        <button className="ros-app-toolbar-button" type="button" onClick={() => void saveCanvasToRosoOs()}>
          Guardar
        </button>

        <button className="ros-app-toolbar-button" type="button" onClick={() => void saveCanvasToRosoOs(true)}>
          Guardar como
        </button>

        <button className="ros-app-toolbar-button" type="button" disabled={!canUndo} onClick={undoLastAction}>
          Deshacer
        </button>

        <button className="ros-app-toolbar-button" type="button" onClick={clearCanvas}>
          Limpiar
        </button>
      </div>

      <div className="ros-paint-workspace">
        <div
          className="ros-paint-canvas-frame"
          data-paint-drop-window-id={windowId}
          ref={viewportRef}
          onWheel={handleZoomWheel}
        >
          <div
            className="ros-paint-canvas-surface"
            style={{
              width: `${Math.max(1, Math.round(canvasSize.width * effectiveZoom))}px`,
              height: `${Math.max(1, Math.round(canvasSize.height * effectiveZoom))}px`,
            }}
          >
            <canvas
              className="ros-paint-canvas"
              data-tool={resolvedActiveTool}
              ref={canvasRef}
              style={resolvedActiveTool !== 'eraser' ? { cursor: getCanvasCursor(resolvedActiveTool, activeColor) } : undefined}
              aria-label="Lienzo de Paint"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
            />
            {visibleTextDraft ? (
              <div
                className="ros-paint-text-box"
                data-overflowing={textDraftHasHiddenContent ? 'true' : 'false'}
                data-paint-text-box="true"
                style={{
                  left: `${visibleTextDraft.x * effectiveZoom}px`,
                  top: `${visibleTextDraft.y * effectiveZoom}px`,
                  width: `${textDraftInputWidth * effectiveZoom}px`,
                  height: `${textDraftInputHeight * effectiveZoom}px`,
                }}
              >
                <textarea
                  className="ros-paint-text-input"
                  ref={textInputRef}
                  value={visibleTextDraft.value}
                  spellCheck="false"
                  rows={Math.max(3, String(visibleTextDraft.value ?? '').replace(/\r\n/g, '\n').split('\n').length)}
                  style={{
                    padding: `${textInputPadding.y * effectiveZoom}px ${textInputPadding.x * effectiveZoom}px`,
                    color: visibleTextDraft.color,
                    fontFamily: visibleTextDraft.fontFamily,
                    fontStyle: visibleTextDraft.isItalic ? 'italic' : 'normal',
                    fontWeight: visibleTextDraft.isBold ? 700 : 400,
                    fontSize: `${visibleTextDraft.fontSize * effectiveZoom}px`,
                    lineHeight: `${Math.round(visibleTextDraft.lineHeight * effectiveZoom)}px`,
                  }}
                  aria-label="Texto para insertar"
                  onBlur={handleTextEditorBlur}
                  onChange={(event) => {
                    const currentDraft = textDraftRef.current;

                    if (!currentDraft) {
                      return;
                    }

                    const nextDraft = { ...currentDraft, value: event.target.value };

                    textDraftRef.current = nextDraft;
                    setTextDraft(nextDraft);
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();

                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      commitTextDraft();
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelTextDraft();
                    }
                  }}
                />
                <button
                  className="ros-paint-text-resize-handle"
                  type="button"
                  aria-label="Redimensionar caja de texto"
                  tabIndex={-1}
                  onPointerDown={startTextBoxResize}
                  onPointerMove={resizeTextBox}
                  onPointerUp={stopTextBoxResize}
                  onPointerCancel={stopTextBoxResize}
                  onLostPointerCapture={stopTextBoxResize}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ros-paint-status" aria-live="polite">
        <span>{toolLabels[resolvedActiveTool]}</span>
        <span>{resolvedActiveTool === 'eraser' ? 'Blanco' : activeColor}</span>
        <span>{resolvedActiveTool === 'text' ? `${textSize}px` : `${brushSize}px`}</span>
        <span>{`${canvasSize.width} x ${canvasSize.height}`}</span>
        <span>{zoomMode === 'fit' ? `Ajustar ${effectiveZoomPercent}%` : `${zoomPercent}%`}</span>
        <span>{linkedImageFile?.name ?? 'Sin titulo'}</span>
        <span>{hasUnsavedChanges ? 'Sin guardar' : 'Guardado'}</span>
      </div>
    </div>
  );
}
