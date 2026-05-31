import { useMemo, useState } from 'react';
import { joinFileName, normalizeExtension, stripLockedExtension } from '../services/fileNames.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { SystemDialog } from './SystemDialog.jsx';

const recycleBinFolderId = 'recycle-bin-folder';

const getFolderDepth = (path) => Math.max(0, path.length - 1);

const sortFolders = (folders) =>
  [...folders].sort((firstFolder, secondFolder) => {
    const firstPath = firstFolder.path.map((node) => node.name).join('\\');
    const secondPath = secondFolder.path.map((node) => node.name).join('\\');

    return firstPath.localeCompare(secondPath, 'es');
  });

export function SaveFileDialog({ dialog, onResolve }) {
  const nodes = useFileSystemStore((state) => state.nodes);
  const getNode = useFileSystemStore((state) => state.getNode);
  const getPath = useFileSystemStore((state) => state.getPath);
  const blockedFolderIds = useMemo(
    () => new Set([recycleBinFolderId, ...dialog.blockedFolderIds]),
    [dialog.blockedFolderIds],
  );
  const initialFolder = getNode(dialog.initialFolderId);
  const lockedExtension = normalizeExtension(dialog.lockedExtension);
  const initialFolderPath = initialFolder?.type === 'folder' ? getPath(initialFolder.id) : [];
  const isInitialFolderAllowed = Boolean(
    initialFolder?.type === 'folder' &&
    !initialFolderPath.some((pathNode) => blockedFolderIds.has(pathNode.id)),
  );
  const [selectedFolderId, setSelectedFolderId] = useState(
    isInitialFolderAllowed ? initialFolder.id : 'documents',
  );
  const [fileName, setFileName] = useState(stripLockedExtension(dialog.defaultValue, lockedExtension));
  const [error, setError] = useState('');
  const folders = useMemo(
    () =>
      sortFolders(
        nodes
          .filter((node) => node.type === 'folder')
          .map((folder) => ({ ...folder, path: getPath(folder.id) }))
          .filter((folder) => !folder.path.some((pathNode) => blockedFolderIds.has(pathNode.id))),
      ),
    [blockedFolderIds, getPath, nodes],
  );
  const selectedFolder = getNode(selectedFolderId);
  const selectedFolderPath = selectedFolder ? getPath(selectedFolder.id) : [];
  const isSelectedFolderBlocked = selectedFolderPath.some((pathNode) => blockedFolderIds.has(pathNode.id));
  const selectedPath = selectedFolderPath.map((node) => node.name).join('\\');

  const handleCancel = () => onResolve(null);

  const handleConfirm = () => {
    const nextName = stripLockedExtension(fileName, lockedExtension);

    if (!nextName) {
      setError('Ingresa un nombre para el archivo.');
      return;
    }

    if (!selectedFolder || isSelectedFolderBlocked) {
      setError('Selecciona una carpeta valida.');
      return;
    }

    const validationMessage = dialog.validate?.(nextName);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    onResolve({ folderId: selectedFolder.id, name: joinFileName(nextName, lockedExtension) });
  };

  return (
    <SystemDialog
      dialog={dialog}
      onCancel={handleCancel}
      actions={
        <>
          <button className="ros-system-dialog-button" type="button" onClick={handleConfirm}>
            {dialog.confirmLabel}
          </button>
          <button className="ros-system-dialog-button" type="button" onClick={handleCancel}>
            {dialog.cancelLabel}
          </button>
        </>
      }
    >
      <p>{dialog.message}</p>
      {dialog.detail ? <small>{dialog.detail}</small> : null}

      <label className="ros-system-dialog-field">
        <span>Nombre</span>
        <span className="ros-extension-field">
          <input
            value={fileName}
            placeholder={dialog.placeholder}
            aria-invalid={error ? 'true' : 'false'}
            autoFocus
            onChange={(event) => {
              setFileName(stripLockedExtension(event.target.value, lockedExtension));
              setError('');
            }}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleConfirm();
              }
            }}
          />
          {lockedExtension ? <span className="ros-extension-suffix">{lockedExtension}</span> : null}
        </span>
      </label>

      <div className="ros-save-file-picker">
        <span>Guardar en</span>
        <div className="ros-save-file-tree" role="tree" aria-label="Carpetas disponibles">
          {folders.map((folder) => (
            <button
              className="ros-save-file-folder"
              data-selected={folder.id === selectedFolderId ? 'true' : 'false'}
              key={folder.id}
              role="treeitem"
              style={{ '--ros-folder-depth': getFolderDepth(folder.path) }}
              type="button"
              onClick={() => {
                setSelectedFolderId(folder.id);
                setError('');
              }}
            >
              <span className="ros-file-node-icon" data-type="folder" aria-hidden="true" />
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
        <small>{selectedPath || 'Selecciona una carpeta.'}</small>
      </div>

      {error ? <em>{error}</em> : null}
    </SystemDialog>
  );
}
