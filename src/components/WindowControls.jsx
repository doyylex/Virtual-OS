import { useSystemSound } from '../hooks/useSystemSound.js';

export function WindowControls({
  isMaximized,
  onClose,
  onMaximize,
  onMinimize,
  onRestore,
}) {
  const playSound = useSystemSound();

  const handleControlClick = (event, action) => {
    event.stopPropagation();
    action();
  };

  return (
    <div
      className="ros-window-controls"
      aria-label="Controles de ventana"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        className="ros-window-control ros-window-control-minimize"
        type="button"
        aria-label="Minimizar"
        onClick={(event) => {
          playSound('minimize');
          handleControlClick(event, onMinimize);
        }}
      >
        <span aria-hidden="true" />
      </button>
      <button
        className="ros-window-control ros-window-control-maximize"
        type="button"
        aria-label={isMaximized ? 'Restaurar' : 'Maximizar'}
        onClick={(event) => {
          playSound('restore');
          handleControlClick(event, isMaximized ? onRestore : onMaximize);
        }}
      >
        <span data-restore={isMaximized ? 'true' : 'false'} aria-hidden="true" />
      </button>
      <button
        className="ros-window-control ros-window-control-close"
        type="button"
        aria-label="Cerrar"
        onClick={(event) => {
          playSound('close');
          handleControlClick(event, onClose);
        }}
      >
        X
      </button>
    </div>
  );
}
