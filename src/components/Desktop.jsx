import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDesktopApps } from '../apps/appRegistry.js';
import { findNextDesktopPosition, getDesktopGridPosition, snapDesktopPosition } from '../services/desktopLayout.js';
import { dispatchPaintFileDrop, getFileDropTargetFromPoint } from '../services/fileDropTargets.js';
import { getNodeIconTone, isImageFileName, isTextFileName } from '../services/fileIcons.js';
import { getEditableNodeName } from '../services/fileNames.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useDialogStore } from '../store/useDialogStore.js';
import { useDesktopLayoutStore } from '../store/useDesktopLayoutStore.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';
import { DesktopContextMenu } from './DesktopContextMenu.jsx';
import { DesktopIcon } from './DesktopIcon.jsx';
import { WindowManager } from './WindowManager.jsx';

const CONTEXT_MENU_WIDTH = 214;
const CONTEXT_MENU_ITEM_HEIGHT = 28;
const TASKBAR_HEIGHT = 40;
const DESKTOP_ICON_WIDTH = 78;
const DESKTOP_ICON_HEIGHT = 74;
const SELECTION_DRAG_THRESHOLD = 4;
const desktopFolderId = 'desktop-folder';
const recycleBinFolderId = 'recycle-bin-folder';
const protectedNodeIds = new Set(['root', 'documents', desktopFolderId, 'system-folder', recycleBinFolderId]);

const isTextEntryElement = (target) =>
  target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

const isNodeInsideTrash = (nodes, nodeId) => {
  let currentNode = nodes.find((node) => node.id === nodeId);

  while (currentNode) {
    if (currentNode.parentId === recycleBinFolderId) {
      return true;
    }

    currentNode = nodes.find((node) => node.id === currentNode.parentId);
  }

  return false;
};

const getDescendantIds = (nodes, nodeId) => {
  const directChildren = nodes.filter((node) => node.parentId === nodeId);

  return directChildren.flatMap((child) => [child.id, ...getDescendantIds(nodes, child.id)]);
};

const clearActiveFileDropTargets = () => {
  document
    .querySelectorAll("[data-file-drop-active='true']")
    .forEach((element) => {
      element.dataset.fileDropActive = 'false';
    });
};

const desktopAppIcons = getDesktopApps().map((app) => ({
  id: `app:${app.id}`,
  label: app.title,
  tone: app.iconTone,
  appId: app.id,
  kind: 'app',
  description: app.description,
}));

const staticDesktopIcons = [
  { id: 'static:documents', label: 'Mis documentos', tone: 'folder', folderId: 'documents', kind: 'folder-shortcut' },
  { id: 'static:portfolio', label: 'Portfolio', tone: 'screen', kind: 'static' },
  { id: 'static:recycle-bin', label: 'Papelera', tone: 'trash', folderId: 'recycle-bin-folder', kind: 'recycle-bin' },
];

const sortDesktopNodes = (nodes) =>
  [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }

    return a.name.localeCompare(b.name, 'es');
  });

const getMenuPosition = (event, itemCount) => ({
  x: Math.max(4, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 8)),
  y: Math.max(4, Math.min(event.clientY, window.innerHeight - TASKBAR_HEIGHT - itemCount * CONTEXT_MENU_ITEM_HEIGHT - 10)),
});

const getSelectionBoxRect = (selectionBox) => {
  const left = Math.min(selectionBox.start.x, selectionBox.current.x);
  const top = Math.min(selectionBox.start.y, selectionBox.current.y);
  const right = Math.max(selectionBox.start.x, selectionBox.current.x);
  const bottom = Math.max(selectionBox.start.y, selectionBox.current.y);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

const getIconBounds = (position) => ({
  left: position.x,
  top: position.y,
  right: position.x + DESKTOP_ICON_WIDTH,
  bottom: position.y + DESKTOP_ICON_HEIGHT,
});

const doRectsIntersect = (firstRect, secondRect) =>
  firstRect.left <= secondRect.right &&
  firstRect.right >= secondRect.left &&
  firstRect.top <= secondRect.bottom &&
  firstRect.bottom >= secondRect.top;

const getDesktopPoint = (event, desktopRect) => ({
  x: Math.max(0, Math.min(event.clientX - desktopRect.left, desktopRect.width)),
  y: Math.max(0, Math.min(event.clientY - desktopRect.top, desktopRect.height)),
});

export function Desktop() {
  const [contextMenu, setContextMenu] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const [draggingIconIds, setDraggingIconIds] = useState([]);
  const [editingIconId, setEditingIconId] = useState(null);
  const [selectedIconIds, setSelectedIconIds] = useState([]);
  const [selectionBox, setSelectionBox] = useState(null);
  const didIconDragRef = useRef(false);
  const didMarqueeSelectRef = useRef(false);
  const nodes = useFileSystemStore((state) => state.nodes);
  const closeStartMenu = useUiStore((state) => state.closeStartMenu);
  const wallpaper = useUiStore((state) => state.wallpaper);
  const clipboard = useFileSystemStore((state) => state.clipboard);
  const createDesktopFolder = useFileSystemStore((state) => state.createDesktopFolder);
  const createDesktopTextFile = useFileSystemStore((state) => state.createDesktopTextFile);
  const duplicateNode = useFileSystemStore((state) => state.duplicateNode);
  const emptyTrash = useFileSystemStore((state) => state.emptyTrash);
  const moveNodeToTrash = useFileSystemStore((state) => state.moveNodeToTrash);
  const moveNodesToTrash = useFileSystemStore((state) => state.moveNodesToTrash);
  const moveNodesToFolder = useFileSystemStore((state) => state.moveNodesToFolder);
  const pasteClipboardToFolder = useFileSystemStore((state) => state.pasteClipboardToFolder);
  const renameNode = useFileSystemStore((state) => state.renameNode);
  const restoreAllFromTrash = useFileSystemStore((state) => state.restoreAllFromTrash);
  const setClipboard = useFileSystemStore((state) => state.setClipboard);
  const showConfirm = useDialogStore((state) => state.showConfirm);
  const iconPositions = useDesktopLayoutStore((state) => state.iconPositions);
  const ensureIconPositions = useDesktopLayoutStore((state) => state.ensureIconPositions);
  const isDesktopLayoutReady = useDesktopLayoutStore((state) => state.isReady);
  const resetIconPositions = useDesktopLayoutStore((state) => state.resetIconPositions);
  const setIconPosition = useDesktopLayoutStore((state) => state.setIconPosition);
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();
  const recycleBinItemsCount = nodes.filter((node) => node.parentId === recycleBinFolderId).length;
  const clipboardNodeIds = clipboard?.nodeIds ?? (clipboard?.nodeId ? [clipboard.nodeId] : []);
  const clipboardNodes = clipboardNodeIds.map((nodeId) => nodes.find((node) => node.id === nodeId)).filter(Boolean);
  const canPasteToDesktop = Boolean(
    clipboardNodeIds.length > 0 &&
      clipboardNodes.length === clipboardNodeIds.length &&
      clipboardNodes.every((node) => !isNodeInsideTrash(nodes, node.id)),
  );
  const staticIcons = useMemo(
    () =>
      staticDesktopIcons.map((icon) =>
        icon.kind === 'recycle-bin'
          ? {
              ...icon,
              description:
                recycleBinItemsCount === 0
                  ? 'Papelera vacia'
                  : `${recycleBinItemsCount} elemento${recycleBinItemsCount === 1 ? '' : 's'} eliminado${recycleBinItemsCount === 1 ? '' : 's'}`,
              tone: recycleBinItemsCount === 0 ? 'trash' : 'trash-full',
            }
          : icon,
      ),
    [recycleBinItemsCount],
  );

  const desktopFileIcons = useMemo(
    () =>
      sortDesktopNodes(nodes.filter((node) => node.parentId === desktopFolderId)).map((node) => ({
        id: `fs:${node.id}`,
        label: node.name,
        tone: getNodeIconTone(node),
        kind: node.type,
        node,
      })),
    [nodes],
  );
  const desktopIcons = useMemo(
    () => [...desktopAppIcons, ...desktopFileIcons, ...staticIcons],
    [desktopFileIcons, staticIcons],
  );
  const selectedIconIdSet = useMemo(() => new Set(selectedIconIds), [selectedIconIds]);
  const selectedIcons = useMemo(
    () => desktopIcons.filter((icon) => selectedIconIdSet.has(icon.id)),
    [desktopIcons, selectedIconIdSet],
  );
  const selectedIcon = selectedIcons.length === 1 ? selectedIcons[0] : null;
  const contextTargetIcon = desktopIcons.find((icon) => icon.id === contextMenu?.iconId) ?? null;

  const clearIconSelection = useCallback(() => setSelectedIconIds([]), []);

  const selectSingleIcon = useCallback((iconId) => {
    setSelectedIconIds(iconId ? [iconId] : []);
  }, []);

  const toggleIconSelection = useCallback((iconId) => {
    setSelectedIconIds((currentIconIds) =>
      currentIconIds.includes(iconId)
        ? currentIconIds.filter((selectedId) => selectedId !== iconId)
        : [...currentIconIds, iconId],
    );
  }, []);

  useEffect(() => {
    if (!isDesktopLayoutReady) {
      return;
    }

    ensureIconPositions(desktopIcons.map((icon) => icon.id));
  }, [desktopIcons, ensureIconPositions, iconPositions, isDesktopLayoutReady]);

  const getDisplayedIconPosition = useCallback((iconId, index) => {
    if (dragPreview?.positions?.[iconId]) {
      return dragPreview.positions[iconId];
    }

    return iconPositions[iconId] ?? getDesktopGridPosition(index);
  }, [dragPreview, iconPositions]);

  const getDisplayedIconPositions = useCallback(() =>
    desktopIcons.reduce((positions, icon, index) => {
      positions[icon.id] = getDisplayedIconPosition(icon.id, index);
      return positions;
    }, {}), [desktopIcons, getDisplayedIconPosition]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const canDropNodeToFolder = useCallback((sourceNode, targetFolderId) => {
    const targetFolder = nodes.find((node) => node.id === targetFolderId && node.type === 'folder');

    if (!sourceNode || !targetFolder || protectedNodeIds.has(sourceNode.id)) {
      return false;
    }

    if (isNodeInsideTrash(nodes, sourceNode.id)) {
      return false;
    }

    if (targetFolder.id === recycleBinFolderId) {
      return true;
    }

    if (isNodeInsideTrash(nodes, targetFolder.id)) {
      return false;
    }

    if (
      sourceNode.type === 'folder' &&
      (sourceNode.id === targetFolder.id || getDescendantIds(nodes, sourceNode.id).includes(targetFolder.id))
    ) {
      return false;
    }

    return true;
  }, [nodes]);

  const canDropNodesToPaint = useCallback((items) =>
    items.length === 1 &&
    items[0].type === 'file' &&
    isImageFileName(items[0].name) &&
    !isNodeInsideTrash(nodes, items[0].id), [nodes]);

  const getDropFolderLabel = useCallback((folderId) => {
    if (folderId === desktopFolderId) {
      return 'Escritorio';
    }

    if (folderId === recycleBinFolderId) {
      return 'Papelera';
    }

    return nodes.find((node) => node.id === folderId)?.name ?? 'carpeta';
  }, [nodes]);

  const getDragDropFeedback = useCallback((dropTarget, isValidDropTarget, isFileDrag) => {
    if (!isFileDrag) {
      return { state: 'neutral', label: 'Mover icono' };
    }

    if (!dropTarget) {
      return { state: 'neutral', label: 'Soltar para reubicar' };
    }

    if (!isValidDropTarget) {
      return { state: 'invalid', label: 'No se puede soltar aqui' };
    }

    if (dropTarget.type === 'paint') {
      return { state: 'valid', label: 'Editar en Paint' };
    }

    if (dropTarget.folderId === recycleBinFolderId) {
      return { state: 'valid', label: 'Enviar a Papelera' };
    }

    return { state: 'valid', label: `Mover a ${getDropFolderLabel(dropTarget.folderId)}` };
  }, [getDropFolderLabel]);

  const openDesktopIcon = (icon) => {
    closeContextMenu();
    closeStartMenu();

    if (icon.appId) {
      openApp(icon.appId);
      playSound('open');
      return;
    }

    if (icon.folderId) {
      openApp('explorer', { folderId: icon.folderId });
      playSound('open');
      return;
    }

    if (icon.node?.type === 'folder') {
      openApp('explorer', { folderId: icon.node.id });
      playSound('open');
      return;
    }

    if (icon.node?.type === 'file' && isTextFileName(icon.node.name)) {
      openApp('notepad', { fileId: icon.node.id });
      playSound('open');
      return;
    }

    if (icon.node?.type === 'file' && isImageFileName(icon.node.name)) {
      openApp('image-viewer', { fileId: icon.node.id });
      playSound('open');
    }
  };

  const openProperties = (icon) => {
    closeContextMenu();
    closeStartMenu();

    if (!icon) {
      openApp('properties', { nodeId: 'desktop-folder' });
      playSound('open');
      return;
    }

    if (icon.node) {
      openApp('properties', { nodeId: icon.node.id });
      playSound('open');
      return;
    }

    if (icon.folderId) {
      openApp('properties', { nodeId: icon.folderId });
      playSound('open');
      return;
    }

    openApp('properties', {
      shortcut: {
        name: icon.label,
        description: icon.description ?? 'Elemento del escritorio',
        kind: icon.kind,
      },
    });
    playSound('open');
  };

  const beginRename = useCallback((icon) => {
    if (!icon?.node) {
      return;
    }

    closeContextMenu();
    selectSingleIcon(icon.id);
    setEditingIconId(icon.id);
    setDraftName(getEditableNodeName(icon.node).baseName);
    playSound('click');
  }, [closeContextMenu, playSound, selectSingleIcon]);

  const cancelRename = useCallback(() => {
    setEditingIconId(null);
    setDraftName('');
  }, []);

  const commitRename = () => {
    const icon = desktopIcons.find((desktopIcon) => desktopIcon.id === editingIconId);

    if (icon?.node && draftName.trim()) {
      renameNode(icon.node.id, draftName);
      playSound('rename');
    }

    cancelRename();
  };

  const placeCreatedIcon = (nodeId) => {
    if (!nodeId) {
      return;
    }

    const createdIconId = `fs:${nodeId}`;
    const existingIconPositions = getDisplayedIconPositions();
    const nextPosition = findNextDesktopPosition(desktopIcons.map((icon) => icon.id), existingIconPositions);
    const createdNode = useFileSystemStore.getState().getNode(nodeId);

    setIconPosition(createdIconId, nextPosition);
    selectSingleIcon(createdIconId);
    setEditingIconId(createdIconId);
    setDraftName(getEditableNodeName(createdNode).baseName);
  };

  const placePastedIcon = useCallback((nodeId) => {
    if (!nodeId) {
      return;
    }

    const pastedNode = useFileSystemStore.getState().getNode(nodeId);

    if (pastedNode?.parentId !== desktopFolderId) {
      return;
    }

    const pastedIconId = `fs:${nodeId}`;
    const existingIconPositions = getDisplayedIconPositions();
    const nextPosition = findNextDesktopPosition(desktopIcons.map((icon) => icon.id), existingIconPositions);

    setIconPosition(pastedIconId, nextPosition);
    selectSingleIcon(pastedIconId);
  }, [desktopIcons, getDisplayedIconPositions, selectSingleIcon, setIconPosition]);

  const placePastedIcons = useCallback((nodeIds) => {
    const pastedNodeIds = Array.isArray(nodeIds) ? nodeIds : nodeIds ? [nodeIds] : [];

    if (pastedNodeIds.length === 0) {
      return;
    }

    let existingIconPositions = getDisplayedIconPositions();
    const existingIconIds = desktopIcons.map((icon) => icon.id);
    const pastedIconIds = [];

    pastedNodeIds.forEach((nodeId) => {
      const pastedNode = useFileSystemStore.getState().getNode(nodeId);

      if (pastedNode?.parentId !== desktopFolderId) {
        return;
      }

      const pastedIconId = `fs:${nodeId}`;
      const nextPosition = findNextDesktopPosition(existingIconIds, existingIconPositions);
      existingIconIds.push(pastedIconId);
      existingIconPositions = {
        ...existingIconPositions,
        [pastedIconId]: nextPosition,
      };
      setIconPosition(pastedIconId, nextPosition);
      pastedIconIds.push(pastedIconId);
    });

    if (pastedIconIds.length > 0) {
      setSelectedIconIds(pastedIconIds);
    }
  }, [desktopIcons, getDisplayedIconPositions, setIconPosition]);

  const handleCreateFolder = () => {
    closeContextMenu();
    placeCreatedIcon(createDesktopFolder());
    playSound('open');
  };

  const handleCreateTextFile = () => {
    closeContextMenu();
    placeCreatedIcon(createDesktopTextFile());
    playSound('open');
  };

  const handleCopyIcon = useCallback((icon) => {
    if (!icon?.node || !setClipboard('copy', icon.node.id)) {
      return;
    }

    closeContextMenu();
    selectSingleIcon(icon.id);
    playSound('click');
  }, [closeContextMenu, playSound, selectSingleIcon, setClipboard]);

  const handleCutIcon = useCallback((icon) => {
    if (!icon?.node || !setClipboard('cut', icon.node.id)) {
      return;
    }

    closeContextMenu();
    selectSingleIcon(icon.id);
    playSound('click');
  }, [closeContextMenu, playSound, selectSingleIcon, setClipboard]);

  const handleDuplicateIcon = (icon) => {
    if (!icon?.node) {
      return;
    }

    closeContextMenu();
    const duplicatedNodeId = duplicateNode(icon.node.id);
    placePastedIcon(duplicatedNodeId);

    if (duplicatedNodeId) {
      playSound('click');
    }
  };

  const handlePasteToFolder = useCallback((folderId = desktopFolderId) => {
    closeContextMenu();

    if (!canPasteToDesktop) {
      return;
    }

    const wasCutOnlyOnDesktop =
      clipboard?.operation === 'cut' &&
      clipboardNodes.length > 0 &&
      clipboardNodes.every((node) => node.parentId === desktopFolderId);
    const pastedNodeIds = pasteClipboardToFolder(folderId);

    if (folderId === desktopFolderId && !wasCutOnlyOnDesktop) {
      placePastedIcons(pastedNodeIds);
    }

    if (pastedNodeIds.length > 0) {
      playSound('click');
    }
  }, [
    canPasteToDesktop,
    clipboard?.operation,
    clipboardNodes,
    closeContextMenu,
    pasteClipboardToFolder,
    placePastedIcons,
    playSound,
  ]);

  const handleMoveToTrash = useCallback((icon) => {
    if (!icon?.node) {
      return;
    }

    closeContextMenu();
    const movedIds = moveNodeToTrash(icon.node.id);

    if (movedIds.length > 0) {
      clearIconSelection();
      playSound('trash');
    }
  }, [clearIconSelection, closeContextMenu, moveNodeToTrash, playSound]);

  const getElementCountLabel = (items) =>
    `${items.length} elemento${items.length === 1 ? '' : 's'}`;

  const confirmMoveNodesToTrash = useCallback(async (items) => {
    if (items.length === 0) {
      return false;
    }

    return showConfirm({
      title: 'Mover a Papelera',
      message:
        items.length === 1
          ? `Mover "${items[0].name}" a la Papelera?`
          : `Mover ${getElementCountLabel(items)} a la Papelera?`,
      detail: 'Podras restaurarlo desde la Papelera si lo necesitas.',
      confirmLabel: 'Mover',
      icon: 'warning',
    });
  }, [showConfirm]);

  const handleEmptyTrash = async () => {
    closeContextMenu();

    if (recycleBinItemsCount === 0) {
      return;
    }

    const confirmed = await showConfirm({
      title: 'Vaciar Papelera',
      message: 'Eliminar permanentemente todos los elementos de la Papelera?',
      detail: 'Todos los archivos de la Papelera se borraran de forma definitiva.',
      confirmLabel: 'Vaciar',
      icon: 'warning',
    });

    if (confirmed) {
      emptyTrash();
      playSound('delete');
    }
  };

  const handleRestoreAllTrash = async () => {
    closeContextMenu();

    if (recycleBinItemsCount === 0) {
      return;
    }

    const confirmed = await showConfirm({
      title: 'Restaurar todos',
      message: `Restaurar ${recycleBinItemsCount} elemento${recycleBinItemsCount === 1 ? '' : 's'} de la Papelera?`,
      detail: 'Los elementos volveran a su ubicacion original. Si ya no existe, se restauraran en el Escritorio.',
      confirmLabel: 'Restaurar',
      icon: 'question',
    });

    if (confirmed) {
      restoreAllFromTrash();
      playSound('restoreFile');
    }
  };

  const handleArrangeByName = () => {
    closeContextMenu();
    resetIconPositions(
      [...desktopIcons]
        .sort((firstIcon, secondIcon) => firstIcon.label.localeCompare(secondIcon.label, 'es'))
        .map((icon) => icon.id),
    );
    playSound('click');
  };

  const handleRefresh = useCallback(() => {
    closeContextMenu();
    playSound('click');
  }, [closeContextMenu, playSound]);

  const getIconIdsInsideSelectionBox = useCallback((nextSelectionBox) => {
    const selectionRect = getSelectionBoxRect(nextSelectionBox);
    const iconPositionMap = getDisplayedIconPositions();

    return desktopIcons
      .filter((icon, index) => {
        const iconPosition = iconPositionMap[icon.id] ?? getDesktopGridPosition(index);
        return doRectsIntersect(selectionRect, getIconBounds(iconPosition));
      })
      .map((icon) => icon.id);
  }, [desktopIcons, getDisplayedIconPositions]);

  const getContextMenuItems = () => {
    const wrap = (callback) => () => callback();

    if (contextMenu?.type === 'desktop') {
      return [
        { id: 'new-folder', label: 'Nueva carpeta', onSelect: wrap(handleCreateFolder) },
        { id: 'new-text-file', label: 'Nuevo documento de texto', onSelect: wrap(handleCreateTextFile) },
        { id: 'separator-create', type: 'separator' },
        {
          id: 'paste-desktop',
          label: 'Pegar',
          hint: 'Ctrl+V',
          disabled: !canPasteToDesktop,
          onSelect: wrap(() => handlePasteToFolder(desktopFolderId)),
        },
        { id: 'separator-clipboard', type: 'separator' },
        { id: 'sort-name', label: 'Ordenar por nombre', onSelect: wrap(handleArrangeByName) },
        { id: 'refresh', label: 'Actualizar', hint: 'F5', onSelect: wrap(handleRefresh) },
        { id: 'separator-properties', type: 'separator' },
        { id: 'desktop-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(null)) },
      ];
    }

    if (contextTargetIcon?.kind === 'recycle-bin') {
      return [
        { id: 'open-recycle', label: 'Abrir', onSelect: wrap(() => openDesktopIcon(contextTargetIcon)) },
        {
          id: 'restore-all-recycle',
          label: 'Restaurar todos',
          disabled: recycleBinItemsCount === 0,
          onSelect: wrap(handleRestoreAllTrash),
        },
        {
          id: 'empty-recycle',
          label: 'Vaciar Papelera',
          disabled: recycleBinItemsCount === 0,
          onSelect: wrap(handleEmptyTrash),
        },
        { id: 'separator-recycle', type: 'separator' },
        { id: 'recycle-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(contextTargetIcon)) },
      ];
    }

    if (contextTargetIcon?.node) {
      return [
        { id: 'open-node', label: 'Abrir', onSelect: wrap(() => openDesktopIcon(contextTargetIcon)) },
        { id: 'separator-node-open', type: 'separator' },
        { id: 'copy-node', label: 'Copiar', hint: 'Ctrl+C', onSelect: wrap(() => handleCopyIcon(contextTargetIcon)) },
        { id: 'cut-node', label: 'Cortar', hint: 'Ctrl+X', onSelect: wrap(() => handleCutIcon(contextTargetIcon)) },
        {
          id: 'paste-node-folder',
          label: 'Pegar',
          hint: 'Ctrl+V',
          disabled: contextTargetIcon.node.type !== 'folder' || !canPasteToDesktop,
          onSelect: wrap(() => handlePasteToFolder(contextTargetIcon.node.id)),
        },
        { id: 'duplicate-node', label: 'Duplicar', onSelect: wrap(() => handleDuplicateIcon(contextTargetIcon)) },
        { id: 'separator-node-edit', type: 'separator' },
        { id: 'rename-node', label: 'Renombrar', hint: 'F2', onSelect: wrap(() => beginRename(contextTargetIcon)) },
        { id: 'delete-node', label: 'Eliminar', hint: 'Del', onSelect: wrap(() => handleMoveToTrash(contextTargetIcon)) },
        { id: 'separator-node', type: 'separator' },
        { id: 'node-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(contextTargetIcon)) },
      ];
    }

    if (contextTargetIcon) {
      return [
        { id: 'open-shortcut', label: 'Abrir', onSelect: wrap(() => openDesktopIcon(contextTargetIcon)) },
        { id: 'separator-shortcut', type: 'separator' },
        { id: 'shortcut-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(contextTargetIcon)) },
      ];
    }

    return [];
  };

  const handleDesktopPointerDown = (event) => {
    const target = event.target;

    if (
      event.button !== 0 ||
      editingIconId ||
      (target instanceof Element && target.closest('.ros-desktop-icon, .ros-context-menu, .ros-window'))
    ) {
      return;
    }

    closeContextMenu();
    closeStartMenu();
    event.preventDefault();

    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const desktopRect = element.getBoundingClientRect();
    const startPoint = getDesktopPoint(event, desktopRect);
    const initialSelectedIconIds = selectedIconIds;
    const shouldAddToSelection = event.ctrlKey || event.metaKey;
    let didMove = false;

    element.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent) => {
      const currentPoint = getDesktopPoint(moveEvent, desktopRect);
      const delta = {
        x: currentPoint.x - startPoint.x,
        y: currentPoint.y - startPoint.y,
      };

      if (!didMove && Math.hypot(delta.x, delta.y) < SELECTION_DRAG_THRESHOLD) {
        return;
      }

      didMove = true;
      didMarqueeSelectRef.current = true;

      const nextSelectionBox = {
        start: startPoint,
        current: currentPoint,
      };
      const selectedInsideBox = getIconIdsInsideSelectionBox(nextSelectionBox);
      const nextSelectedIconIds = shouldAddToSelection
        ? Array.from(new Set([...initialSelectedIconIds, ...selectedInsideBox]))
        : selectedInsideBox;

      setSelectionBox(nextSelectionBox);
      setSelectedIconIds(nextSelectedIconIds);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }

      setSelectionBox(null);

      if (!didMove && !shouldAddToSelection) {
        clearIconSelection();
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleDesktopClick = (event) => {
    if (didMarqueeSelectRef.current) {
      didMarqueeSelectRef.current = false;
      closeContextMenu();
      closeStartMenu();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      closeContextMenu();
      closeStartMenu();
      return;
    }

    clearIconSelection();
    closeContextMenu();
    closeStartMenu();
  };

  const handleDesktopContextMenu = (event) => {
    event.preventDefault();
    closeStartMenu();
    clearIconSelection();
    setContextMenu({
      type: 'desktop',
      position: getMenuPosition(event, 9),
    });
  };

  const handleIconContextMenu = (event, icon) => {
    event.preventDefault();
    event.stopPropagation();
    closeStartMenu();

    if (!selectedIconIdSet.has(icon.id)) {
      selectSingleIcon(icon.id);
    }

    const itemCount = icon.kind === 'recycle-bin' ? 5 : icon.node ? 11 : 4;
    setContextMenu({
      type: 'icon',
      iconId: icon.id,
      position: getMenuPosition(event, itemCount),
    });
  };

  const handleIconPointerDown = (event, icon, iconPosition) => {
    if (event.button !== 0 || editingIconId === icon.id) {
      return;
    }

    event.stopPropagation();
    closeContextMenu();
    closeStartMenu();

    if (!event.ctrlKey && !event.metaKey && !selectedIconIdSet.has(icon.id)) {
      selectSingleIcon(icon.id);
    }

    const dragGroupIcons = selectedIconIdSet.has(icon.id) ? selectedIcons : [icon];
    const dragNodeIcons = dragGroupIcons.filter((dragIcon) => dragIcon.node);
    const dragNodes = dragNodeIcons.map((dragIcon) => dragIcon.node);
    const dragNodeIds = dragNodes.map((node) => node.id);
    const dragIconPositions = {
      ...getDisplayedIconPositions(),
      [icon.id]: iconPosition,
    };
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const startClientPosition = { x: event.clientX, y: event.clientY };
    let didMove = false;
    let latestPositions = dragGroupIcons.reduce((positions, dragIcon) => {
      positions[dragIcon.id] = dragIconPositions[dragIcon.id] ?? iconPosition;
      return positions;
    }, {});
    let latestDropTarget = null;
    let latestInvalidDropTarget = false;
    let activeDropElement = null;

    element.setPointerCapture(pointerId);

    const setActiveDropTarget = (dropTarget) => {
      if (activeDropElement === dropTarget?.element) {
        return;
      }

      if (activeDropElement) {
        activeDropElement.dataset.fileDropActive = 'false';
      }

      activeDropElement = dropTarget?.element ?? null;

      if (activeDropElement) {
        activeDropElement.dataset.fileDropActive = 'true';
      }
    };

    const handlePointerMove = (moveEvent) => {
      const delta = {
        x: moveEvent.clientX - startClientPosition.x,
        y: moveEvent.clientY - startClientPosition.y,
      };

      if (!didMove && Math.hypot(delta.x, delta.y) < 4) {
        return;
      }

      didMove = true;
      didIconDragRef.current = true;
      latestPositions = dragGroupIcons.reduce((positions, dragIcon) => {
        const initialPosition = dragIconPositions[dragIcon.id] ?? iconPosition;
        positions[dragIcon.id] = {
          x: initialPosition.x + delta.x,
          y: initialPosition.y + delta.y,
        };
        return positions;
      }, {});
      setDraggingIconIds(dragGroupIcons.map((dragIcon) => dragIcon.id));

      const dropTarget = dragNodeIds.length > 0
        ? getFileDropTargetFromPoint(moveEvent.clientX, moveEvent.clientY, element, {
            ignoreFolderIds: [desktopFolderId],
          })
        : null;
      const isValidDropTarget = Boolean(
        dropTarget &&
        (dropTarget.type === 'paint'
          ? canDropNodesToPaint(dragNodes)
          : dragNodes.every((node) => canDropNodeToFolder(node, dropTarget.folderId))),
      );
      latestDropTarget =
        isValidDropTarget ? dropTarget : null;
      latestInvalidDropTarget = Boolean(dropTarget && !isValidDropTarget);
      setActiveDropTarget(latestDropTarget);

      const dragFeedback = getDragDropFeedback(dropTarget, isValidDropTarget, dragNodeIds.length > 0);
      const previewIcon = dragNodes[0]
        ? getNodeIconTone(dragNodes[0], recycleBinItemsCount)
        : dragGroupIcons[0]?.tone ?? 'folder';
      const showFloatingPreview = dragGroupIcons.length > 1 || Boolean(dropTarget);

      setDragPreview({
        count: dragGroupIcons.length,
        dropState: dragFeedback.state,
        feedbackLabel: dragFeedback.label,
        iconType: previewIcon,
        label: dragGroupIcons.length === 1 ? dragGroupIcons[0].label : `${dragGroupIcons.length} elementos`,
        nodes: dragNodes,
        position: { x: moveEvent.clientX, y: moveEvent.clientY },
        positions: latestPositions,
        showFloatingPreview,
      });
    };

    const handlePointerUp = async () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }

      if (didMove) {
        let movedNodeIds = [];

        if (latestDropTarget?.type === 'paint' && dragNodes.length === 1) {
          dispatchPaintFileDrop(latestDropTarget.windowId, dragNodes[0].id);
        } else if (latestDropTarget?.folderId === recycleBinFolderId && dragNodeIds.length > 0) {
          const confirmed = await confirmMoveNodesToTrash(dragNodes);

          if (confirmed) {
            movedNodeIds = moveNodesToTrash(dragNodeIds);
            clearIconSelection();
            playSound('trash');
          }
        } else if (latestDropTarget?.folderId && dragNodeIds.length > 0) {
          movedNodeIds = moveNodesToFolder(dragNodeIds, latestDropTarget.folderId);

          if (movedNodeIds.length > 0) {
            setSelectedIconIds(movedNodeIds.map((nodeId) => `fs:${nodeId}`));
            playSound('click');
          }
        }

        if (!latestDropTarget && !latestInvalidDropTarget && movedNodeIds.length === 0) {
          dragGroupIcons.forEach((dragIcon) => {
            const nextPosition = latestPositions[dragIcon.id];

            if (nextPosition) {
              setIconPosition(dragIcon.id, snapDesktopPosition(nextPosition));
            }
          });
          playSound('click');
        }
      }

      clearActiveFileDropTargets();
      setDraggingIconIds([]);
      setDragPreview(null);

      if (didMove) {
        window.setTimeout(() => {
          didIconDragRef.current = false;
        }, 0);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const shouldIgnoreDesktopShortcut =
        editingIconId ||
        isTextEntryElement(event.target) ||
        (event.target instanceof Element && event.target.closest('.ros-window'));

      if (event.key === 'Escape') {
        if (editingIconId) {
          event.preventDefault();
          cancelRename();
          return;
        }

        if (contextMenu) {
          event.preventDefault();
          closeContextMenu();
        }
      }

      if (event.ctrlKey && !event.altKey && !event.metaKey && !shouldIgnoreDesktopShortcut) {
        const shortcutKey = event.key.toLowerCase();

        if (shortcutKey === 'c' && selectedIcon?.node) {
          event.preventDefault();
          handleCopyIcon(selectedIcon);
        }

        if (shortcutKey === 'x' && selectedIcon?.node) {
          event.preventDefault();
          handleCutIcon(selectedIcon);
        }

        if (shortcutKey === 'v' && canPasteToDesktop) {
          event.preventDefault();
          handlePasteToFolder(desktopFolderId);
        }
      }

      if (event.key === 'F2' && selectedIcon?.node && !shouldIgnoreDesktopShortcut) {
        event.preventDefault();
        beginRename(selectedIcon);
      }

      if (event.key === 'Delete' && selectedIcon?.node && !shouldIgnoreDesktopShortcut) {
        event.preventDefault();
        handleMoveToTrash(selectedIcon);
      }

      if (event.key === 'F5' && !shouldIgnoreDesktopShortcut) {
        event.preventDefault();
        handleRefresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    beginRename,
    cancelRename,
    canPasteToDesktop,
    closeContextMenu,
    contextMenu,
    editingIconId,
    handleCopyIcon,
    handleCutIcon,
    handleMoveToTrash,
    handlePasteToFolder,
    handleRefresh,
    selectedIcon,
  ]);

  const selectionBoxRect = selectionBox ? getSelectionBoxRect(selectionBox) : null;

  return (
    <main
      className="ros-desktop"
      data-drop-folder-id={desktopFolderId}
      data-wallpaper={wallpaper}
      aria-label="Escritorio de Roso OS"
      onClick={handleDesktopClick}
      onContextMenu={handleDesktopContextMenu}
      onPointerDown={handleDesktopPointerDown}
    >
      <div className="ros-wallpaper" aria-hidden="true" />
      {selectionBoxRect ? (
        <div
          className="ros-desktop-selection-box"
          style={{
            left: `${selectionBoxRect.left}px`,
            top: `${selectionBoxRect.top}px`,
            width: `${selectionBoxRect.width}px`,
            height: `${selectionBoxRect.height}px`,
          }}
          aria-hidden="true"
        />
      ) : null}
      <div className="ros-desktop-icons" aria-label="Iconos del escritorio">
        {desktopIcons.map((icon, index) => {
          const iconPosition = getDisplayedIconPosition(icon.id, index);

          return (
            <DesktopIcon
              draftName={draftName}
              isDragging={draggingIconIds.includes(icon.id)}
              isEditing={editingIconId === icon.id}
              isSelected={selectedIconIdSet.has(icon.id)}
              key={icon.id}
              label={icon.label}
              dropFolderId={icon.node?.type === 'folder' ? icon.node.id : ['folder-shortcut', 'recycle-bin'].includes(icon.kind) ? icon.folderId : undefined}
              position={iconPosition}
              renameExtension={icon.node ? getEditableNodeName(icon.node).extension : ''}
              tone={icon.tone}
              onContextMenu={(event) => handleIconContextMenu(event, icon)}
              onFocus={(event) => {
                if (!editingIconId && event.currentTarget.matches(':focus-visible')) {
                  selectSingleIcon(icon.id);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'F2' && icon.node && selectedIcons.length <= 1) {
                  event.preventDefault();
                  beginRename(icon);
                }

                if (event.key === 'Delete' && icon.node && selectedIcons.length <= 1) {
                  event.preventDefault();
                  handleMoveToTrash(icon);
                }
              }}
              onOpen={(event) => {
                event.stopPropagation();
                openDesktopIcon(icon);
              }}
              onPointerDown={(event) => handleIconPointerDown(event, icon, iconPosition)}
              onRenameBlur={commitRename}
              onRenameChange={setDraftName}
              onRenameKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onSelect={(event) => {
                event.stopPropagation();

                if (didIconDragRef.current) {
                  didIconDragRef.current = false;
                  return;
                }

                closeContextMenu();
                closeStartMenu();

                if (event.ctrlKey || event.metaKey) {
                  toggleIconSelection(icon.id);
                  return;
                }

                selectSingleIcon(icon.id);
              }}
            />
          );
        })}
      </div>
      {dragPreview?.showFloatingPreview ? (
        <div
          className="ros-file-drag-preview"
          data-drop-state={dragPreview.dropState}
          style={{
            left: `${dragPreview.position.x}px`,
            top: `${dragPreview.position.y}px`,
          }}
          aria-hidden="true"
        >
          <span
            className="ros-file-node-icon"
            data-type={dragPreview.iconType}
          />
          <span className="ros-file-drag-preview-text">
            <span>{dragPreview.label}</span>
            {dragPreview.feedbackLabel ? <small>{dragPreview.feedbackLabel}</small> : null}
          </span>
        </div>
      ) : null}
      {contextMenu ? <DesktopContextMenu items={getContextMenuItems()} position={contextMenu.position} /> : null}
      <WindowManager />
    </main>
  );
}
