import { useSystemSound } from '../hooks/useSystemSound.js';

export function WindowControls({
  isMaximized,
  onClose,
  onMaximize,
  onMinimize,
  onRestore,
}) {
  const playSound = useSystemSound();

  const handleControlClick = async (event, action, sound) => {
    event.stopPropagation();
    const result = await action();

    if (result !== false) {
      playSound(sound);
    }
  };

  return (
    <div
      className="ros-window-controls"
      aria-label="Window controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="ros-window-control ros-window-control-minimize"
        type="button"
        aria-label="Minimize"
        onClick={(event) => {
          void handleControlClick(event, onMinimize, 'minimize');
        }}
      >
        <span aria-hidden="true" />
      </button>
      <button
        className="ros-window-control ros-window-control-maximize"
        type="button"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={(event) => {
          void handleControlClick(event, isMaximized ? onRestore : onMaximize, 'restore');
        }}
      >
        <span data-restore={isMaximized ? 'true' : 'false'} aria-hidden="true" />
      </button>
      <button
        className="ros-window-control ros-window-control-close"
        type="button"
        aria-label="Close"
        onClick={(event) => {
          void handleControlClick(event, onClose, 'close');
        }}
      >
        X
      </button>
    </div>
  );
}
