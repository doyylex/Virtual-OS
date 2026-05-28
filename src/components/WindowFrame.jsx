import { useDraggableWindow } from '../hooks/useDraggableWindow.js';
import { useWindowStore } from '../store/useWindowStore.js';
import { WindowControls } from './WindowControls.jsx';

export function WindowFrame({ app, children, windowItem }) {
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const maximizeWindow = useWindowStore((state) => state.maximizeWindow);
  const minimizeWindow = useWindowStore((state) => state.minimizeWindow);
  const restoreWindow = useWindowStore((state) => state.restoreWindow);
  const handleTitlebarPointerDown = useDraggableWindow(windowItem);
  const isActive = activeWindowId === windowItem.id;

  const handleTitlebarDoubleClick = () => {
    if (windowItem.isMaximized) {
      restoreWindow(windowItem.id);
    } else {
      maximizeWindow(windowItem.id);
    }
  };

  return (
    <section
      className="ros-window"
      data-active={isActive ? 'true' : 'false'}
      data-maximized={windowItem.isMaximized ? 'true' : 'false'}
      style={{
        left: `${windowItem.position.x}px`,
        top: `${windowItem.position.y}px`,
        width: `${windowItem.size.width}px`,
        height: `${windowItem.size.height}px`,
        zIndex: windowItem.zIndex,
      }}
      aria-label={windowItem.title}
      onPointerDown={() => focusWindow(windowItem.id)}
    >
      <header
        className="ros-window-titlebar"
        onDoubleClick={handleTitlebarDoubleClick}
        onPointerDown={handleTitlebarPointerDown}
      >
        <span className="ros-window-title-icon" data-tone={app.iconTone} aria-hidden="true" />
        <h1 className="ros-window-title">{windowItem.title}</h1>
        <WindowControls
          isMaximized={windowItem.isMaximized}
          onClose={() => closeWindow(windowItem.id)}
          onMaximize={() => maximizeWindow(windowItem.id)}
          onMinimize={() => minimizeWindow(windowItem.id)}
          onRestore={() => restoreWindow(windowItem.id)}
        />
      </header>
      <div className="ros-window-body">{children}</div>
    </section>
  );
}
