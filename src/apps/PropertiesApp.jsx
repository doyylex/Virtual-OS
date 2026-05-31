import { useMemo } from 'react';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { formatShortDateTime } from '../services/dateFormat.js';
import { getExplorerNodeIconType, getNodeIconTone, getNodeTypeLabel } from '../services/fileIcons.js';
import { getOriginalLocationLabel, getPathLabel, getTrashRootNode, isPathInsideTrash } from '../services/trashPaths.js';

const recycleBinFolderId = 'recycle-bin-folder';

const getFileSize = (node) => {
  if (node?.type !== 'file') {
    return null;
  }

  return new TextEncoder().encode(node.content ?? '').length;
};

export function PropertiesApp({ launchData }) {
  const nodes = useFileSystemStore((state) => state.nodes);
  const getNode = useFileSystemStore((state) => state.getNode);
  const getPath = useFileSystemStore((state) => state.getPath);
  const node = launchData?.nodeId ? getNode(launchData.nodeId) : null;
  const shortcut = launchData?.shortcut ?? null;
  const details = useMemo(() => {
    if (node) {
      const path = getPath(node.id);
      const trashItemCount = nodes.filter((candidateNode) => candidateNode.parentId === recycleBinFolderId).length;
      const childrenCount = nodes.filter((candidateNode) => candidateNode.parentId === node.id).length;
      const size = getFileSize(node);
      const isInTrash = node.id !== recycleBinFolderId && isPathInsideTrash(path);
      const trashRootNode = isInTrash ? getTrashRootNode(nodes, node.id) : null;

      return {
        title: node.name,
        type: isInTrash ? 'Item in Recycle Bin' : getNodeTypeLabel(node),
        location: getPathLabel(path.slice(0, -1), 'Desktop'),
        createdAt: formatShortDateTime(node.createdAt, 'System'),
        updatedAt: formatShortDateTime(node.updatedAt, 'System'),
        extraLabel: node.type === 'folder' ? 'Contains' : 'Size',
        extraValue: node.type === 'folder' ? `${childrenCount} items` : `${size} bytes`,
        extraRows: isInTrash
          ? [
              {
                label: 'Original Location',
                value: getOriginalLocationLabel(node, nodes, getPath),
              },
              {
                label: 'Deleted',
                value: formatShortDateTime(trashRootNode?.trashedAt),
              },
            ]
          : [],
        tone: node.id === recycleBinFolderId
          ? getExplorerNodeIconType(node, trashItemCount)
          : getNodeIconTone(node),
      };
    }

    if (shortcut) {
      return {
        title: shortcut.name,
        type: 'Shortcut',
        location: 'Desktop',
        createdAt: 'System',
        updatedAt: 'System',
        extraLabel: 'Target',
        extraValue: shortcut.description,
        extraRows: [],
        tone: shortcut.kind === 'app' ? 'computer' : 'screen',
      };
    }

    return {
      title: 'Item unavailable',
      type: 'Unknown',
      location: 'Roso OS',
      createdAt: 'System',
      updatedAt: 'System',
      extraLabel: 'Status',
      extraValue: 'No information was found for this item.',
      extraRows: [],
      tone: 'settings',
    };
  }, [getPath, node, nodes, shortcut]);

  return (
    <div className="ros-properties-app">
      <header className="ros-properties-header">
        <span className="ros-properties-icon" data-tone={details.tone} aria-hidden="true" />
        <div>
          <h1>{details.title}</h1>
          <p>{details.type}</p>
        </div>
      </header>

      <dl className="ros-properties-list">
        <div>
          <dt>Location</dt>
          <dd>{details.location}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{details.createdAt}</dd>
        </div>
        <div>
          <dt>Modified</dt>
          <dd>{details.updatedAt}</dd>
        </div>
        <div>
          <dt>{details.extraLabel}</dt>
          <dd>{details.extraValue}</dd>
        </div>
        {details.extraRows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
