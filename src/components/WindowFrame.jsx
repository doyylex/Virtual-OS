import { useCallback, useEffect, useState } from 'react';
import { useDraggableWindow } from '../hooks/useDraggableWindow.js';
import { useResizableWindow } from '../hooks/useResizableWindow.js';
import { useWindowStore } from '../store/useWindowStore.js';
import { WindowControls } from './WindowControls.jsx';
import { WindowSystemMenu } from './WindowSystemMenu.jsx';

const resizeDirections = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
const SYSTEM_MENU_WIDTH = 164;
const SYSTEM_MENU_HEIGHT = 124;
const SYSTEM_MENU_MARGIN = 4;

const getSystemMenuPosition = (x, y) => ({
  x: Math.max(SYSTEM_MENU_MARGIN, Math.min(x, window.innerWidth - SYSTEM_MENU_WIDTH - SYSTEM_MENU_MARGIN)),
  y: Math.max(SYSTEM_MENU_MARGIN, Math.min(y, window.innerHeight - SYSTEM_MENU_HEIGHT - SYSTEM_MENU_MARGIN)),
});

export function WindowFrame({ app, children, windowItem }) {
  const [systemMenuPosition, setSystemMenuPosition] = useState(null);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const finishWindowTransition = useWindowStore((state) => state.finishWindowTransition);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const maximizeWindow = useWindowStore((state) => state.maximizeWindow);
  const minimizeWindow = useWindowStore((state) => state.minimizeWindow);
  const restoreWindow = useWindowStore((state) => state.restoreWindow);
  const handleDragPointerDown = useDraggableWindow(windowItem);
  const { getResizeHandleProps, isResizing } = useResizableWindow(windowItem, app);
  const isActive = activeWindowId === windowItem.id;

  const closeSystemMenu = useCallback(() => {
    setSystemMenuPosition(null);
  }, []);

  const openSystemMenu = useCallback((x, y) => {
    setSystemMenuPosition(getSystemMenuPosition(x, y));
  }, []);

  useEffect(() => {
    if (!systemMenuPosition) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (event.target instanceof Element && event.target.closest('.ros-window-system-menu')) {
        return;
      }

      closeSystemMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSystemMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSystemMenu, systemMenuPosition]);

  const handleWindowPointerDown = () => {
    focusWindow(windowItem.id);
  };

  const handleTitlebarPointerDown = (event) => {
    closeSystemMenu();
    handleDragPointerDown(event);
  };

  const handleTitlebarContextMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    focusWindow(windowItem.id);
    openSystemMenu(event.clientX, event.clientY);
  };

  const handleTitleIconClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    focusWindow(windowItem.id);
    openSystemMenu(rect.left, rect.bottom + 2);
  };

  const handleTitlebarDoubleClick = () => {
    closeSystemMenu();

    if (windowItem.isMaximized) {
      restoreWindow(windowItem.id);
    } else {
      maximizeWindow(windowItem.id);
    }
  };

  const handleWindowAnimationEnd = (event) => {
    if (event.target !== event.currentTarget || windowItem.transitionState === 'idle') {
      return;
    }

    finishWindowTransition(windowItem.id, windowItem.transitionState);
  };

  return (
    <section
      className="ros-window"
      data-active={isActive ? 'true' : 'false'}
      data-maximized={windowItem.isMaximized ? 'true' : 'false'}
      data-resizing={isResizing ? 'true' : 'false'}
      data-transition={windowItem.transitionState}
      style={{
        left: `${windowItem.position.x}px`,
        top: `${windowItem.position.y}px`,
        width: `${windowItem.size.width}px`,
        height: `${windowItem.size.height}px`,
        zIndex: windowItem.zIndex,
      }}
      aria-label={windowItem.title}
      onAnimationEnd={handleWindowAnimationEnd}
      onPointerDownCapture={handleWindowPointerDown}
    >
      <header
        className="ros-window-titlebar"
        onContextMenu={handleTitlebarContextMenu}
        onDoubleClick={handleTitlebarDoubleClick}
        onPointerDown={handleTitlebarPointerDown}
      >
        <button
          className="ros-window-title-icon-button"
          type="button"
          aria-label="Abrir menu de ventana"
          onClick={handleTitleIconClick}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="ros-window-title-icon" data-tone={app.iconTone} aria-hidden="true" />
        </button>
        <h1 className="ros-window-title">{windowItem.title}</h1>
        <WindowControls
          isMaximized={windowItem.isMaximized}
          onClose={() => {
            closeSystemMenu();
            closeWindow(windowItem.id);
          }}
          onMaximize={() => {
            closeSystemMenu();
            maximizeWindow(windowItem.id);
          }}
          onMinimize={() => {
            closeSystemMenu();
            minimizeWindow(windowItem.id);
          }}
          onRestore={() => {
            closeSystemMenu();
            restoreWindow(windowItem.id);
          }}
        />
      </header>
      {systemMenuPosition ? (
        <WindowSystemMenu onClose={closeSystemMenu} position={systemMenuPosition} windowItem={windowItem} />
      ) : null}
      <div className="ros-window-body">{children}</div>
      {resizeDirections.map((direction) => (
        <span
          className="ros-window-resize-handle"
          data-direction={direction}
          key={direction}
          aria-hidden="true"
          {...getResizeHandleProps(direction)}
          onPointerDown={(event) => {
            closeSystemMenu();
            getResizeHandleProps(direction).onPointerDown(event);
          }}
        />
      ))}
    </section>
  );
}
