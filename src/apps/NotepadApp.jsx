import { useMemo, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';

const initialText = [
  'Bienvenido a Roso OS.',
  '',
  'Este Bloc de notas puede guardar archivos en Escritorio o Mis documentos.',
  'Los archivos .txt persisten en IndexedDB.',
].join('\n');

const ensureTxtExtension = (name) => (name.toLowerCase().endsWith('.txt') ? name : `${name}.txt`);

export function NotepadApp({ launchData }) {
  const nodes = useFileSystemStore((state) => state.nodes);
  const createFile = useFileSystemStore((state) => state.createFile);
  const updateFileContent = useFileSystemStore((state) => state.updateFileContent);
  const getNode = useFileSystemStore((state) => state.getNode);
  const initialFile = launchData?.fileId ? getNode(launchData.fileId) : null;
  const [text, setText] = useState(() => (initialFile?.type === 'file' ? initialFile.content ?? '' : initialText));
  const [savedFileId, setSavedFileId] = useState(() => (initialFile?.type === 'file' ? initialFile.id : null));
  const textareaRef = useRef(null);
  const playSound = useSystemSound();
  const linkedFile = savedFileId ? getNode(savedFileId) : null;

  const getUniqueFileName = (folderId, defaultName) => {
    const fileName = ensureTxtExtension(defaultName.trim() || 'nota.txt');
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

  const stats = useMemo(() => {
    const lineCount = text.length === 0 ? 1 : text.split('\n').length;

    return {
      characters: text.length,
      lines: lineCount,
    };
  }, [text]);

  const handleNew = () => {
    setText('');
    setSavedFileId(null);
    textareaRef.current?.focus();
    playSound('click');
  };

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

  const handleSave = () => {
    if (savedFileId && getNode(savedFileId)) {
      updateFileContent(savedFileId, text);
      playSound('click');
      return;
    }

    handleSaveAs();
  };

  const saveToFolder = (folderId, defaultName, shouldAskName = true) => {
    const name = shouldAskName ? window.prompt('Nombre del archivo', defaultName) : getUniqueFileName(folderId, defaultName);

    if (name?.trim()) {
      const fileId = createFile(folderId, shouldAskName ? getUniqueFileName(folderId, name.trim()) : name.trim(), text);
      setSavedFileId(fileId);
      playSound('click');
    }
  };

  const handleSaveToDesktop = () => saveToFolder('desktop-folder', linkedFile?.name ?? 'nota-escritorio.txt', false);

  const handleSaveToDocuments = () => saveToFolder('documents', linkedFile?.name ?? 'nota.txt', false);

  const handleSaveAs = () => {
    const location = window.prompt('Guardar en: escritorio o documentos', 'escritorio');

    if (!location) {
      return;
    }

    const normalizedLocation = location.trim().toLowerCase();
    const folderId = normalizedLocation.startsWith('doc') ? 'documents' : 'desktop-folder';
    saveToFolder(folderId, linkedFile?.name ?? 'nota.txt');
  };

  return (
    <div className="ros-notepad-app">
      <div className="ros-app-toolbar" aria-label="Barra de herramientas de Bloc de notas">
        <button className="ros-app-toolbar-button" type="button" onClick={handleNew}>Nuevo</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleSave}>Guardar</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleSaveToDesktop}>Guardar en escritorio</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleSaveToDocuments}>Guardar en documentos</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleSaveAs}>Guardar como</button>
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
