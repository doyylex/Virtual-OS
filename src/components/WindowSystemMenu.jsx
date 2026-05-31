import { useSystemSound } from '../hooks/useSystemSound.js';
import { useWindowStore } from '../store/useWindowStore.js';

export function WindowSystemMenu({ onClose, position, windowItem }) {
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const maximizeWindow = useWindowStore((state) => state.maximizeWindow);
  const minimizeWindow = useWindowStore((state) => state.minimizeWindow);
  const restoreWindow = useWindowStore((state) => state.restoreWindow);
  const playSound = useSystemSound();

  const runAction = async (event, action, sound) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.disabled) {
      return;
    }

    onClose();
    const result = await action(windowItem.id);

    if (result !== false) {
      playSound(sound);
    }
  };

  return (
    <div
      className="ros-window-system-menu"
      role="menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: windowItem.zIndex + 12,
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="ros-window-system-menu-item"
        type="button"
        role="menuitem"
        disabled={!windowItem.isMaximized}
        onClick={(event) => void runAction(event, restoreWindow, 'restore')}
      >
        <span data-icon="restore" aria-hidden="true" />
        Restaurar
      </button>
      <button
        className="ros-window-system-menu-item"
        type="button"
        role="menuitem"
        onClick={(event) => void runAction(event, minimizeWindow, 'minimize')}
      >
        <span data-icon="minimize" aria-hidden="true" />
        Minimizar
      </button>
      <button
        className="ros-window-system-menu-item"
        type="button"
        role="menuitem"
        disabled={windowItem.isMaximized}
        onClick={(event) => void runAction(event, maximizeWindow, 'restore')}
      >
        <span data-icon="maximize" aria-hidden="true" />
        Maximizar
      </button>
      <span className="ros-window-system-menu-separator" role="separator" />
      <button
        className="ros-window-system-menu-item ros-window-system-menu-item-danger"
        type="button"
        role="menuitem"
        onClick={(event) => void runAction(event, closeWindow, 'close')}
      >
        <span data-icon="close" aria-hidden="true" />
        Cerrar
      </button>
    </div>
  );
}
