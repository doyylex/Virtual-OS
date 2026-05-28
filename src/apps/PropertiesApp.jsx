import { useMemo } from 'react';
import { useFileSystemStore } from '../store/useFileSystemStore.js';

const formatDate = (timestamp) =>
  timestamp
    ? new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(timestamp))
    : 'Sistema';

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
      const childrenCount = nodes.filter((candidateNode) => candidateNode.parentId === node.id).length;
      const size = getFileSize(node);

      return {
        title: node.name,
        type: node.type === 'folder' ? 'Carpeta' : 'Archivo de texto',
        location: path.slice(0, -1).map((pathNode) => pathNode.name).join('\\') || 'Escritorio',
        createdAt: formatDate(node.createdAt),
        updatedAt: formatDate(node.updatedAt),
        extraLabel: node.type === 'folder' ? 'Contiene' : 'Tamano',
        extraValue: node.type === 'folder' ? `${childrenCount} elementos` : `${size} bytes`,
        tone: node.type === 'folder' ? 'folder' : 'notepad',
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
      </dl>
    </div>
  );
}
