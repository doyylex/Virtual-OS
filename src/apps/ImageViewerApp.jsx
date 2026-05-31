import { useEffect } from 'react';
import { getNodeTypeLabel, isImageFileName } from '../services/fileIcons.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const getFileSizeLabel = (node) => {
  if (node?.type !== 'file') {
    return '';
  }

  return `${new TextEncoder().encode(node.content ?? '').length} bytes`;
};

export function ImageViewerApp({ launchData, windowId }) {
  const fileId = launchData?.fileId ?? null;
  const node = useFileSystemStore((state) =>
    fileId ? state.nodes.find((candidateNode) => candidateNode.id === fileId) ?? null : null,
  );
  const openApp = useWindowStore((state) => state.openApp);
  const setWindowTitle = useWindowStore((state) => state.setWindowTitle);
  const isSupportedImage = node?.type === 'file' && isImageFileName(node.name);

  useEffect(() => {
    if (!windowId) {
      return;
    }

    setWindowTitle(windowId, `Visor de imagenes - ${isSupportedImage ? node.name : 'Archivo no disponible'}`);
  }, [isSupportedImage, node?.name, setWindowTitle, windowId]);

  const openLocation = () => {
    if (node?.parentId) {
      openApp('explorer', { folderId: node.parentId });
    }
  };

  const editInPaint = () => {
    if (isSupportedImage) {
      openApp('paint', { fileId: node.id });
    }
  };

  return (
    <div className="ros-image-viewer-app">
      <div className="ros-app-toolbar" aria-label="Herramientas del visor de imagenes">
        <button className="ros-app-toolbar-button" type="button" disabled={!node?.parentId} onClick={openLocation}>
          Abrir ubicacion
        </button>
        <button className="ros-app-toolbar-button" type="button" disabled={!isSupportedImage} onClick={editInPaint}>
          Editar en Paint
        </button>
      </div>

      <div className="ros-image-viewer-stage">
        {isSupportedImage ? (
          <img src={node.content} alt={node.name} />
        ) : (
          <div className="ros-image-viewer-empty">
            <span className="ros-file-node-icon ros-file-node-icon-large" data-type="image" aria-hidden="true" />
            <h2>No se puede abrir la imagen</h2>
            <p>El archivo no existe o no es una imagen PNG compatible.</p>
          </div>
        )}
      </div>

      <footer className="ros-image-viewer-status">
        <span>{node?.name ?? 'Sin archivo'}</span>
        <span>{isSupportedImage ? getNodeTypeLabel(node) : 'No disponible'}</span>
        <span>{getFileSizeLabel(node)}</span>
      </footer>
    </div>
  );
}
