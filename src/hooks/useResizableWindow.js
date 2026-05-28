import { useCallback, useState } from 'react';
import { useWindowStore } from '../store/useWindowStore.js';

const TASKBAR_OFFSET = 40;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDesktopBounds = () => ({
  width: window.innerWidth,
  height: window.innerHeight - TASKBAR_OFFSET,
});

const getResizeGeometry = ({ direction, minSize, startPointer, startPosition, startSize }, event) => {
  const bounds = getDesktopBounds();
  const deltaX = event.clientX - startPointer.x;
  const deltaY = event.clientY - startPointer.y;
  const minimumSize = {
    width: minSize?.width ?? 320,
    height: minSize?.height ?? 220,
  };
  const geometry = {
    position: { ...startPosition },
    size: { ...startSize },
  };

  if (direction.includes('e')) {
    geometry.size.width = clamp(startSize.width + deltaX, minimumSize.width, bounds.width - startPosition.x);
  }

  if (direction.includes('s')) {
    geometry.size.height = clamp(startSize.height + deltaY, minimumSize.height, bounds.height - startPosition.y);
  }

  if (direction.includes('w')) {
    const rightEdge = startPosition.x + startSize.width;
    geometry.position.x = clamp(startPosition.x + deltaX, 0, rightEdge - minimumSize.width);
    geometry.size.width = rightEdge - geometry.position.x;
  }

  if (direction.includes('n')) {
    const bottomEdge = startPosition.y + startSize.height;
    geometry.position.y = clamp(startPosition.y + deltaY, 0, bottomEdge - minimumSize.height);
    geometry.size.height = bottomEdge - geometry.position.y;
  }

  return geometry;
};

export function useResizableWindow(windowItem, app) {
  const [isResizing, setIsResizing] = useState(false);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const resizeWindow = useWindowStore((state) => state.resizeWindow);

  const handleResizePointerDown = useCallback(
    (direction) => (event) => {
      if (windowItem.isMaximized || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      focusWindow(windowItem.id);
      setIsResizing(true);

      const resizeState = {
        direction,
        minSize: app.minSize,
        startPointer: {
          x: event.clientX,
          y: event.clientY,
        },
        startPosition: windowItem.position,
        startSize: windowItem.size,
      };

      const handlePointerMove = (moveEvent) => {
        resizeWindow(windowItem.id, getResizeGeometry(resizeState, moveEvent));
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        setIsResizing(false);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [app.minSize, focusWindow, resizeWindow, windowItem],
  );

  const getResizeHandleProps = useCallback(
    (direction) => ({
      onPointerDown: handleResizePointerDown(direction),
    }),
    [handleResizePointerDown],
  );

  return {
    getResizeHandleProps,
    isResizing,
  };
}
