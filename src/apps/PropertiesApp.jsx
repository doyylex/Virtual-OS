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
        type: isInTrash ? 'Elemento en Papelera' : getNodeTypeLabel(node),
        location: getPathLabel(path.slice(0, -1), 'Escritorio'),
        createdAt: formatShortDateTime(node.createdAt, 'Sistema'),
        updatedAt: formatShortDateTime(node.updatedAt, 'Sistema'),
        extraLabel: node.type === 'folder' ? 'Contiene' : 'Tamano',
        extraValue: node.type === 'folder' ? `${childrenCount} elementos` : `${size} bytes`,
        extraRows: isInTrash
          ? [
              {
                label: 'Ubicacion original',
                value: getOriginalLocationLabel(node, nodes, getPath),
              },
              {
                label: 'Eliminado',
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
        type: 'Acceso directo',
        location: 'Escritorio',
        createdAt: 'Sistema',
        updatedAt: 'Sistema',
        extraLabel: 'Destino',
        extraValue: shortcut.description,
        extraRows: [],
        tone: shortcut.kind === 'app' ? 'computer' : 'screen',
      };
    }

    return {
      title: 'Elemento no disponible',
      type: 'Desconocido',
      location: 'Roso OS',
      createdAt: 'Sistema',
      updatedAt: 'Sistema',
      extraLabel: 'Estado',
      extraValue: 'No se encontro informacion del elemento.',
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
          <dt>Ubicacion</dt>
          <dd>{details.location}</dd>
        </div>
        <div>
          <dt>Creado</dt>
          <dd>{details.createdAt}</dd>
        </div>
        <div>
          <dt>Modificado</dt>
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
