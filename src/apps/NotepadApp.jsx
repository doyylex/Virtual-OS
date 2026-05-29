import { useEffect, useMemo, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { joinFileName } from '../services/fileNames.js';
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
  const showSaveFileDialog = useDialogStore((state) => state.showSaveFileDialog);
  const setWindowTitle = useWindowStore((state) => state.setWindowTitle);
  const initialFile = launchData?.fileId ? getNode(launchData.fileId) : null;
  const [text, setText] = useState(() => (initialFile?.type === 'file' ? initialFile.content ?? '' : initialText));
  const [savedFileId, setSavedFileId] = useState(() => (initialFile?.type === 'file' ? initialFile.id : null));
  const textareaRef = useRef(null);
  const playSound = useSystemSound();
  const linkedFile = savedFileId ? getNode(savedFileId) : null;

  useEffect(() => {
    if (!windowId) {
      return;
    }

    setWindowTitle(windowId, `Bloc de notas - ${linkedFile?.name ?? 'Sin titulo'}`);
  }, [linkedFile?.name, setWindowTitle, windowId]);

  const getUniqueFileName = (folderId, defaultName) => {
    const fileName = joinFileName(defaultName.trim() || 'nota', textFileExtension);
    const existingNames = new Set(nodes.filter((node) => node.parentId === folderId).map((node) => node.name.toLowerCase()));

    if (!existingNames.has(fileName.toLowerCase())) {
      return fileName;
    }

    const baseName = fileName.replace(/\.txt$/i, '');
    let counter = 2;
    let nextName = `${baseName}-${counter}.txt`;

    while (existingNames.has(nextName.toLowerCase())) {
      counter += 1;
      nextName = `${baseName}-${counter}.txt`;
    }

    return nextName;
  };

  const getInitialSaveFolderId = () => {
    if (linkedFile?.parentId && linkedFile.parentId !== recycleBinFolderId) {
      return linkedFile.parentId;
    }

    return 'documents';
  };

  const showSaveSuccess = () =>
    showAlert({
      title: 'Bloc de notas',
      message: 'EXITO AL GUARDAR',
      confirmLabel: 'Aceptar',
      icon: 'info',
    });

  const showSaveError = (error) =>
    showAlert({
      title: 'Bloc de notas',
      message: 'ERROR AL GUARDAR',
      detail: error?.message ?? 'No se pudo guardar el archivo.',
      confirmLabel: 'Aceptar',
      icon: 'warning',
    });

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

  const handleClear = () => {
    setText('');
    textareaRef.current?.focus();
    playSound('click');
  };

  const handleSave = async () => {
    try {
      if (savedFileId && getNode(savedFileId)) {
        await updateFileContentAsync(savedFileId, text);
        playSound('click');
        await showSaveSuccess();
        return;
      }

      await handleSaveAs();
    } catch (error) {
      playSound('click');
      await showSaveError(error);
    }
  };

  const handleSaveAs = async () => {
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
      return;
    }

    try {
      const fileName = getUniqueFileName(saveData.folderId, saveData.name);
      const fileId = await createFileAsync(saveData.folderId, fileName, text);
      setSavedFileId(fileId);
      playSound('click');
      await showSaveSuccess();
    } catch (error) {
      playSound('click');
      await showSaveError(error);
    }
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
        onChange={(event) => setText(event.target.value)}
      />

      <footer className="ros-notepad-status">
        <span>{stats.lines} lineas</span>
        <span>{stats.characters} caracteres</span>
        <span>{linkedFile ? linkedFile.name : 'Temporal'}</span>
      </footer>
    </div>
  );
}
