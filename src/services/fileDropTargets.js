export const paintFileDropEventName = 'roso:paint-file-drop';

export const getFileDropTargetFromPoint = (x, y, draggedElement, options = {}) => {
  const previousPointerEvents = draggedElement.style.pointerEvents;
  let pointedElement;
  let targetElement;

  try {
    draggedElement.style.pointerEvents = 'none';
    pointedElement = document.elementFromPoint(x, y);
    targetElement = pointedElement?.closest('[data-drop-folder-id], [data-paint-drop-window-id]');
  } finally {
    draggedElement.style.pointerEvents = previousPointerEvents;
  }

  if (!(targetElement instanceof HTMLElement)) {
    return null;
  }

  if (targetElement.dataset.paintDropWindowId) {
    return {
      element: targetElement,
      type: 'paint',
      windowId: targetElement.dataset.paintDropWindowId,
    };
  }

  if (targetElement.dataset.dropFolderId) {
    if (options.ignoreFolderIds?.includes(targetElement.dataset.dropFolderId)) {
      return null;
    }

    return {
      element: targetElement,
      folderId: targetElement.dataset.dropFolderId,
      type: 'folder',
    };
  }

  const blockingWindow = pointedElement?.closest('.ros-window');

  if (blockingWindow instanceof HTMLElement) {
    return {
      element: blockingWindow,
      type: 'blocked',
    };
  }

  return null;
};

export const dispatchPaintFileDrop = (windowId, nodeId) => {
  window.dispatchEvent(
    new CustomEvent(paintFileDropEventName, {
      detail: { nodeId, windowId },
    }),
  );
};
