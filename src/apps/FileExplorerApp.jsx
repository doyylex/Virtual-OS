import { useMemo, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const formatDate = (timestamp) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));

export function FileExplorerApp({ launchData }) {
  const nodes = useFileSystemStore((state) => state.nodes);
  const storedCurrentFolderId = useFileSystemStore((state) => state.currentFolderId);
  const selectedNodeId = useFileSystemStore((state) => state.selectedNodeId);
  const isReady = useFileSystemStore((state) => state.isReady);
  const error = useFileSystemStore((state) => state.error);
  const selectNode = useFileSystemStore((state) => state.selectNode);
  const createFolder = useFileSystemStore((state) => state.createFolder);
  const createFile = useFileSystemStore((state) => state.createFile);
  const renameNode = useFileSystemStore((state) => state.renameNode);
  const deleteNode = useFileSystemStore((state) => state.deleteNode);
  const getChildren = useFileSystemStore((state) => state.getChildren);
  const getNode = useFileSystemStore((state) => state.getNode);
  const getPath = useFileSystemStore((state) => state.getPath);
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();
  const [currentFolderId, setCurrentFolderId] = useState(() => {
    const launchFolder = launchData?.folderId ? getNode(launchData.folderId) : null;
    const storedFolder = getNode(storedCurrentFolderId);

    return launchFolder?.type === 'folder' ? launchFolder.id : storedFolder?.id ?? 'root';
  });

  const children = getChildren(currentFolderId);
  const path = getPath(currentFolderId);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  const folderTree = useMemo(() => nodes.filter((node) => node.type === 'folder'), [nodes]);

  const openFolder = (folderId) => {
    const folder = getNode(folderId);

    if (folder?.type !== 'folder') {
      return;
    }

    setCurrentFolderId(folder.id);
    selectNode(null);
  };

  const handleCreateFolder = () => {
    const name = window.prompt('Nombre de la carpeta', 'Nueva carpeta');

    if (name) {
      createFolder(currentFolderId, name);
      playSound('click');
    }
  };

  const handleCreateFile = () => {
    const name = window.prompt('Nombre del archivo', 'nuevo.txt');

    if (name) {
      createFile(currentFolderId, name, '');
      playSound('click');
    }
  };

  const handleRename = () => {
    if (!selectedNode) {
      return;
    }

    const name = window.prompt('Nuevo nombre', selectedNode.name);

    if (name) {
      renameNode(selectedNode.id, name);
      playSound('click');
    }
  };

  const handleDelete = () => {
    if (!selectedNode || selectedNode.id === 'root') {
      return;
    }

    if (window.confirm(`Eliminar "${selectedNode.name}"?`)) {
      deleteNode(selectedNode.id);
      playSound('close');
    }
  };

  const handleOpenNode = (node) => {
    selectNode(node.id);

    if (node.type === 'folder') {
      openFolder(node.id);
      playSound('open');
      return;
    }

    if (node.type === 'file' && node.name.toLowerCase().endsWith('.txt')) {
      openApp('notepad', { fileId: node.id });
      playSound('open');
    }
  };

  const goUp = () => {
    const currentFolder = nodes.find((node) => node.id === currentFolderId);

    if (currentFolder?.parentId) {
      openFolder(currentFolder.parentId);
      playSound('click');
    }
  };

  if (!isReady) {
    return <div className="ros-file-explorer-loading">Cargando sistema de archivos...</div>;
  }

  if (error) {
    return <div className="ros-file-explorer-loading">{error}</div>;
  }

  return (
    <div className="ros-file-explorer-app">
      <div className="ros-app-toolbar" aria-label="Barra de herramientas del Explorador">
        <button className="ros-app-toolbar-button" type="button" onClick={goUp}>Subir</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleCreateFolder}>Nueva carpeta</button>
        <button className="ros-app-toolbar-button" type="button" onClick={handleCreateFile}>Nuevo archivo</button>
        <button className="ros-app-toolbar-button" type="button" disabled={!selectedNode} onClick={handleRename}>Renombrar</button>
        <button className="ros-app-toolbar-button" type="button" disabled={!selectedNode || selectedNode.id === 'root'} onClick={handleDelete}>Eliminar</button>
      </div>

      <div className="ros-explorer-address">
        <span>Direccion</span>
        <strong>{path.map((node) => node.name).join('\\')}</strong>
      </div>

      <div className="ros-file-explorer-layout">
        <aside className="ros-file-tree" aria-label="Arbol de carpetas">
          {folderTree.map((folder) => (
            <button
              className="ros-file-tree-item"
              data-active={folder.id === currentFolderId ? 'true' : 'false'}
              key={folder.id}
              type="button"
              onClick={() => {
                openFolder(folder.id);
                playSound('click');
              }}
            >
              <span className="ros-file-node-icon" data-type="folder" aria-hidden="true" />
              {folder.name}
            </button>
          ))}
        </aside>

        <section className="ros-file-list" aria-label="Contenido de carpeta">
          {children.length === 0 ? (
            <p className="ros-empty-folder">Esta carpeta esta vacia.</p>
          ) : (
            children.map((node) => (
              <button
                className="ros-file-row"
                data-selected={node.id === selectedNodeId ? 'true' : 'false'}
                key={node.id}
                type="button"
                onClick={() => selectNode(node.id)}
                onDoubleClick={() => handleOpenNode(node)}
              >
                <span className="ros-file-node-icon" data-type={node.type} aria-hidden="true" />
                <span className="ros-file-row-name">{node.name}</span>
                <span>{node.type === 'folder' ? 'Carpeta' : 'Archivo de texto'}</span>
                <span>{formatDate(node.updatedAt)}</span>
              </button>
            ))
          )}
        </section>

        <aside className="ros-file-details" aria-label="Detalles">
          {selectedNode ? (
            <>
              <span className="ros-file-node-icon ros-file-node-icon-large" data-type={selectedNode.type} aria-hidden="true" />
              <h2>{selectedNode.name}</h2>
              <p>{selectedNode.type === 'folder' ? 'Carpeta' : 'Archivo de texto'}</p>
              {selectedNode.type === 'file' ? <pre>{selectedNode.content || 'Archivo vacio.'}</pre> : null}
            </>
          ) : (
            <p>Selecciona un archivo o carpeta.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
