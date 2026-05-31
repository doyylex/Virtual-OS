import { create } from 'zustand';
import { createNodeId, loadFileSystemNodes, saveFileSystemNodes } from '../services/fileSystemDb.js';
import { joinFileName, splitFileName } from '../services/fileNames.js';

const rootId = 'root';
const desktopFolderId = 'desktop-folder';
const recycleBinFolderId = 'recycle-bin-folder';
const protectedNodeIds = new Set([rootId, 'documents', desktopFolderId, 'system-folder', recycleBinFolderId]);

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

    return a.name.localeCompare(b.name, 'en');
  });

const persistNodes = (nodes) => {
  saveFileSystemNodes(nodes).catch(() => {});
};

const getDescendantIds = (nodes, nodeId) => {
  const directChildren = nodes.filter((node) => node.parentId === nodeId);

  return directChildren.flatMap((child) => [child.id, ...getDescendantIds(nodes, child.id)]);
};

const isNodeInsideTrash = (nodes, nodeId) => {
  let currentNode = nodes.find((node) => node.id === nodeId);

  while (currentNode) {
    if (currentNode.parentId === recycleBinFolderId) {
      return true;
    }

    currentNode = nodes.find((node) => node.id === currentNode.parentId);
  }

  return false;
};

const getTargetFolder = (nodes, targetFolderId) => {
  const folder = nodes.find((node) => node.id === targetFolderId && node.type === 'folder');

  if (!folder || folder.id === recycleBinFolderId || isNodeInsideTrash(nodes, folder.id)) {
    return null;
  }

  return folder;
};

const canOperateOnNode = (nodes, nodeId) => {
  const node = nodes.find((item) => item.id === nodeId);

  return Boolean(node && !protectedNodeIds.has(node.id) && !isNodeInsideTrash(nodes, node.id));
};

const canMoveNodeToFolder = (nodes, nodeId, targetFolderId) => {
  const node = nodes.find((item) => item.id === nodeId);
  const targetFolder = getTargetFolder(nodes, targetFolderId);

  if (!node || !targetFolder || !canOperateOnNode(nodes, nodeId)) {
    return false;
  }

  if (node.type === 'folder' && (node.id === targetFolder.id || getDescendantIds(nodes, node.id).includes(targetFolder.id))) {
    return false;
  }

  return true;
};

const canMoveTrashedNodeToFolder = (nodes, nodeId, targetFolderId) => {
  const node = nodes.find((item) => item.id === nodeId);
  const targetFolder = getTargetFolder(nodes, targetFolderId);

  if (!node || !targetFolder || protectedNodeIds.has(node.id) || !isNodeInsideTrash(nodes, node.id)) {
    return false;
  }

  if (node.type === 'folder' && (node.id === targetFolder.id || getDescendantIds(nodes, node.id).includes(targetFolder.id))) {
    return false;
  }

  return true;
};

const cloneNodeTree = (nodes, nodeId, targetFolderId) => {
  const sourceNode = nodes.find((node) => node.id === nodeId);
  const sourceIds = [nodeId, ...getDescendantIds(nodes, nodeId)];
  const idsByOriginalId = new Map(sourceIds.map((sourceId) => [sourceId, createNodeId()]));
  const now = Date.now();
  const rootCloneName = getUniqueNodeName(nodes, targetFolderId, sourceNode.name) ?? sourceNode.name;
  const clonedNodes = sourceIds.map((sourceId) => {
    const source = nodes.find((node) => node.id === sourceId);
    const clonedNode = {
      ...source,
      id: idsByOriginalId.get(source.id),
      parentId: source.id === nodeId ? targetFolderId : idsByOriginalId.get(source.parentId),
      name: source.id === nodeId ? rootCloneName : source.name,
      createdAt: now,
      updatedAt: now,
    };

    delete clonedNode.originalParentId;
    delete clonedNode.trashedAt;

    return clonedNode;
  });

  return {
    id: idsByOriginalId.get(nodeId),
    nodes: [...nodes, ...clonedNodes],
  };
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

const getRestoreParentId = (nodes, targetNode) => {
  const originalParent = nodes.find(
    (node) => node.id === targetNode.originalParentId && node.type === 'folder',
  );

  if (!originalParent || originalParent.id === recycleBinFolderId || isNodeInsideTrash(nodes, originalParent.id)) {
    return desktopFolderId;
  }

  return originalParent.id;
};

const restoreTrashNode = (nodes, nodeId) => {
  const targetNode = nodes.find((node) => node.id === nodeId);

  if (!targetNode || targetNode.parentId !== recycleBinFolderId) {
    return { nodes, restoredId: null };
  }

  const parentId = getRestoreParentId(nodes, targetNode);
  const restoredName = getUniqueNodeName(nodes, parentId, targetNode.name, nodeId) ?? targetNode.name;
  const restoredAt = Date.now();

  return {
    restoredId: nodeId,
    nodes: nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      const restoredNode = { ...node };
      delete restoredNode.originalParentId;
      delete restoredNode.trashedAt;

      return {
        ...restoredNode,
        parentId,
        name: restoredName,
        updatedAt: restoredAt,
      };
    }),
  };
};

const normalizeSelection = (nodeIds) => [...new Set(nodeIds.filter(Boolean))];

const removeSelectedNodeIds = (selectedNodeIds, removedNodeIds) =>
  selectedNodeIds.filter((nodeId) => !removedNodeIds.has(nodeId));

const getClipboardNodeIds = (clipboard) => clipboard?.nodeIds ?? (clipboard?.nodeId ? [clipboard.nodeId] : []);

const shouldClearClipboard = (clipboard, changedNodeIds) =>
  getClipboardNodeIds(clipboard).some((nodeId) => changedNodeIds.has(nodeId));

const getTopLevelNodeIds = (nodes, nodeIds) => {
  const selectedNodeIds = normalizeSelection(nodeIds);
  const selectedNodeIdSet = new Set(selectedNodeIds);

  return selectedNodeIds.filter((nodeId) => {
    let currentNode = nodes.find((node) => node.id === nodeId);

    while (currentNode?.parentId) {
      if (selectedNodeIdSet.has(currentNode.parentId)) {
        return false;
      }

      currentNode = nodes.find((node) => node.id === currentNode.parentId);
    }

    return true;
  });
};

export const useFileSystemStore = create((set, get) => ({
  nodes: [],
  clipboard: null,
  currentFolderId: rootId,
  selectedNodeIds: [],
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
      set({ error: 'IndexedDB could not be loaded.', isReady: true });
    }
  },

  setCurrentFolder: (folderId) =>
    set((state) => {
      const folder = state.nodes.find((node) => node.id === folderId && node.type === 'folder');

      if (!folder) {
        return state;
      }

      return { currentFolderId: folder.id, selectedNodeIds: [] };
    }),

  selectNode: (nodeId) => set({ selectedNodeIds: nodeId ? [nodeId] : [] }),

  setSelectedNodes: (nodeIds) => set({ selectedNodeIds: normalizeSelection(nodeIds) }),

  toggleSelectedNode: (nodeId) =>
    set((state) => {
      if (!nodeId) {
        return state;
      }

      return {
        selectedNodeIds: state.selectedNodeIds.includes(nodeId)
          ? state.selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId)
          : [...state.selectedNodeIds, nodeId],
      };
    }),

  clearSelection: () => set({ selectedNodeIds: [] }),

  setClipboard: (operation, nodeId) => get().setClipboardNodes(operation, [nodeId]),

  setClipboardNodes: (operation, nodeIds) => {
    let didSetClipboard = false;

    set((state) => {
      const isSupportedOperation = operation === 'copy' || operation === 'cut';
      const clipboardNodeIds = getTopLevelNodeIds(state.nodes, nodeIds);

      if (
        !isSupportedOperation ||
        clipboardNodeIds.length === 0 ||
        clipboardNodeIds.some((nodeId) => !canOperateOnNode(state.nodes, nodeId))
      ) {
        return state;
      }

      didSetClipboard = true;
      return { clipboard: { operation, nodeId: clipboardNodeIds[0], nodeIds: clipboardNodeIds } };
    });

    return didSetClipboard;
  },

  clearClipboard: () => set({ clipboard: null }),

  createFolder: (parentId, name = 'New Folder') => {
    let createdId = null;

    set((state) => {
      const nextNodeState = createNode(state, parentId, 'folder', name);
      createdId = nextNodeState.id;

      persistNodes(nextNodeState.nodes);
      return { nodes: nextNodeState.nodes };
    });

    return createdId;
  },

  createFile: (parentId, name = 'new.txt', content = '') => {
    let createdId = null;

    set((state) => {
      const nextNodeState = createNode(state, parentId, 'file', name, content);
      createdId = nextNodeState.id;

      persistNodes(nextNodeState.nodes);
      return { nodes: nextNodeState.nodes };
    });

    return createdId;
  },

  createFileAsync: async (parentId, name = 'new.txt', content = '') => {
    const state = get();
    const parent = state.nodes.find((node) => node.id === parentId && node.type === 'folder');

    if (!parent || parent.id === recycleBinFolderId || isNodeInsideTrash(state.nodes, parent.id)) {
      throw new Error('Cannot save to this location.');
    }

    const nextNodeState = createNode(state, parentId, 'file', name, content);
    await saveFileSystemNodes(nextNodeState.nodes);
    set({ nodes: nextNodeState.nodes });

    return nextNodeState.id;
  },

  createDesktopFolder: () => get().createFolder(desktopFolderId, 'New Folder'),

  createDesktopTextFile: () => get().createFile(desktopFolderId, 'New Text Document.txt', ''),

  renameNode: (nodeId, name) =>
    set((state) => {
      const targetNode = state.nodes.find((node) => node.id === nodeId);

      if (!targetNode) {
        return state;
      }

      const currentExtension = targetNode.type === 'file' ? splitFileName(targetNode.name).extension : '';
      const safeName = targetNode.type === 'file' ? joinFileName(name, currentExtension) : name;

      if (targetNode.type === 'file' && currentExtension && !splitFileName(safeName).baseName.trim()) {
        return state;
      }

      const nextName = getUniqueNodeName(state.nodes, targetNode.parentId, safeName, nodeId);

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
        clipboard: shouldClearClipboard(state.clipboard, idsToDelete) ? null : state.clipboard,
        currentFolderId: currentFolderDeleted ? rootId : state.currentFolderId,
        selectedNodeIds: removeSelectedNodeIds(state.selectedNodeIds, idsToDelete),
      };
    }),

  deleteNodesPermanently: (nodeIds) => {
    let deletedIds = [];

    set((state) => {
      const targetNodeIds = getTopLevelNodeIds(state.nodes, nodeIds).filter((nodeId) => {
        const node = state.nodes.find((candidateNode) => candidateNode.id === nodeId);

        return node && !protectedNodeIds.has(node.id);
      });

      if (targetNodeIds.length === 0) {
        return state;
      }

      const idsToDelete = new Set(
        targetNodeIds.flatMap((nodeId) => [nodeId, ...getDescendantIds(state.nodes, nodeId)]),
      );
      const nodes = state.nodes.filter((node) => !idsToDelete.has(node.id));
      const currentFolderDeleted = idsToDelete.has(state.currentFolderId);

      deletedIds = targetNodeIds;
      persistNodes(nodes);
      return {
        nodes,
        clipboard: shouldClearClipboard(state.clipboard, idsToDelete) ? null : state.clipboard,
        currentFolderId: currentFolderDeleted ? rootId : state.currentFolderId,
        selectedNodeIds: removeSelectedNodeIds(state.selectedNodeIds, idsToDelete),
      };
    });

    return deletedIds;
  },

  deleteNodePermanently: (nodeId) => get().deleteNode(nodeId),

  copyNodesToFolder: (nodeIds, targetFolderId) => {
    let copiedIds = [];

    set((state) => {
      if (!getTargetFolder(state.nodes, targetFolderId)) {
        return state;
      }

      const sourceNodeIds = getTopLevelNodeIds(state.nodes, nodeIds).filter((nodeId) =>
        canOperateOnNode(state.nodes, nodeId),
      );

      if (sourceNodeIds.length === 0) {
        return state;
      }

      let nodes = state.nodes;

      sourceNodeIds.forEach((nodeId) => {
        const nextNodeState = cloneNodeTree(nodes, nodeId, targetFolderId);
        copiedIds = [...copiedIds, nextNodeState.id];
        nodes = nextNodeState.nodes;
      });

      persistNodes(nodes);
      return {
        nodes,
        selectedNodeIds: copiedIds,
      };
    });

    return copiedIds;
  },

  copyNodeToFolder: (nodeId, targetFolderId) => {
    const copiedIds = get().copyNodesToFolder([nodeId], targetFolderId);

    return copiedIds[0] ?? null;
  },

  moveNodesToFolder: (nodeIds, targetFolderId) => {
    let movedIds = [];

    set((state) => {
      const sourceNodeIds = getTopLevelNodeIds(state.nodes, nodeIds);
      let nodes = state.nodes;

      sourceNodeIds.forEach((nodeId) => {
        if (!canMoveNodeToFolder(nodes, nodeId, targetFolderId)) {
          return;
        }

        const targetNode = nodes.find((node) => node.id === nodeId);

        if (targetNode.parentId === targetFolderId) {
          movedIds = [...movedIds, nodeId];
          return;
        }

        const nextName = getUniqueNodeName(nodes, targetFolderId, targetNode.name, nodeId) ?? targetNode.name;
        nodes = nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                parentId: targetFolderId,
                name: nextName,
                updatedAt: Date.now(),
              }
            : node,
        );
        movedIds = [...movedIds, nodeId];
      });

      if (movedIds.length === 0) {
        return state;
      }

      persistNodes(nodes);
      return {
        nodes,
        selectedNodeIds: movedIds,
      };
    });

    return movedIds;
  },

  moveNodeToFolder: (nodeId, targetFolderId) => {
    const movedIds = get().moveNodesToFolder([nodeId], targetFolderId);

    return movedIds[0] ?? null;
  },

  moveNodesFromTrashToFolder: (nodeIds, targetFolderId) => {
    let movedIds = [];

    set((state) => {
      const sourceNodeIds = getTopLevelNodeIds(state.nodes, nodeIds);
      let nodes = state.nodes;
      const movedTreeIds = new Set();

      sourceNodeIds.forEach((nodeId) => {
        if (!canMoveTrashedNodeToFolder(nodes, nodeId, targetFolderId)) {
          return;
        }

        const targetNode = nodes.find((node) => node.id === nodeId);
        const treeIds = [nodeId, ...getDescendantIds(nodes, nodeId)];
        const nextName = getUniqueNodeName(nodes, targetFolderId, targetNode.name, nodeId) ?? targetNode.name;

        treeIds.forEach((treeNodeId) => movedTreeIds.add(treeNodeId));
        nodes = nodes.map((node) => {
          if (node.id !== nodeId) {
            return node;
          }

          const restoredNode = {
            ...node,
            parentId: targetFolderId,
            name: nextName,
            updatedAt: Date.now(),
          };

          delete restoredNode.originalParentId;
          delete restoredNode.trashedAt;

          return restoredNode;
        });
        movedIds = [...movedIds, nodeId];
      });

      if (movedIds.length === 0) {
        return state;
      }

      persistNodes(nodes);
      return {
        nodes,
        clipboard: shouldClearClipboard(state.clipboard, movedTreeIds) ? null : state.clipboard,
        selectedNodeIds: movedIds,
      };
    });

    return movedIds;
  },

  duplicateNode: (nodeId) => {
    const node = get().nodes.find((item) => item.id === nodeId);

    if (!node) {
      return null;
    }

    return get().copyNodeToFolder(nodeId, node.parentId);
  },

  pasteClipboardToFolder: (targetFolderId) => {
    const { clipboard, nodes } = get();
    const clipboardNodeIds = getClipboardNodeIds(clipboard);

    if (!clipboard || clipboardNodeIds.length === 0 || clipboardNodeIds.some((nodeId) => !nodes.some((node) => node.id === nodeId))) {
      get().clearClipboard();
      return [];
    }

    if (clipboard.operation === 'copy') {
      return get().copyNodesToFolder(clipboardNodeIds, targetFolderId);
    }

    if (clipboard.operation === 'cut') {
      const movedIds = get().moveNodesToFolder(clipboardNodeIds, targetFolderId);

      if (movedIds.length > 0) {
        get().clearClipboard();
      }

      return movedIds;
    }

    return [];
  },

  moveNodesToTrash: (nodeIds) => {
    let movedIds = [];

    set((state) => {
      const sourceNodeIds = getTopLevelNodeIds(state.nodes, nodeIds).filter((nodeId) => {
        const targetNode = state.nodes.find((node) => node.id === nodeId);

        return targetNode && !protectedNodeIds.has(nodeId) && !isNodeInsideTrash(state.nodes, nodeId);
      });

      if (sourceNodeIds.length === 0) {
        return state;
      }

      let nodes = state.nodes;
      const movedTreeIds = new Set();

      sourceNodeIds.forEach((nodeId) => {
        const targetNode = nodes.find((node) => node.id === nodeId);

        if (!targetNode) {
          return;
        }

        [nodeId, ...getDescendantIds(nodes, nodeId)].forEach((treeNodeId) => movedTreeIds.add(treeNodeId));
        const trashedName = getUniqueNodeName(nodes, recycleBinFolderId, targetNode.name, nodeId) ?? targetNode.name;
        nodes = nodes.map((node) =>
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
        movedIds = [...movedIds, nodeId];
      });

      if (movedIds.length === 0) {
        return state;
      }

      persistNodes(nodes);
      return {
        nodes,
        clipboard: shouldClearClipboard(state.clipboard, movedTreeIds) ? null : state.clipboard,
        selectedNodeIds: removeSelectedNodeIds(state.selectedNodeIds, movedTreeIds),
      };
    });

    return movedIds;
  },

  moveNodeToTrash: (nodeId) =>
    get().moveNodesToTrash([nodeId]),

  restoreNodeFromTrash: (nodeId) =>
    set((state) => {
      const nextNodeState = restoreTrashNode(state.nodes, nodeId);

      if (!nextNodeState.restoredId) {
        return state;
      }

      persistNodes(nextNodeState.nodes);
      return {
        nodes: nextNodeState.nodes,
        clipboard: shouldClearClipboard(state.clipboard, new Set([nodeId])) ? null : state.clipboard,
        selectedNodeIds: state.selectedNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId),
      };
    }),

  restoreNodesFromTrash: (nodeIds) => {
    let restoredIds = [];

    set((state) => {
      const sourceNodeIds = getTopLevelNodeIds(state.nodes, nodeIds);

      if (sourceNodeIds.length === 0) {
        return state;
      }

      let nodes = state.nodes;
      const restoredTreeIds = new Set();

      sourceNodeIds.forEach((nodeId) => {
        const treeIds = [nodeId, ...getDescendantIds(nodes, nodeId)];
        const nextNodeState = restoreTrashNode(nodes, nodeId);

        if (!nextNodeState.restoredId) {
          return;
        }

        restoredIds = [...restoredIds, nodeId];
        treeIds.forEach((treeId) => restoredTreeIds.add(treeId));
        nodes = nextNodeState.nodes;
      });

      if (restoredIds.length === 0) {
        return state;
      }

      persistNodes(nodes);
      return {
        nodes,
        clipboard: shouldClearClipboard(state.clipboard, restoredTreeIds) ? null : state.clipboard,
        selectedNodeIds: removeSelectedNodeIds(state.selectedNodeIds, restoredTreeIds),
      };
    });

    return restoredIds;
  },

  restoreAllFromTrash: () => {
    let restoredCount = 0;

    set((state) => {
      const trashRootNodes = state.nodes.filter((node) => node.parentId === recycleBinFolderId);

      if (trashRootNodes.length === 0) {
        return state;
      }

      let nodes = state.nodes;
      const restoredTreeIds = new Set();

      trashRootNodes.forEach((node) => {
        const treeIds = [node.id, ...getDescendantIds(nodes, node.id)];
        const nextNodeState = restoreTrashNode(nodes, node.id);

        if (!nextNodeState.restoredId) {
          return;
        }

        restoredCount += 1;
        treeIds.forEach((treeId) => restoredTreeIds.add(treeId));
        nodes = nextNodeState.nodes;
      });

      if (restoredCount === 0) {
        return state;
      }

      persistNodes(nodes);
      return {
        nodes,
        clipboard: shouldClearClipboard(state.clipboard, restoredTreeIds) ? null : state.clipboard,
        selectedNodeIds: removeSelectedNodeIds(state.selectedNodeIds, restoredTreeIds),
      };
    });

    return restoredCount;
  },

  emptyTrash: () =>
    set((state) => {
      const idsToDelete = new Set(getDescendantIds(state.nodes, recycleBinFolderId));

      if (idsToDelete.size === 0) {
        return state;
      }

      const nodes = state.nodes.filter((node) => !idsToDelete.has(node.id));
      const currentFolderDeleted = idsToDelete.has(state.currentFolderId);

      persistNodes(nodes);
      return {
        nodes,
        clipboard: shouldClearClipboard(state.clipboard, idsToDelete) ? null : state.clipboard,
        currentFolderId: currentFolderDeleted ? recycleBinFolderId : state.currentFolderId,
        selectedNodeIds: removeSelectedNodeIds(state.selectedNodeIds, idsToDelete),
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

  updateFileContentAsync: async (nodeId, content) => {
    const state = get();
    const targetNode = state.nodes.find((node) => node.id === nodeId && node.type === 'file');

    if (!targetNode) {
      throw new Error('The file does not exist.');
    }

    const nodes = state.nodes.map((node) =>
      node.id === nodeId && node.type === 'file' ? { ...node, content, updatedAt: Date.now() } : node,
    );

    await saveFileSystemNodes(nodes);
    set({ nodes });
  },

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
