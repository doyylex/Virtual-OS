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

    setWindowTitle(windowId, `Image Viewer - ${isSupportedImage ? node.name : 'File unavailable'}`);
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
      <div className="ros-app-toolbar" aria-label="Image Viewer tools">
        <button className="ros-app-toolbar-button" type="button" disabled={!node?.parentId} onClick={openLocation}>
          Open location
        </button>
        <button className="ros-app-toolbar-button" type="button" disabled={!isSupportedImage} onClick={editInPaint}>
          Edit in Paint
        </button>
      </div>

      <div className="ros-image-viewer-stage">
        {isSupportedImage ? (
          <img src={node.content} alt={node.name} />
        ) : (
          <div className="ros-image-viewer-empty">
            <span className="ros-file-node-icon ros-file-node-icon-large" data-type="image" aria-hidden="true" />
            <h2>Cannot open image</h2>
            <p>The file does not exist or is not a compatible PNG image.</p>
          </div>
        )}
      </div>

      <footer className="ros-image-viewer-status">
        <span>{node?.name ?? 'No file'}</span>
        <span>{isSupportedImage ? getNodeTypeLabel(node) : 'Unavailable'}</span>
        <span>{getFileSizeLabel(node)}</span>
      </footer>
    </div>
  );
}
