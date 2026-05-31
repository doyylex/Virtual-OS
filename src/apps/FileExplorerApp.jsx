import { useEffect, useMemo, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { findNextDesktopPosition, snapDesktopPosition } from '../services/desktopLayout.js';
import { useDialogStore } from '../store/useDialogStore.js';
import { useDesktopLayoutStore } from '../store/useDesktopLayoutStore.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useWindowStore } from '../store/useWindowStore.js';
import { DesktopContextMenu } from '../components/DesktopContextMenu.jsx';
import { dispatchPaintFileDrop, getFileDropTargetFromPoint } from '../services/fileDropTargets.js';
import { getEditableNodeName, stripLockedExtension } from '../services/fileNames.js';
import { getExplorerNodeIconType, getNodeTypeLabel, isImageFileName, isTextFileName } from '../services/fileIcons.js';
import { formatShortDateTime } from '../services/dateFormat.js';
import { nodeMatchesSearchQuery, normalizeSearchText } from '../services/search.js';
import { getOriginalLocationLabel, getPathLabel, getTrashRootNode, isPathInsideTrash } from '../services/trashPaths.js';

const CONTEXT_MENU_WIDTH = 214;
const CONTEXT_MENU_ITEM_HEIGHT = 28;
const TASKBAR_HEIGHT = 40;
const desktopFolderId = 'desktop-folder';
const recycleBinFolderId = 'recycle-bin-folder';
const protectedNodeIds = new Set(['root', 'documents', 'desktop-folder', 'system-folder', recycleBinFolderId]);
const desktopDropIconOffset = { x: 39, y: 37 };
const viewModes = [
  { id: 'details', label: 'Detalles' },
  { id: 'list', label: 'Lista' },
  { id: 'icons', label: 'Iconos' },
];
const sortOptions = [
  { id: 'name', label: 'Nombre' },
  { id: 'type', label: 'Tipo' },
  { id: 'updatedAt', label: 'Fecha' },
];

const isTextEntryElement = (target) =>
  target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

const getDescendantIds = (nodes, nodeId) => {
  const directChildren = nodes.filter((node) => node.parentId === nodeId);

  return directChildren.flatMap((child) => [child.id, ...getDescendantIds(nodes, child.id)]);
};

const clearActiveFileDropTargets = () => {
  document
    .querySelectorAll("[data-file-drop-active='true']")
    .forEach((element) => {
      element.dataset.fileDropActive = 'false';
    });
};

const getDesktopDropPosition = (clientX, clientY) =>
  snapDesktopPosition({
    x: clientX - desktopDropIconOffset.x,
    y: clientY - desktopDropIconOffset.y,
  });

const getContextMenuPosition = (event, itemCount) => ({
  x: Math.max(4, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 8)),
  y: Math.max(4, Math.min(event.clientY, window.innerHeight - TASKBAR_HEIGHT - itemCount * CONTEXT_MENU_ITEM_HEIGHT - 10)),
});

const getFileSize = (node) => {
  if (node?.type !== 'file') {
    return null;
  }

  return new TextEncoder().encode(node.content ?? '').length;
};

const getFileSizeLabel = (node) => {
  const size = getFileSize(node);

  if (size === null) {
    return null;
  }

  return `${size} bytes`;
};

const getSortValue = (node, sortBy) => {
  if (sortBy === 'type') {
    return getNodeTypeLabel(node).toLowerCase();
  }

  if (sortBy === 'updatedAt') {
    return Number(node.updatedAt) || 0;
  }

  return node.name.toLowerCase();
};

const sortExplorerNodes = (items, sortBy, sortDirection) =>
  [...items].sort((firstNode, secondNode) => {
    if (sortBy === 'name' && firstNode.type !== secondNode.type) {
      return firstNode.type === 'folder' ? -1 : 1;
    }

    const firstValue = getSortValue(firstNode, sortBy);
    const secondValue = getSortValue(secondNode, sortBy);
    let comparison =
      typeof firstValue === 'number'
        ? firstValue - secondValue
        : firstValue.localeCompare(secondValue, 'es');

    if (comparison === 0) {
      comparison = firstNode.name.localeCompare(secondNode.name, 'es');
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

const getSortHint = (sortBy, sortDirection) => {
  if (sortBy === 'updatedAt') {
    return sortDirection === 'asc' ? 'antiguo' : 'reciente';
  }

  return sortDirection === 'asc' ? 'A-Z' : 'Z-A';
};

const isNodeInsideFolder = (nodes, node, folderId) => {
  let currentNode = node;

  while (currentNode?.parentId) {
    if (currentNode.parentId === folderId) {
      return true;
    }

    currentNode = nodes.find((candidateNode) => candidateNode.id === currentNode.parentId);
  }

  return false;
};

export function FileExplorerApp({ launchData, windowId }) {
  const [contextMenu, setContextMenu] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const [draggingNodeIds, setDraggingNodeIds] = useState([]);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState(() => launchData?.searchQuery ?? '');
  const [selectedNodeIds, setSelectedNodeIdsState] = useState([]);
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [viewMode, setViewMode] = useState('details');
  const searchInputRef = useRef(null);
  const nodes = useFileSystemStore((state) => state.nodes);
  const storedCurrentFolderId = useFileSystemStore((state) => state.currentFolderId);
  const isReady = useFileSystemStore((state) => state.isReady);
  const error = useFileSystemStore((state) => state.error);
  const setStoredCurrentFolder = useFileSystemStore((state) => state.setCurrentFolder);
  const createFolder = useFileSystemStore((state) => state.createFolder);
  const createFile = useFileSystemStore((state) => state.createFile);
  const clipboard = useFileSystemStore((state) => state.clipboard);
  const duplicateNode = useFileSystemStore((state) => state.duplicateNode);
  const deleteNodesPermanently = useFileSystemStore((state) => state.deleteNodesPermanently);
  const deleteNodePermanently = useFileSystemStore((state) => state.deleteNodePermanently);
  const emptyTrash = useFileSystemStore((state) => state.emptyTrash);
  const pasteClipboardToFolder = useFileSystemStore((state) => state.pasteClipboardToFolder);
  const renameNode = useFileSystemStore((state) => state.renameNode);
  const setClipboardNodes = useFileSystemStore((state) => state.setClipboardNodes);
  const moveNodesFromTrashToFolder = useFileSystemStore((state) => state.moveNodesFromTrashToFolder);
  const moveNodesToFolder = useFileSystemStore((state) => state.moveNodesToFolder);
  const moveNodesToTrash = useFileSystemStore((state) => state.moveNodesToTrash);
  const moveNodeToTrash = useFileSystemStore((state) => state.moveNodeToTrash);
  const restoreAllFromTrash = useFileSystemStore((state) => state.restoreAllFromTrash);
  const restoreNodesFromTrash = useFileSystemStore((state) => state.restoreNodesFromTrash);
  const restoreNodeFromTrash = useFileSystemStore((state) => state.restoreNodeFromTrash);
  const getChildren = useFileSystemStore((state) => state.getChildren);
  const getNode = useFileSystemStore((state) => state.getNode);
  const getPath = useFileSystemStore((state) => state.getPath);
  const showConfirm = useDialogStore((state) => state.showConfirm);
  const iconPositions = useDesktopLayoutStore((state) => state.iconPositions);
  const setIconPosition = useDesktopLayoutStore((state) => state.setIconPosition);
  const openApp = useWindowStore((state) => state.openApp);
  const setWindowTitle = useWindowStore((state) => state.setWindowTitle);
  const playSound = useSystemSound();
  const getInitialFolderId = () => {
    const launchFolder = launchData?.folderId ? getNode(launchData.folderId) : null;
    const storedFolder = getNode(storedCurrentFolderId);

    return launchFolder?.type === 'folder' ? launchFolder.id : storedFolder?.id ?? 'root';
  };
  const [history, setHistory] = useState(() => [getInitialFolderId()]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectionAnchorNodeId, setSelectionAnchorNodeId] = useState(null);
  const currentFolderId = history[historyIndex] ?? 'root';

  const folderChildren = getChildren(currentFolderId);
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const isSearchActive = normalizedSearchQuery.length > 0;
  const searchResults = useMemo(
    () =>
      isSearchActive
        ? nodes.filter((node) =>
            node.id !== currentFolderId &&
            isNodeInsideFolder(nodes, node, currentFolderId) &&
            nodeMatchesSearchQuery(node, normalizedSearchQuery),
          )
        : [],
    [currentFolderId, isSearchActive, nodes, normalizedSearchQuery],
  );
  const children = useMemo(
    () => sortExplorerNodes(isSearchActive ? searchResults : folderChildren, sortBy, sortDirection),
    [folderChildren, isSearchActive, searchResults, sortBy, sortDirection],
  );
  const path = getPath(currentFolderId);
  const visibleNodeIdSet = useMemo(() => new Set(children.map((node) => node.id)), [children]);
  const visibleSelectedNodeIds = useMemo(
    () => selectedNodeIds.filter((nodeId) => visibleNodeIdSet.has(nodeId)),
    [selectedNodeIds, visibleNodeIdSet],
  );
  const selectedNodeIdSet = useMemo(() => new Set(visibleSelectedNodeIds), [visibleSelectedNodeIds]);
  const selectedNodes = useMemo(
    () => visibleSelectedNodeIds.map((nodeId) => nodes.find((node) => node.id === nodeId)).filter(Boolean),
    [nodes, visibleSelectedNodeIds],
  );
  const hasSingleSelection = selectedNodes.length === 1;
  const hasMultipleSelection = selectedNodes.length > 1;
  const selectedNode = hasSingleSelection ? selectedNodes[0] : null;
  const currentFolder = getNode(currentFolderId);
  const contextTargetNode = nodes.find((node) => node.id === contextMenu?.nodeId) ?? null;
  const clipboardNodeIds = clipboard?.nodeIds ?? (clipboard?.nodeId ? [clipboard.nodeId] : []);
  const clipboardNodes = clipboardNodeIds.map((nodeId) => nodes.find((node) => node.id === nodeId)).filter(Boolean);
  const selectedNodePath = selectedNode ? getPath(selectedNode.id) : [];
  const clipboardNodePaths = clipboardNodes.map((node) => getPath(node.id));
  const currentFolderTitle = currentFolder?.id === recycleBinFolderId ? 'Papelera' : currentFolder?.name ?? 'Carpeta';
  const isRecycleBinFolder = currentFolderId === recycleBinFolderId;
  const isCurrentFolderInTrash = isPathInsideTrash(path);
  const isSelectedNodeInTrash = isPathInsideTrash(selectedNodePath);
  const isClipboardNodeInTrash = clipboardNodePaths.some((clipboardPath) => isPathInsideTrash(clipboardPath));
  const isCutTargetInsideClipboardNode = Boolean(
    clipboard?.operation === 'cut' &&
      clipboardNodes.some(
        (clipboardNode) =>
          clipboardNode.type === 'folder' && path.some((pathNode) => pathNode.id === clipboardNode.id),
      ),
  );
  const trashItemCount = nodes.filter((node) => node.parentId === recycleBinFolderId).length;
  const trimmedSearchQuery = searchQuery.trim();
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;
  const canGoUp = Boolean(currentFolder?.parentId);
  const canCreateInCurrentFolder = !isCurrentFolderInTrash;
  const canRenameSelectedNode = Boolean(hasSingleSelection && selectedNode && !isSelectedNodeInTrash);
  const canOperateSelectedNodes = Boolean(
    selectedNodes.length > 0 &&
      selectedNodes.every(
        (node) => !protectedNodeIds.has(node.id) && !isPathInsideTrash(getPath(node.id)),
      ),
  );
  const canOperateSelectedNode = Boolean(
    hasSingleSelection && selectedNode && !protectedNodeIds.has(selectedNode.id) && !isSelectedNodeInTrash,
  );
  const canPasteInCurrentFolder = Boolean(
    clipboardNodeIds.length > 0 &&
      clipboardNodes.length === clipboardNodeIds.length &&
      clipboardNodes.every((node) => !protectedNodeIds.has(node.id)) &&
      !isClipboardNodeInTrash &&
      !isCurrentFolderInTrash &&
      !isCutTargetInsideClipboardNode,
  );
  const canRestoreSelectedNodes = Boolean(
    selectedNodes.length > 0 && selectedNodes.every((node) => node.parentId === recycleBinFolderId),
  );
  const canDeleteSelectedNodes = Boolean(
    selectedNodes.length > 0 && selectedNodes.every((node) => !protectedNodeIds.has(node.id)),
  );
  const addressText = path.length > 0 ? path.map((node) => node.name).join('\\') : 'C:';
  const searchScopeText = path.length > 0 ? path.map((node) => node.name).join('\\') : 'C:';
  const explorerSearchInputId = `${windowId ?? 'explorer'}-search`;
  const selectedNodeParentPath = selectedNode
    ? getPathLabel(getPath(selectedNode.parentId))
    : '';
  const selectedNodeOriginalLocation = selectedNode && isSelectedNodeInTrash
    ? getOriginalLocationLabel(selectedNode, nodes, getPath)
    : '';
  const selectedTrashRootNode = selectedNode && isSelectedNodeInTrash
    ? getTrashRootNode(nodes, selectedNode.id)
    : null;
  const selectedNodeChildrenCount = selectedNode?.type === 'folder'
    ? nodes.filter((node) => node.parentId === selectedNode.id).length
    : 0;
  const selectedNodeSize = getFileSizeLabel(selectedNode);
  const isSelectedNodeImage = selectedNode?.type === 'file' && isImageFileName(selectedNode.name);
  const selectedFolderCount = selectedNodes.filter((node) => node.type === 'folder').length;
  const selectedFileCount = selectedNodes.filter((node) => node.type === 'file').length;

  const folderTree = useMemo(() => nodes.filter((node) => node.type === 'folder'), [nodes]);
  const closeContextMenu = () => setContextMenu(null);
  const getNodeDropFolderId = (node) => {
    if (node?.id === recycleBinFolderId) {
      return recycleBinFolderId;
    }

    return node?.type === 'folder' && !isPathInsideTrash(getPath(node.id)) ? node.id : undefined;
  };
  const setSelectedNodes = (nodeIds) => {
    setSelectedNodeIdsState([...new Set(nodeIds.filter(Boolean))]);
  };
  const clearExplorerSelection = () => {
    setSelectedNodes([]);
    setSelectionAnchorNodeId(null);
  };
  const selectSingleNode = (nodeId) => {
    setSelectedNodes(nodeId ? [nodeId] : []);
    setSelectionAnchorNodeId(nodeId ?? null);
  };
  const handleSearchChange = (value) => {
    if (!normalizedSearchQuery && normalizeSearchText(value)) {
      playSound('search');
    }

    setSearchQuery(value);
    clearExplorerSelection();
    closeContextMenu();
    cancelRename();
  };
  const clearSearch = () => {
    handleSearchChange('');
    searchInputRef.current?.focus();
  };
  const toggleSelectedNode = (nodeId) => {
    if (!nodeId) {
      return;
    }

    setSelectedNodeIdsState((currentNodeIds) =>
      currentNodeIds.includes(nodeId)
        ? currentNodeIds.filter((selectedNodeId) => selectedNodeId !== nodeId)
        : [...currentNodeIds, nodeId],
    );
  };
  const getRangeSelectionNodeIds = (anchorNodeId, targetNodeId) => {
    const anchorIndex = children.findIndex((node) => node.id === anchorNodeId);
    const targetIndex = children.findIndex((node) => node.id === targetNodeId);

    if (anchorIndex === -1 || targetIndex === -1) {
      return [targetNodeId];
    }

    const startIndex = Math.min(anchorIndex, targetIndex);
    const endIndex = Math.max(anchorIndex, targetIndex);

    return children.slice(startIndex, endIndex + 1).map((node) => node.id);
  };
  const handleNodeSelection = (event, node) => {
    closeContextMenu();

    if (event.shiftKey) {
      const anchorNodeId = selectionAnchorNodeId ?? visibleSelectedNodeIds[0] ?? node.id;
      setSelectedNodes(getRangeSelectionNodeIds(anchorNodeId, node.id));
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      toggleSelectedNode(node.id);
      setSelectionAnchorNodeId(node.id);
      return;
    }

    selectSingleNode(node.id);
  };

  useEffect(() => {
    if (!windowId) {
      return;
    }

    setWindowTitle(
      windowId,
      isSearchActive ? `Explorador - Buscar "${trimmedSearchQuery}"` : `Explorador - ${currentFolderTitle}`,
    );
  }, [currentFolderTitle, isSearchActive, setWindowTitle, trimmedSearchQuery, windowId]);

  const handleSortChange = (nextSortBy) => {
    closeContextMenu();

    if (sortBy === nextSortBy) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      playSound('click');
      return;
    }

    setSortBy(nextSortBy);
    setSortDirection(nextSortBy === 'updatedAt' ? 'desc' : 'asc');
    playSound('click');
  };

  const handleViewModeChange = (nextViewMode) => {
    if (viewMode === nextViewMode) {
      return;
    }

    closeContextMenu();
    setViewMode(nextViewMode);
    playSound('click');
  };

  const navigateToFolder = (folderId) => {
    const folder = getNode(folderId);

    if (folder?.type !== 'folder' || folder.id === currentFolderId) {
      return false;
    }

    const nextHistoryIndex = historyIndex + 1;
    setHistory([...history.slice(0, nextHistoryIndex), folder.id]);
    setHistoryIndex(nextHistoryIndex);
    setStoredCurrentFolder(folder.id);
    clearExplorerSelection();
    closeContextMenu();
    cancelRename();
    return true;
  };

  const goToHistoryIndex = (nextHistoryIndex) => {
    const folder = getNode(history[nextHistoryIndex]);

    if (folder?.type !== 'folder') {
      return false;
    }

    setHistoryIndex(nextHistoryIndex);
    setStoredCurrentFolder(folder.id);
    clearExplorerSelection();
    closeContextMenu();
    cancelRename();
    return true;
  };

  const openFolder = (folderId) => {
    if (navigateToFolder(folderId)) {
      playSound('navigation');
    }
  };

  const goBack = () => {
    if (canGoBack && goToHistoryIndex(historyIndex - 1)) {
      playSound('navigation');
    }
  };

  const goForward = () => {
    if (canGoForward && goToHistoryIndex(historyIndex + 1)) {
      playSound('navigation');
    }
  };

  const goUp = () => {
    if (currentFolder?.parentId && navigateToFolder(currentFolder.parentId)) {
      playSound('navigation');
    }
  };

  const handleCreateFolder = () => {
    if (!canCreateInCurrentFolder) {
      return;
    }

    const createdId = createFolder(currentFolderId, 'Nueva carpeta');
    const createdNode = useFileSystemStore.getState().getNode(createdId);

    closeContextMenu();
    selectSingleNode(createdId);
    setEditingNodeId(createdId);
    setDraftName(createdNode?.name ?? 'Nueva carpeta');
    playSound('click');
  };

  const handleCreateFile = () => {
    if (!canCreateInCurrentFolder) {
      return;
    }

    const createdId = createFile(currentFolderId, 'Nuevo documento de texto.txt', '');
    const createdNode = useFileSystemStore.getState().getNode(createdId);

    closeContextMenu();
    selectSingleNode(createdId);
    setEditingNodeId(createdId);
    setDraftName(getEditableNodeName(createdNode).baseName);
    playSound('click');
  };

  const getActionNodes = (targetNode) => {
    if (targetNode && selectedNodeIdSet.has(targetNode.id)) {
      return selectedNodes;
    }

    if (targetNode) {
      return [targetNode];
    }

    return selectedNodes;
  };

  const getElementCountLabel = (items) =>
    `${items.length} elemento${items.length === 1 ? '' : 's'}`;

  const canOperateNodes = (items) =>
    items.length > 0 &&
    items.every((node) => !protectedNodeIds.has(node.id) && !isPathInsideTrash(getPath(node.id)));

  const canDeleteNodes = (items) => items.length > 0 && items.every((node) => !protectedNodeIds.has(node.id));

  const canRestoreNodes = (items) => items.length > 0 && items.every((node) => node.parentId === recycleBinFolderId);

  const handleCopyNodes = (items) => {
    if (!canOperateNodes(items) || !setClipboardNodes('copy', items.map((node) => node.id))) {
      return;
    }

    closeContextMenu();
    cancelRename();
    playSound('click');
  };

  const handleCutNodes = (items) => {
    if (!canOperateNodes(items) || !setClipboardNodes('cut', items.map((node) => node.id))) {
      return;
    }

    closeContextMenu();
    cancelRename();
    playSound('click');
  };

  const handlePaste = () => {
    closeContextMenu();
    cancelRename();

    const pastedNodeIds = pasteClipboardToFolder(currentFolderId);

    if (pastedNodeIds.length > 0) {
      setSelectedNodes(pastedNodeIds);
      setSelectionAnchorNodeId(pastedNodeIds[0]);
      playSound('click');
    }
  };

  const handleDuplicateNode = (node) => {
    if (!node) {
      return;
    }

    closeContextMenu();
    cancelRename();

    const duplicatedNodeId = duplicateNode(node.id);

    if (duplicatedNodeId) {
      selectSingleNode(duplicatedNodeId);
      playSound('click');
    }
  };

  function cancelRename() {
    setEditingNodeId(null);
    setDraftName('');
  }

  const beginRename = (node) => {
    if (!node) {
      return;
    }

    if (node.parentId === recycleBinFolderId) {
      return;
    }

    closeContextMenu();
    selectSingleNode(node.id);
    setEditingNodeId(node.id);
    setDraftName(getEditableNodeName(node).baseName);
    playSound('click');
  };

  const commitRename = () => {
    const nextName = draftName.trim();

    if (editingNodeId && nextName) {
      renameNode(editingNodeId, nextName);
      playSound('rename');
    }

    cancelRename();
  };

  const handleDeleteNodes = async (items) => {
    if (!canDeleteNodes(items)) {
      return;
    }

    closeContextMenu();
    cancelRename();

    if (items.every((node) => isPathInsideTrash(getPath(node.id)))) {
      const confirmed = await showConfirm({
        title: 'Eliminar permanentemente',
        message:
          items.length === 1
            ? `Eliminar permanentemente "${items[0].name}"?`
            : `Eliminar permanentemente ${getElementCountLabel(items)}?`,
        detail: 'Esta accion no se puede deshacer.',
        confirmLabel: 'Eliminar',
        icon: 'warning',
      });

      if (confirmed) {
        if (items.length === 1) {
          deleteNodePermanently(items[0].id);
        } else {
          deleteNodesPermanently(items.map((node) => node.id));
        }
        playSound('delete');
      }

      return;
    }

    const movedIds = items.length === 1
      ? moveNodeToTrash(items[0].id)
      : moveNodesToTrash(items.map((node) => node.id));

    if (movedIds.length > 0) {
      playSound('trash');
    }
  };

  const handleRestoreNodes = (items) => {
    if (!canRestoreNodes(items)) {
      return;
    }

    closeContextMenu();
    cancelRename();

    if (items.length === 1) {
      restoreNodeFromTrash(items[0].id);
    } else {
      restoreNodesFromTrash(items.map((node) => node.id));
    }
    playSound('restoreFile');
  };

  const handleRestoreAllTrash = async () => {
    if (trashItemCount === 0) {
      return;
    }

    closeContextMenu();
    cancelRename();

    const confirmed = await showConfirm({
      title: 'Restaurar todos',
      message: `Restaurar ${trashItemCount} elemento${trashItemCount === 1 ? '' : 's'} de la Papelera?`,
      detail: 'Los elementos volveran a su ubicacion original. Si ya no existe, se restauraran en el Escritorio.',
      confirmLabel: 'Restaurar',
      icon: 'question',
    });

    if (confirmed) {
      restoreAllFromTrash();
      playSound('restoreFile');
    }
  };

  const confirmMoveNodesToTrash = async (items) => {
    if (items.length === 0) {
      return false;
    }

    return showConfirm({
      title: 'Mover a Papelera',
      message:
        items.length === 1
          ? `Mover "${items[0].name}" a la Papelera?`
          : `Mover ${getElementCountLabel(items)} a la Papelera?`,
      detail: 'Podras restaurarlo desde la Papelera si lo necesitas.',
      confirmLabel: 'Mover',
      icon: 'warning',
    });
  };

  const confirmMoveNodesFromTrash = async (items, targetFolderId) => {
    if (items.length === 0) {
      return false;
    }

    return showConfirm({
      title: 'Restaurar desde Papelera',
      message:
        items.length === 1
          ? `Restaurar "${items[0].name}"?`
          : `Restaurar ${getElementCountLabel(items)}?`,
      detail: `Se movera a ${getDropFolderLabel(targetFolderId)} y dejara de estar en la Papelera.`,
      confirmLabel: 'Restaurar',
      icon: 'warning',
    });
  };

  const handleEmptyTrash = async () => {
    if (trashItemCount === 0) {
      return;
    }

    closeContextMenu();
    cancelRename();

    const confirmed = await showConfirm({
      title: 'Vaciar Papelera',
      message: 'Eliminar permanentemente todos los elementos de la Papelera?',
      detail: 'Todos los archivos de la Papelera se borraran de forma definitiva.',
      confirmLabel: 'Vaciar',
      icon: 'warning',
    });

    if (confirmed) {
      emptyTrash();
      playSound('delete');
    }
  };

  const handleOpenNode = (node) => {
    closeContextMenu();
    cancelRename();
    selectSingleNode(node.id);

    if (node.type === 'folder') {
      openFolder(node.id);
      return;
    }

    if (node.type === 'file' && isTextFileName(node.name)) {
      openApp('notepad', { fileId: node.id });
      playSound('open');
      return;
    }

    if (node.type === 'file' && isImageFileName(node.name)) {
      openApp('image-viewer', { fileId: node.id });
      playSound('open');
    }
  };

  const openProperties = (node) => {
    closeContextMenu();
    cancelRename();
    openApp('properties', { nodeId: node?.id ?? currentFolderId });
    playSound('open');
  };

  const canDropNodeToFolder = (sourceNode, targetFolderId) => {
    const targetFolder = nodes.find((node) => node.id === targetFolderId && node.type === 'folder');

    if (!sourceNode || !targetFolder || protectedNodeIds.has(sourceNode.id)) {
      return false;
    }

    const sourceInTrash = isPathInsideTrash(getPath(sourceNode.id));
    const targetInTrash = targetFolder.id === recycleBinFolderId || isPathInsideTrash(getPath(targetFolder.id));

    if (sourceInTrash) {
      return !targetInTrash;
    }

    if (targetInTrash && targetFolder.id === recycleBinFolderId) {
      return true;
    }

    if (targetInTrash) {
      return false;
    }

    if (
      sourceNode.type === 'folder' &&
      (sourceNode.id === targetFolder.id || getDescendantIds(nodes, sourceNode.id).includes(targetFolder.id))
    ) {
      return false;
    }

    return true;
  };

  const canDropNodesToFolder = (items, targetFolderId) =>
    items.length > 0 && items.every((item) => canDropNodeToFolder(item, targetFolderId));

  const canDropNodesToPaint = (items) =>
    items.length === 1 &&
    items[0].type === 'file' &&
    isImageFileName(items[0].name) &&
    !isPathInsideTrash(getPath(items[0].id));

  const getDropFolderLabel = (folderId) => {
    if (folderId === desktopFolderId) {
      return 'Escritorio';
    }

    if (folderId === recycleBinFolderId) {
      return 'Papelera';
    }

    return getNode(folderId)?.name ?? 'carpeta';
  };

  const getDragDropFeedback = (dropTarget, isValidDropTarget, isTrashDrag) => {
    if (!dropTarget) {
      return { state: 'invalid', label: 'No se puede soltar aqui' };
    }

    if (!isValidDropTarget) {
      return { state: 'invalid', label: 'No se puede soltar aqui' };
    }

    if (dropTarget.type === 'paint') {
      return { state: 'valid', label: 'Editar en Paint' };
    }

    if (dropTarget.folderId === recycleBinFolderId) {
      return { state: 'valid', label: 'Enviar a Papelera' };
    }

    if (isTrashDrag) {
      return { state: 'valid', label: `Restaurar en ${getDropFolderLabel(dropTarget.folderId)}` };
    }

    return { state: 'valid', label: `Mover a ${getDropFolderLabel(dropTarget.folderId)}` };
  };

  const placeMovedNodesOnDesktop = (nodeIds, dropPosition) => {
    let nextIconPositions = { ...iconPositions };
    const positionedIconIds = Object.keys(nextIconPositions);

    nodeIds.forEach((nodeId, index) => {
      const iconId = `fs:${nodeId}`;
      const nextPosition = index === 0
        ? getDesktopDropPosition(dropPosition.x, dropPosition.y)
        : findNextDesktopPosition(positionedIconIds, nextIconPositions);

      nextIconPositions = {
        ...nextIconPositions,
        [iconId]: nextPosition,
      };
      positionedIconIds.push(iconId);
      setIconPosition(iconId, nextPosition);
    });
  };

  const handleNodePointerDown = (event, node, isEditing) => {
    if (event.button !== 0 || isEditing || protectedNodeIds.has(node.id)) {
      return;
    }

    event.stopPropagation();
    closeContextMenu();
    cancelRename();

    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !selectedNodeIdSet.has(node.id)) {
      selectSingleNode(node.id);
    }

    const dragNodes = selectedNodeIdSet.has(node.id) ? selectedNodes : [node];
    const dragNodeIds = dragNodes.map((dragNode) => dragNode.id);
    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const startClientPosition = { x: event.clientX, y: event.clientY };
    let didMove = false;
    let latestClientPosition = startClientPosition;
    let latestDropTarget = null;
    let activeDropElement = null;

    element.setPointerCapture(pointerId);

    const setActiveDropTarget = (dropTarget) => {
      if (activeDropElement === dropTarget?.element) {
        return;
      }

      if (activeDropElement) {
        activeDropElement.dataset.fileDropActive = 'false';
      }

      activeDropElement = dropTarget?.element ?? null;

      if (activeDropElement) {
        activeDropElement.dataset.fileDropActive = 'true';
      }
    };

    const handlePointerMove = (moveEvent) => {
      const delta = {
        x: moveEvent.clientX - startClientPosition.x,
        y: moveEvent.clientY - startClientPosition.y,
      };

      if (!didMove && Math.hypot(delta.x, delta.y) < 4) {
        return;
      }

      didMove = true;
      latestClientPosition = { x: moveEvent.clientX, y: moveEvent.clientY };
      setDraggingNodeIds(dragNodeIds);

      const dropTarget = getFileDropTargetFromPoint(moveEvent.clientX, moveEvent.clientY, element);
      const isTrashDrag = dragNodes.some((dragNode) => isPathInsideTrash(getPath(dragNode.id)));
      const isValidDropTarget = Boolean(
        dropTarget &&
        (dropTarget.type === 'paint'
          ? canDropNodesToPaint(dragNodes)
          : canDropNodesToFolder(dragNodes, dropTarget.folderId)),
      );
      latestDropTarget =
        isValidDropTarget ? dropTarget : null;
      setActiveDropTarget(latestDropTarget);

      const dragFeedback = getDragDropFeedback(dropTarget, isValidDropTarget, isTrashDrag);

      setDragPreview({
        dropState: dragFeedback.state,
        feedbackLabel: dragFeedback.label,
        nodes: dragNodes,
        position: latestClientPosition,
      });
    };

    const handlePointerUp = async (upEvent) => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }

      if (didMove && latestDropTarget) {
        const dropPosition = { x: upEvent.clientX ?? latestClientPosition.x, y: upEvent.clientY ?? latestClientPosition.y };

        if (latestDropTarget.type === 'paint' && dragNodes.length === 1) {
          dispatchPaintFileDrop(latestDropTarget.windowId, dragNodes[0].id);
        } else if (latestDropTarget.folderId === recycleBinFolderId) {
          const confirmed = await confirmMoveNodesToTrash(dragNodes);

          if (confirmed) {
            moveNodesToTrash(dragNodeIds);
            clearExplorerSelection();
            playSound('trash');
          }
        } else {
          const trashDragNodes = dragNodes.filter((dragNode) => isPathInsideTrash(getPath(dragNode.id)));
          const normalDragNodes = dragNodes.filter((dragNode) => !isPathInsideTrash(getPath(dragNode.id)));
          let movedNodeIds = [];

          if (trashDragNodes.length > 0) {
            const confirmed = await confirmMoveNodesFromTrash(trashDragNodes, latestDropTarget.folderId);

            if (!confirmed) {
              clearActiveFileDropTargets();
              setDraggingNodeIds([]);
              setDragPreview(null);
              return;
            }

            movedNodeIds = [
              ...movedNodeIds,
              ...moveNodesFromTrashToFolder(trashDragNodes.map((trashNode) => trashNode.id), latestDropTarget.folderId),
            ];
          }

          if (normalDragNodes.length > 0) {
            movedNodeIds = [
              ...movedNodeIds,
              ...moveNodesToFolder(normalDragNodes.map((normalNode) => normalNode.id), latestDropTarget.folderId),
            ];
          }

          if (movedNodeIds.length === 0) {
            clearActiveFileDropTargets();
            setDraggingNodeIds([]);
            setDragPreview(null);
            return;
          }

          if (latestDropTarget.folderId === desktopFolderId) {
            placeMovedNodesOnDesktop(movedNodeIds, dropPosition);
          }

          setSelectedNodes(latestDropTarget.folderId === currentFolderId ? movedNodeIds : []);
          setSelectionAnchorNodeId(latestDropTarget.folderId === currentFolderId ? movedNodeIds[0] : null);
          playSound(trashDragNodes.length > 0 ? 'restoreFile' : 'click');
        }
      }

      clearActiveFileDropTargets();
      setDraggingNodeIds([]);
      setDragPreview(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleFolderContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearExplorerSelection();
    cancelRename();
    setContextMenu({
      type: 'folder',
      position: getContextMenuPosition(event, isRecycleBinFolder ? 4 : 6),
    });
  };

  const handleNodeContextMenu = (event, node) => {
    event.preventDefault();
    event.stopPropagation();
    if (!selectedNodeIdSet.has(node.id)) {
      selectSingleNode(node.id);
    }
    cancelRename();
    setContextMenu({
      type: 'node',
      nodeId: node.id,
      position: getContextMenuPosition(event, isPathInsideTrash(getPath(node.id)) ? 4 : 11),
    });
  };

  const getContextMenuItems = () => {
    const targetNode = contextTargetNode;

    if (contextMenu?.type === 'node' && targetNode) {
      const isTargetInTrash = isPathInsideTrash(getPath(targetNode.id));
      const actionNodes = getActionNodes(targetNode);
      const isSingleAction = actionNodes.length === 1;
      const canOperateTarget = canOperateNodes(actionNodes);
      const canDeleteTarget = canDeleteNodes(actionNodes);
      const canRestoreTarget = canRestoreNodes(actionNodes);

      if (isTargetInTrash) {
        return [
          {
            id: 'restore-node',
            label: isSingleAction ? 'Restaurar' : 'Restaurar seleccion',
            disabled: !canRestoreTarget,
            onSelect: () => handleRestoreNodes(actionNodes),
          },
          {
            id: 'delete-node-permanently',
            label: isSingleAction ? 'Eliminar permanentemente' : 'Eliminar seleccion permanentemente',
            disabled: !canDeleteTarget,
            onSelect: () => void handleDeleteNodes(actionNodes),
          },
          { id: 'separator-node', type: 'separator' },
          {
            id: 'node-properties',
            label: 'Propiedades',
            disabled: !isSingleAction,
            onSelect: () => openProperties(targetNode),
          },
        ];
      }

      return [
        { id: 'open-node', label: 'Abrir', disabled: !isSingleAction, onSelect: () => handleOpenNode(targetNode) },
        { id: 'separator-clipboard', type: 'separator' },
        {
          id: 'copy-node',
          label: isSingleAction ? 'Copiar' : 'Copiar seleccion',
          hint: 'Ctrl+C',
          disabled: !canOperateTarget,
          onSelect: () => handleCopyNodes(actionNodes),
        },
        {
          id: 'cut-node',
          label: isSingleAction ? 'Cortar' : 'Cortar seleccion',
          hint: 'Ctrl+X',
          disabled: !canOperateTarget,
          onSelect: () => handleCutNodes(actionNodes),
        },
        {
          id: 'paste-node',
          label: 'Pegar',
          hint: 'Ctrl+V',
          disabled: !canPasteInCurrentFolder,
          onSelect: handlePaste,
        },
        {
          id: 'duplicate-node',
          label: 'Duplicar',
          disabled: !isSingleAction || !canOperateTarget,
          onSelect: () => handleDuplicateNode(targetNode),
        },
        { id: 'separator-edit', type: 'separator' },
        {
          id: 'rename-node',
          label: 'Renombrar',
          hint: 'F2',
          disabled: !isSingleAction,
          onSelect: () => beginRename(targetNode),
        },
        {
          id: 'delete-node',
          label: isSingleAction ? 'Eliminar' : 'Eliminar seleccion',
          hint: 'Del',
          disabled: !canDeleteTarget,
          onSelect: () => void handleDeleteNodes(actionNodes),
        },
        { id: 'separator-node', type: 'separator' },
        {
          id: 'node-properties',
          label: 'Propiedades',
          disabled: !isSingleAction,
          onSelect: () => openProperties(targetNode),
        },
      ];
    }

    if (isRecycleBinFolder) {
      return [
        {
          id: 'restore-all-trash',
          label: 'Restaurar todos',
          disabled: trashItemCount === 0,
          onSelect: () => void handleRestoreAllTrash(),
        },
        {
          id: 'empty-trash',
          label: 'Vaciar Papelera',
          disabled: trashItemCount === 0,
          onSelect: () => void handleEmptyTrash(),
        },
        { id: 'separator-folder', type: 'separator' },
        { id: 'folder-properties', label: 'Propiedades', onSelect: () => openProperties(currentFolder) },
      ];
    }

    return [
      { id: 'new-folder', label: 'Nueva carpeta', onSelect: handleCreateFolder },
      { id: 'new-text-file', label: 'Nuevo documento de texto', onSelect: handleCreateFile },
      { id: 'separator-folder', type: 'separator' },
      {
        id: 'paste-folder',
        label: 'Pegar',
        hint: 'Ctrl+V',
        disabled: !canPasteInCurrentFolder,
        onSelect: handlePaste,
      },
      { id: 'separator-folder-properties', type: 'separator' },
      { id: 'folder-properties', label: 'Propiedades', onSelect: () => openProperties(currentFolder) },
    ];
  };

  const handleExplorerKeyDown = (event) => {
    const shouldIgnoreFileShortcut = editingNodeId || isTextEntryElement(event.target);

    if (event.key === 'Escape') {
      if (editingNodeId) {
        event.preventDefault();
        cancelRename();
        return;
      }

      if (contextMenu) {
        event.preventDefault();
        closeContextMenu();
      }
    }

    if (event.ctrlKey && !event.altKey && !event.metaKey && !shouldIgnoreFileShortcut) {
      const shortcutKey = event.key.toLowerCase();

      if (shortcutKey === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        playSound('search');
        return;
      }

      if (shortcutKey === 'c' && canOperateSelectedNodes) {
        event.preventDefault();
        handleCopyNodes(selectedNodes);
      }

      if (shortcutKey === 'x' && canOperateSelectedNodes) {
        event.preventDefault();
        handleCutNodes(selectedNodes);
      }

      if (shortcutKey === 'v' && canPasteInCurrentFolder) {
        event.preventDefault();
        handlePaste();
      }
    }

    if (event.key === 'F2' && canRenameSelectedNode && !shouldIgnoreFileShortcut) {
      event.preventDefault();
      beginRename(selectedNode);
    }

    if (event.key === 'Delete' && canDeleteSelectedNodes && !shouldIgnoreFileShortcut) {
      event.preventDefault();
      void handleDeleteNodes(selectedNodes);
    }
  };

  if (!isReady) {
    return <div className="ros-file-explorer-loading">Cargando sistema de archivos...</div>;
  }

  if (error) {
    return <div className="ros-file-explorer-loading">{error}</div>;
  }

  return (
    <div className="ros-file-explorer-app" onClick={closeContextMenu} onKeyDown={handleExplorerKeyDown}>
      <div className="ros-app-toolbar" aria-label="Barra de herramientas del Explorador">
        <button className="ros-app-toolbar-button ros-explorer-nav-button" type="button" disabled={!canGoBack} onClick={goBack}>
          <span aria-hidden="true">&lt;</span>
          Atras
        </button>
        <button className="ros-app-toolbar-button ros-explorer-nav-button" type="button" disabled={!canGoForward} onClick={goForward}>
          <span aria-hidden="true">&gt;</span>
          Adelante
        </button>
        <button className="ros-app-toolbar-button ros-explorer-nav-button" type="button" disabled={!canGoUp} onClick={goUp}>
          <span aria-hidden="true">^</span>
          Subir
        </button>
        <span className="ros-app-toolbar-separator" aria-hidden="true" />
        {isRecycleBinFolder ? (
          <>
            <button className="ros-app-toolbar-button" type="button" disabled={!canRestoreSelectedNodes} onClick={() => handleRestoreNodes(selectedNodes)}>
              Restaurar
            </button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canDeleteSelectedNodes} onClick={() => void handleDeleteNodes(selectedNodes)}>
              Eliminar permanentemente
            </button>
            <button className="ros-app-toolbar-button" type="button" disabled={trashItemCount === 0} onClick={() => void handleRestoreAllTrash()}>
              Restaurar todos
            </button>
            <button className="ros-app-toolbar-button" type="button" disabled={trashItemCount === 0} onClick={() => void handleEmptyTrash()}>
              Vaciar Papelera
            </button>
          </>
        ) : (
          <>
            <button className="ros-app-toolbar-button" type="button" disabled={!canCreateInCurrentFolder} onClick={handleCreateFolder}>Nueva carpeta</button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canCreateInCurrentFolder} onClick={handleCreateFile}>Nuevo archivo</button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canOperateSelectedNodes} onClick={() => handleCopyNodes(selectedNodes)}>Copiar</button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canOperateSelectedNodes} onClick={() => handleCutNodes(selectedNodes)}>Cortar</button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canPasteInCurrentFolder} onClick={handlePaste}>Pegar</button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canOperateSelectedNode} onClick={() => handleDuplicateNode(selectedNode)}>Duplicar</button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canRenameSelectedNode} onClick={() => beginRename(selectedNode)}>Renombrar</button>
            <button className="ros-app-toolbar-button" type="button" disabled={!canDeleteSelectedNodes} onClick={() => void handleDeleteNodes(selectedNodes)}>Eliminar</button>
          </>
        )}
        <span className="ros-app-toolbar-separator" aria-hidden="true" />
        <span className="ros-explorer-toolbar-group" role="group" aria-label="Cambiar vista">
          {viewModes.map((mode) => (
            <button
              className="ros-app-toolbar-button ros-explorer-toggle-button"
              data-active={viewMode === mode.id ? 'true' : 'false'}
              key={mode.id}
              type="button"
              aria-pressed={viewMode === mode.id}
              onClick={() => handleViewModeChange(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </span>
        <span className="ros-explorer-toolbar-group" role="group" aria-label="Ordenar elementos">
          {sortOptions.map((option) => (
            <button
              className="ros-app-toolbar-button ros-explorer-toggle-button"
              data-active={sortBy === option.id ? 'true' : 'false'}
              key={option.id}
              type="button"
              aria-pressed={sortBy === option.id}
              onClick={() => handleSortChange(option.id)}
            >
              {option.label}
              {sortBy === option.id ? ` ${getSortHint(option.id, sortDirection)}` : ''}
            </button>
          ))}
        </span>
      </div>

      <div className="ros-explorer-address">
        <span className="ros-explorer-address-label">Direccion</span>
        <div className="ros-explorer-address-box" title={addressText}>
          <span className="ros-file-node-icon" data-type={getExplorerNodeIconType(currentFolder, trashItemCount)} aria-hidden="true" />
          <strong>{addressText}</strong>
        </div>
      </div>

      <div className="ros-explorer-searchbar">
        <label htmlFor={explorerSearchInputId}>Buscar</label>
        <input
          id={explorerSearchInputId}
          ref={searchInputRef}
          value={searchQuery}
          placeholder={`Buscar en ${currentFolderTitle}`}
          autoComplete="off"
          spellCheck="false"
          autoFocus={Boolean(launchData?.searchMode || launchData?.searchQuery)}
          onChange={(event) => handleSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && searchQuery) {
              event.preventDefault();
              clearSearch();
            }

            if (event.key === 'Enter' && children.length === 1) {
              event.preventDefault();
              handleOpenNode(children[0]);
            }
          }}
        />
        {isSearchActive ? (
          <button className="ros-app-toolbar-button" type="button" onClick={clearSearch}>
            Limpiar
          </button>
        ) : null}
        <span>
          {isSearchActive
            ? `${children.length} resultado${children.length === 1 ? '' : 's'} en ${searchScopeText}`
            : 'Ctrl+F para buscar archivos y carpetas'}
        </span>
      </div>

      <div className="ros-file-explorer-layout">
        <aside className="ros-file-tree" aria-label="Arbol de carpetas">
          {folderTree.map((folder) => (
            <button
              className="ros-file-tree-item"
              data-active={folder.id === currentFolderId ? 'true' : 'false'}
              data-drop-folder-id={getNodeDropFolderId(folder)}
              key={folder.id}
              type="button"
              onClick={() => {
                if (navigateToFolder(folder.id)) {
                  playSound('navigation');
                }
              }}
            >
              <span className="ros-file-node-icon" data-type={getExplorerNodeIconType(folder, trashItemCount)} aria-hidden="true" />
              {folder.name}
            </button>
          ))}
        </aside>

        <section
          className="ros-file-list"
          data-drop-folder-id={currentFolderId === recycleBinFolderId ? recycleBinFolderId : !isCurrentFolderInTrash ? currentFolderId : undefined}
          data-view-mode={viewMode}
          aria-label="Contenido de carpeta"
          onClick={() => clearExplorerSelection()}
          onContextMenu={handleFolderContextMenu}
        >
          {children.length === 0 ? (
            <div className="ros-empty-folder">
              <span className="ros-empty-folder-icon" data-type={isSearchActive ? 'search' : isRecycleBinFolder ? 'trash' : 'folder'} aria-hidden="true" />
              <h2>{isSearchActive ? 'No se encontraron resultados' : isRecycleBinFolder ? 'La Papelera esta vacia' : 'Esta carpeta esta vacia'}</h2>
              <p>
                {isSearchActive
                  ? `No hay coincidencias para "${trimmedSearchQuery}" en ${searchScopeText}.`
                  : isRecycleBinFolder
                  ? 'Los elementos eliminados apareceran aqui hasta que los restaures o los borres definitivamente.'
                  : 'Crea una carpeta o un documento de texto para empezar.'}
              </p>
              {isSearchActive ? (
                <div className="ros-empty-folder-actions">
                  <button
                    className="ros-app-toolbar-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearSearch();
                    }}
                  >
                    Limpiar busqueda
                  </button>
                </div>
              ) : canCreateInCurrentFolder ? (
                <div className="ros-empty-folder-actions">
                  <button
                    className="ros-app-toolbar-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCreateFolder();
                    }}
                  >
                    Nueva carpeta
                  </button>
                  <button
                    className="ros-app-toolbar-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleCreateFile();
                    }}
                  >
                    Nuevo documento
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {viewMode === 'details' ? (
                <div className="ros-file-list-header">
                  <span />
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSortChange('name');
                    }}
                  >
                    Nombre
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSortChange('type');
                    }}
                  >
                    Tipo
                  </button>
                  <button
                    type="button"
                    className={isSearchActive ? 'ros-file-list-heading' : undefined}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (isSearchActive) {
                        return;
                      }

                      handleSortChange('updatedAt');
                    }}
                  >
                    {isSearchActive ? 'Ubicacion' : 'Modificado'}
                  </button>
                </div>
              ) : null}
              <div className="ros-file-items" data-view-mode={viewMode}>
                {children.map((node) => {
                  const isEditing = editingNodeId === node.id;
                  const editableName = isEditing ? getEditableNodeName(node) : null;

                  return (
                    <button
                      className="ros-file-row"
                      data-drop-folder-id={getNodeDropFolderId(node)}
                      data-dragging={draggingNodeIds.includes(node.id) ? 'true' : 'false'}
                      data-editing={isEditing ? 'true' : 'false'}
                      data-selected={selectedNodeIdSet.has(node.id) ? 'true' : 'false'}
                      data-view-mode={viewMode}
                      key={node.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        closeContextMenu();
                        handleNodeSelection(event, node);
                      }}
                      onContextMenu={(event) => handleNodeContextMenu(event, node)}
                      onDoubleClick={() => {
                        if (!isEditing) {
                          handleOpenNode(node);
                        }
                      }}
                      onPointerDown={(event) => handleNodePointerDown(event, node, isEditing)}
                    >
                      <span className="ros-file-node-icon" data-type={getExplorerNodeIconType(node, trashItemCount)} aria-hidden="true" />
                      <span className="ros-file-row-name">
                        {isEditing ? (
                          <span className="ros-inline-rename-field">
                            <input
                              className="ros-file-row-input"
                              value={draftName}
                              autoFocus
                              spellCheck="false"
                              aria-label={`Renombrar ${node.name}`}
                              onBlur={commitRename}
                              onChange={(event) => setDraftName(stripLockedExtension(event.target.value, editableName?.extension))}
                              onClick={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onFocus={(event) => event.target.select()}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  commitRename();
                                }

                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelRename();
                                }
                              }}
                              onPointerDown={(event) => event.stopPropagation()}
                            />
                            {editableName?.extension ? (
                              <span className="ros-extension-suffix">{editableName.extension}</span>
                            ) : null}
                          </span>
                        ) : (
                          node.name
                        )}
                      </span>
                      <span className="ros-file-row-type">{getNodeTypeLabel(node)}</span>
                      <span className="ros-file-row-date" title={isSearchActive ? getPathLabel(getPath(node.parentId)) : undefined}>
                        {isSearchActive ? getPathLabel(getPath(node.parentId)) : formatShortDateTime(node.updatedAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <aside className="ros-file-details" aria-label="Detalles">
          {hasMultipleSelection ? (
            <>
              <span className="ros-file-node-icon ros-file-node-icon-large" data-type="folder" aria-hidden="true" />
              <h2>{selectedNodes.length} elementos seleccionados</h2>
              <p>
                {selectedFolderCount} carpeta{selectedFolderCount === 1 ? '' : 's'} y {selectedFileCount} archivo{selectedFileCount === 1 ? '' : 's'}
              </p>
              <dl className="ros-file-details-list">
                <div>
                  <dt>Ubicacion</dt>
                  <dd>{currentFolder?.name ?? 'Carpeta'}</dd>
                </div>
                <div>
                  <dt>Vista</dt>
                  <dd>{viewModes.find((mode) => mode.id === viewMode)?.label}</dd>
                </div>
                <div>
                  <dt>Seleccion</dt>
                  <dd>Usa Ctrl+click para ajustar o Shift+click para seleccionar un rango.</dd>
                </div>
              </dl>
            </>
          ) : selectedNode ? (
            <>
              <span className="ros-file-node-icon ros-file-node-icon-large" data-type={getExplorerNodeIconType(selectedNode, trashItemCount)} aria-hidden="true" />
              <h2>{selectedNode.name}</h2>
              <p>{selectedNode.parentId === recycleBinFolderId ? 'Elemento en Papelera' : getNodeTypeLabel(selectedNode)}</p>
              <dl className="ros-file-details-list">
                <div>
                  <dt>{isSelectedNodeInTrash ? 'Ubicacion actual' : 'Ubicacion'}</dt>
                  <dd>{selectedNodeParentPath}</dd>
                </div>
                <div>
                  <dt>Creado</dt>
                  <dd>{formatShortDateTime(selectedNode.createdAt)}</dd>
                </div>
                <div>
                  <dt>Modificado</dt>
                  <dd>{formatShortDateTime(selectedNode.updatedAt)}</dd>
                </div>
                <div>
                  <dt>{selectedNode.type === 'folder' ? 'Contiene' : 'Tamano'}</dt>
                  <dd>{selectedNode.type === 'folder' ? `${selectedNodeChildrenCount} elementos` : selectedNodeSize}</dd>
                </div>
              </dl>
              {isSelectedNodeInTrash ? (
                <dl className="ros-file-details-list">
                  <div>
                    <dt>Ubicacion original</dt>
                    <dd>{selectedNodeOriginalLocation}</dd>
                  </div>
                  <div>
                    <dt>Eliminado</dt>
                    <dd>{formatShortDateTime(selectedTrashRootNode?.trashedAt)}</dd>
                  </div>
                </dl>
              ) : null}
              {selectedNode.type === 'file' ? (
                <section className="ros-file-preview" aria-label="Vista previa">
                  <h3>Vista previa</h3>
                  {isSelectedNodeImage ? (
                    <img className="ros-file-image-preview" src={selectedNode.content} alt={selectedNode.name} />
                  ) : (
                    <pre>{selectedNode.content || 'Archivo vacio.'}</pre>
                  )}
                </section>
              ) : null}
            </>
          ) : (
            isSearchActive ? (
              <>
                <span className="ros-file-node-icon ros-file-node-icon-large" data-type="search" aria-hidden="true" />
                <h2>Resultados de busqueda</h2>
                <p>{children.length} coincidencia{children.length === 1 ? '' : 's'}</p>
                <dl className="ros-file-details-list">
                  <div>
                    <dt>Buscar</dt>
                    <dd>{trimmedSearchQuery}</dd>
                  </div>
                  <div>
                    <dt>Ubicacion</dt>
                    <dd>{searchScopeText}</dd>
                  </div>
                  <div>
                    <dt>Orden</dt>
                    <dd>{sortOptions.find((option) => option.id === sortBy)?.label} {getSortHint(sortBy, sortDirection)}</dd>
                  </div>
                </dl>
                <p className="ros-file-details-help">Doble click abre el resultado seleccionado.</p>
              </>
            ) : (
              <>
                <span className="ros-file-node-icon ros-file-node-icon-large" data-type={getExplorerNodeIconType(currentFolder, trashItemCount)} aria-hidden="true" />
                <h2>{currentFolder?.name ?? 'Carpeta'}</h2>
                <p>{children.length} elementos</p>
                <dl className="ros-file-details-list">
                  <div>
                    <dt>Ubicacion</dt>
                    <dd>{path.slice(0, -1).map((node) => node.name).join('\\') || 'C:'}</dd>
                  </div>
                  <div>
                    <dt>Vista</dt>
                    <dd>{viewModes.find((mode) => mode.id === viewMode)?.label}</dd>
                  </div>
                  <div>
                    <dt>Orden</dt>
                    <dd>{sortOptions.find((option) => option.id === sortBy)?.label} {getSortHint(sortBy, sortDirection)}</dd>
                  </div>
                </dl>
                <p className="ros-file-details-help">Selecciona un archivo o carpeta.</p>
              </>
            )
          )}
        </aside>
      </div>
      {dragPreview ? (
        <div
          className="ros-file-drag-preview"
          data-drop-state={dragPreview.dropState}
          style={{
            left: `${dragPreview.position.x}px`,
            top: `${dragPreview.position.y}px`,
          }}
          aria-hidden="true"
        >
          <span className="ros-file-node-icon" data-type={getExplorerNodeIconType(dragPreview.nodes[0], trashItemCount)} />
          <span className="ros-file-drag-preview-text">
            <span>{dragPreview.nodes.length === 1 ? dragPreview.nodes[0].name : `${dragPreview.nodes.length} elementos`}</span>
            {dragPreview.feedbackLabel ? <small>{dragPreview.feedbackLabel}</small> : null}
          </span>
        </div>
      ) : null}
      {contextMenu ? <DesktopContextMenu items={getContextMenuItems()} position={contextMenu.position} /> : null}
    </div>
  );
}
