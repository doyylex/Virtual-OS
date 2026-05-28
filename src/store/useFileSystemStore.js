import { create } from 'zustand';
import { createNodeId, loadFileSystemNodes, saveFileSystemNodes } from '../services/fileSystemDb.js';

const rootId = 'root';
const desktopFolderId = 'desktop-folder';
const recycleBinFolderId = 'recycle-bin-folder';
const protectedNodeIds = new Set([rootId, 'documents', desktopFolderId, 'system-folder', recycleBinFolderId]);

const splitFileName = (name) => {
  const trimmedName = name.trim();
  const extensionIndex = trimmedName.lastIndexOf('.');

  if (extensionIndex <= 0) {
    return { baseName: trimmedName, extension: '' };
  }

  return {
    baseName: trimmedName.slice(0, extensionIndex),
    extension: trimmedName.slice(extensionIndex),
  };
};

const getUniqueNodeName = (nodes, parentId, desiredName, ignoredNodeId = null) => {
  const cleanName = desiredName.trim();

  if (!cleanName) {
    return null;
  }

  const siblingNames = new Set(
    nodes
      .filter((node) => node.parentId === parentId && node.id !== ignoredNodeId)
      .map((node) => node.name.toLowerCase()),
  );

  if (!siblingNames.has(cleanName.toLowerCase())) {
    return cleanName;
  }

  const { baseName, extension } = splitFileName(cleanName);
  let counter = 2;
  let nextName = `${baseName} (${counter})${extension}`;

  while (siblingNames.has(nextName.toLowerCase())) {
    counter += 1;
    nextName = `${baseName} (${counter})${extension}`;
  }

  return nextName;
};

const sortNodes = (nodes) =>
  [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }

    return a.name.localeCompare(b.name, 'es');
  });

const persistNodes = (nodes) => {
  saveFileSystemNodes(nodes).catch(() => {});
};

const getDescendantIds = (nodes, nodeId) => {
  const directChildren = nodes.filter((node) => node.parentId === nodeId);

  return directChildren.flatMap((child) => [child.id, ...getDescendantIds(nodes, child.id)]);
};

const createNode = (state, parentId, type, name, content) => {
  const id = createNodeId();
  const now = Date.now();
  const uniqueName = getUniqueNodeName(state.nodes, parentId, name) ?? name;
  const node = {
    id,
    parentId,
    type,
    name: uniqueName,
    createdAt: now,
    updatedAt: now,
  };

  if (type === 'file') {
    node.content = content;
  }

  return {
    id,
    nodes: [...state.nodes, node],
  };
};

export const useFileSystemStore = create((set, get) => ({
  nodes: [],
  currentFolderId: rootId,
  selectedNodeId: null,
  isReady: false,
  error: null,

  initializeFileSystem: async () => {
    if (get().isReady) {
      return;
    }

    try {
      const nodes = await loadFileSystemNodes();
      set({ nodes, isReady: true, error: null });
    } catch {
      set({ error: 'No se pudo cargar IndexedDB.', isReady: true });
    }
  },

  setCurrentFolder: (folderId) =>
    set((state) => {
      const folder = state.nodes.find((node) => node.id === folderId && node.type === 'folder');

      if (!folder) {
        return state;
      }

      return { currentFolderId: folder.id, selectedNodeId: null };
    }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  createFolder: (parentId, name = 'Nueva carpeta') => {
    let createdId = null;

    set((state) => {
      const nextNodeState = createNode(state, parentId, 'folder', name);
      createdId = nextNodeState.id;

      persistNodes(nextNodeState.nodes);
      return { nodes: nextNodeState.nodes };
    });

    return createdId;
  },

  createFile: (parentId, name = 'nuevo.txt', content = '') => {
    let createdId = null;

    set((state) => {
      const nextNodeState = createNode(state, parentId, 'file', name, content);
      createdId = nextNodeState.id;

      persistNodes(nextNodeState.nodes);
      return { nodes: nextNodeState.nodes };
    });

    return createdId;
  },

  createDesktopFolder: () => get().createFolder(desktopFolderId, 'Nueva carpeta'),

  createDesktopTextFile: () => get().createFile(desktopFolderId, 'Nuevo documento de texto.txt', ''),

  renameNode: (nodeId, name) =>
    set((state) => {
      const targetNode = state.nodes.find((node) => node.id === nodeId);

      if (!targetNode) {
        return state;
      }

      const nextName = getUniqueNodeName(state.nodes, targetNode.parentId, name, nodeId);

      if (!nextName) {
        return state;
      }

      const nodes = state.nodes.map((node) =>
        node.id === nodeId ? { ...node, name: nextName, updatedAt: Date.now() } : node,
      );

      persistNodes(nodes);
      return { nodes };
    }),

  deleteNode: (nodeId) =>
    set((state) => {
      if (protectedNodeIds.has(nodeId)) {
        return state;
      }

      const idsToDelete = new Set([nodeId, ...getDescendantIds(state.nodes, nodeId)]);
      const nodes = state.nodes.filter((node) => !idsToDelete.has(node.id));
      const currentFolderDeleted = idsToDelete.has(state.currentFolderId);

      persistNodes(nodes);
      return {
        nodes,
        currentFolderId: currentFolderDeleted ? rootId : state.currentFolderId,
        selectedNodeId: idsToDelete.has(state.selectedNodeId) ? null : state.selectedNodeId,
      };
    }),

  moveNodeToTrash: (nodeId) =>
    set((state) => {
      const targetNode = state.nodes.find((node) => node.id === nodeId);

      if (!targetNode || protectedNodeIds.has(nodeId) || targetNode.parentId === recycleBinFolderId) {
        return state;
      }

      const trashedName = getUniqueNodeName(state.nodes, recycleBinFolderId, targetNode.name, nodeId) ?? targetNode.name;
      const nodes = state.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              parentId: recycleBinFolderId,
              name: trashedName,
              originalParentId: node.parentId,
              trashedAt: Date.now(),
              updatedAt: Date.now(),
            }
          : node,
      );

      persistNodes(nodes);
      return {
        nodes,
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      };
    }),

  emptyTrash: () =>
    set((state) => {
      const idsToDelete = new Set(getDescendantIds(state.nodes, recycleBinFolderId));

      if (idsToDelete.size === 0) {
        return state;
      }

      const nodes = state.nodes.filter((node) => !idsToDelete.has(node.id));

      persistNodes(nodes);
      return {
        nodes,
        selectedNodeId: idsToDelete.has(state.selectedNodeId) ? null : state.selectedNodeId,
      };
    }),

  updateFileContent: (nodeId, content) =>
    set((state) => {
      const nodes = state.nodes.map((node) =>
        node.id === nodeId && node.type === 'file' ? { ...node, content, updatedAt: Date.now() } : node,
      );

      persistNodes(nodes);
      return { nodes };
    }),

  getNode: (nodeId) => get().nodes.find((node) => node.id === nodeId) ?? null,
  getChildren: (folderId) => sortNodes(get().nodes.filter((node) => node.parentId === folderId)),
  getPath: (nodeId) => {
    const { nodes } = get();
    const path = [];
    let currentNode = nodes.find((node) => node.id === nodeId);

    while (currentNode) {
      path.unshift(currentNode);
      currentNode = nodes.find((node) => node.id === currentNode.parentId);
    }

    return path;
  },
}));
