import { useCallback } from 'react';
import { useWindowStore } from '../store/useWindowStore.js';

export function useDraggableWindow(windowItem) {
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const moveWindow = useWindowStore((state) => state.moveWindow);

  return useCallback(
    (event) => {
      if (windowItem.isMaximized || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      focusWindow(windowItem.id);

      const startX = event.clientX;
      const startY = event.clientY;
      const startPosition = windowItem.position;

      const handlePointerMove = (moveEvent) => {
        moveWindow(windowItem.id, {
          x: startPosition.x + moveEvent.clientX - startX,
          y: startPosition.y + moveEvent.clientY - startY,
        });
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [focusWindow, moveWindow, windowItem],
  );
}
