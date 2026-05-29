const recycleBinFolderId = 'recycle-bin-folder';

export const getPathLabel = (path, fallback = 'C:') =>
  path.length > 0 ? path.map((node) => node.name).join('\\') : fallback;

export const isPathInsideTrash = (path) => path.some((node) => node.id === recycleBinFolderId);

const getNodeById = (nodes, nodeId) => nodes.find((node) => node.id === nodeId) ?? null;

export const getTrashRootNode = (nodes, nodeId) => {
  let currentNode = getNodeById(nodes, nodeId);

  while (currentNode) {
    if (currentNode.parentId === recycleBinFolderId) {
      return currentNode;
    }

    currentNode = getNodeById(nodes, currentNode.parentId);
  }

  return null;
};

const getRelativeParentNames = (nodes, trashRootId, node) => {
  const names = [];
  let currentNode = getNodeById(nodes, node.parentId);

  while (currentNode && currentNode.id !== trashRootId) {
    names.unshift(currentNode.name);
    currentNode = getNodeById(nodes, currentNode.parentId);
  }

  return names;
};

export const getOriginalLocationLabel = (node, nodes, getPath) => {
  const fallback = 'No disponible, se restaurara en Escritorio';
  const trashRoot = node ? getTrashRootNode(nodes, node.id) : null;

  if (!trashRoot?.originalParentId) {
    return fallback;
  }

  const originalParentPath = getPath(trashRoot.originalParentId);

  if (originalParentPath.length === 0 || isPathInsideTrash(originalParentPath)) {
    return fallback;
  }

  const originalLocationParts = originalParentPath.map((pathNode) => pathNode.name);

  if (node.id !== trashRoot.id) {
    originalLocationParts.push(trashRoot.name, ...getRelativeParentNames(nodes, trashRoot.id, node));
  }

  return originalLocationParts.join('\\');
};
