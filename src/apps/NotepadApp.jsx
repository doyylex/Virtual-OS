import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { joinFileName } from '../services/fileNames.js';
import { findNameConflict, resolveSaveConflict } from '../services/saveConflicts.js';
import { useDialogStore } from '../store/useDialogStore.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const initialText = [
  'Bienvenido a Roso OS.',
  '',
  'Este Bloc de notas puede guardar archivos en Escritorio o Mis documentos.',
  'Los archivos .txt persisten en IndexedDB.',
].join('\n');

const invalidFileNamePattern = /[<>:"/\\|?*]/;
const recycleBinFolderId = 'recycle-bin-folder';
const textFileExtension = '.txt';

const validateFileName = (name) => (invalidFileNamePattern.test(name) ? 'El nombre no puede usar caracteres reservados.' : '');

export function NotepadApp({ launchData, windowId }) {
  const nodes = useFileSystemStore((state) => state.nodes);
  const createFileAsync = useFileSystemStore((state) => state.createFileAsync);
  const updateFileContentAsync = useFileSystemStore((state) => state.updateFileContentAsync);
  const getNode = useFileSystemStore((state) => state.getNode);
  const showAlert = useDialogStore((state) => state.showAlert);
  const showChoiceDialog = useDialogStore((state) => state.showChoiceDialog);
  const showSaveFileDialog = useDialogStore((state) => state.showSaveFileDialog);
  const registerBeforeClose = useWindowStore((state) => state.registerBeforeClose);
  const setWindowTitle = useWindowStore((state) => state.setWindowTitle);
  const initialFile = launchData?.fileId ? getNode(launchData.fileId) : null;
  const [text, setText] = useState(() => (initialFile?.type === 'file' ? initialFile.content ?? '' : initialText));
  const savedTextRef = useRef(initialFile?.type === 'file' ? initialFile.content ?? '' : initialText);
  const hasUnsavedChangesRef = useRef(false);
  const isClosePromptOpenRef = useRef(false);
  const [savedFileId, setSavedFileId] = useState(() => (initialFile?.type === 'file' ? initialFile.id : null));
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const textareaRef = useRef(null);
  const playSound = useSystemSound();
  const linkedFile = savedFileId ? getNode(savedFileId) : null;

  const setDirtyState = useCallback((nextHasUnsavedChanges) => {
    hasUnsavedChangesRef.current = nextHasUnsavedChanges;
    setHasUnsavedChanges(nextHasUnsavedChanges);
  }, []);

  useEffect(() => {
    if (!windowId) {
      return;
    }

    setWindowTitle(windowId, `Bloc de notas - ${linkedFile?.name ?? 'Sin titulo'}`);
  }, [linkedFile?.name, setWindowTitle, windowId]);

  const stats = useMemo(() => {
    const lineCount = text.length === 0 ? 1 : text.split('\n').length;

    return {
      characters: text.length,
      lines: lineCount,
    };
  }, [text]);

  const handleSelectAll = () => {
    textareaRef.current?.focus();
    textareaRef.current?.select();
    playSound('click');
  };

  const handleTextChange = (nextText) => {
    setText(nextText);
    setDirtyState(nextText !== savedTextRef.current);
  };

  const handleClear = () => {
    handleTextChange('');
    textareaRef.current?.focus();
    playSound('click');
  };

  const getInitialSaveFolderId = useCallback(() => {
    if (linkedFile?.parentId && linkedFile.parentId !== recycleBinFolderId) {
      return linkedFile.parentId;
    }

    return 'documents';
  }, [linkedFile]);

  const showSaveSuccess = useCallback((fileName) =>
    showAlert({
      title: 'Bloc de notas',
      message: 'EXITO AL GUARDAR',
      detail: fileName ? `${fileName} se guardo en Roso OS.` : '',
      confirmLabel: 'Aceptar',
      icon: 'info',
    }), [showAlert]);

  const showSaveError = useCallback((error) =>
    showAlert({
      title: 'Bloc de notas',
      message: 'ERROR AL GUARDAR',
      detail: error?.message ?? 'No se pudo guardar el archivo.',
      confirmLabel: 'Aceptar',
      icon: 'warning',
    }), [showAlert]);

  const markSaved = useCallback((nextText) => {
    savedTextRef.current = nextText;
    setDirtyState(false);
  }, [setDirtyState]);

  const saveNotepadContent = useCallback(async ({ forceSaveAs = false } = {}) => {
    try {
      if (!forceSaveAs && savedFileId && getNode(savedFileId)) {
        await updateFileContentAsync(savedFileId, text);
        markSaved(text);
        playSound('save');
        await showSaveSuccess(getNode(savedFileId)?.name);
        return true;
      }

      const saveData = await showSaveFileDialog({
        title: 'Guardar como',
        message: 'Elige el nombre y la carpeta del archivo.',
        detail: 'La Papelera no esta disponible como destino.',
        defaultValue: linkedFile?.name ?? 'nota.txt',
        lockedExtension: textFileExtension,
        initialFolderId: getInitialSaveFolderId(),
        confirmLabel: 'Guardar',
        blockedFolderIds: [recycleBinFolderId],
        validate: validateFileName,
      });

      if (!saveData) {
        return false;
      }

      const fileName = joinFileName(saveData.name.trim() || 'nota', textFileExtension);

      if (
        linkedFile?.id &&
        saveData.folderId === linkedFile.parentId &&
        fileName.toLowerCase() === linkedFile.name.toLowerCase()
      ) {
        await updateFileContentAsync(linkedFile.id, text);
        setSavedFileId(linkedFile.id);
        markSaved(text);
        playSound('save');
        await showSaveSuccess(linkedFile.name);
        return true;
      }

      const conflictNode = findNameConflict(nodes, saveData.folderId, fileName, linkedFile?.id);
      const conflictChoice = await resolveSaveConflict({
        conflictNode,
        fileName,
        showChoiceDialog,
        title: 'Guardar como',
      });

      if (conflictChoice === 'cancel') {
        return false;
      }

      const fileId = conflictChoice === 'overwrite' && conflictNode?.type === 'file'
        ? conflictNode.id
        : await createFileAsync(saveData.folderId, fileName, text);

      if (conflictChoice === 'overwrite' && conflictNode?.type === 'file') {
        await updateFileContentAsync(conflictNode.id, text);
      }

      const savedFile = getNode(fileId);

      setSavedFileId(fileId);
      markSaved(text);
      playSound('save');
      await showSaveSuccess(savedFile?.name ?? fileName);
      return true;
    } catch (error) {
      playSound('error');
      await showSaveError(error);
      return false;
    }
  }, [
    createFileAsync,
    getInitialSaveFolderId,
    getNode,
    linkedFile,
    markSaved,
    nodes,
    playSound,
    savedFileId,
    showChoiceDialog,
    showSaveError,
    showSaveFileDialog,
    showSaveSuccess,
    text,
    updateFileContentAsync,
  ]);

  const resolveUnsavedChanges = useCallback(async () => {
    if (!hasUnsavedChangesRef.current || isClosePromptOpenRef.current) {
      return !hasUnsavedChangesRef.current;
    }

    isClosePromptOpenRef.current = true;

    try {
      const choice = await showChoiceDialog({
        title: 'Bloc de notas',
        message: 'Quieres guardar los cambios?',
        detail: 'Si cierras sin guardar, los cambios recientes se perderan.',
        icon: 'warning',
        cancelValue: 'cancel',
        choices: [
          { label: 'Guardar', value: 'save', autoFocus: true },
          { label: 'No guardar', value: 'discard' },
          { label: 'Cancelar', value: 'cancel' },
        ],
      });

      if (choice === 'discard') {
        return true;
      }

      if (choice === 'save') {
        return saveNotepadContent();
      }

      return false;
    } finally {
      isClosePromptOpenRef.current = false;
    }
  }, [saveNotepadContent, showChoiceDialog]);

  useEffect(() => {
    if (!windowId) {
      return undefined;
    }

    return registerBeforeClose(windowId, resolveUnsavedChanges);
  }, [registerBeforeClose, resolveUnsavedChanges, windowId]);

  const handleSave = async () => {
    await saveNotepadContent();
  };

  const handleSaveAs = async () => {
    await saveNotepadContent({ forceSaveAs: true });
  };

  return (
    <div className="ros-notepad-app">
      <div className="ros-app-toolbar" aria-label="Barra de herramientas de Bloc de notas">
        <button className="ros-app-toolbar-button" type="button" onClick={() => void handleSave()}>Guardar</button>
        <button className="ros-app-toolbar-button" type="button" onClick={() => void handleSaveAs()}>Guardar como</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleSelectAll}>Seleccionar todo</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleClear}>Limpiar</button>
      </div>

      <textarea
        ref={textareaRef}
        className="ros-notepad-editor"
        value={text}
        spellCheck="false"
        aria-label="Editor de Bloc de notas"
        onChange={(event) => handleTextChange(event.target.value)}
      />

      <footer className="ros-notepad-status">
        <span>{stats.lines} lineas</span>
        <span>{stats.characters} caracteres</span>
        <span>{hasUnsavedChanges ? 'Sin guardar' : 'Guardado'}</span>
        <span>{linkedFile ? linkedFile.name : 'Temporal'}</span>
      </footer>
    </div>
  );
}
