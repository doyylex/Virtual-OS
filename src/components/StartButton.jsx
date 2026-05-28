import { useSystemSound } from '../hooks/useSystemSound.js';
import { useUiStore } from '../store/useUiStore.js';

export function StartButton() {
  const isStartMenuOpen = useUiStore((state) => state.isStartMenuOpen);
  const toggleStartMenu = useUiStore((state) => state.toggleStartMenu);
  const playSound = useSystemSound();

  const handleClick = () => {
    toggleStartMenu();
    playSound('start');
  };

  return (
    <button
      className="ros-start-button"
      type="button"
      aria-haspopup="menu"
      aria-expanded={isStartMenuOpen}
      onClick={handleClick}
    >
      <span className="ros-start-logo" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      Inicio
    </button>
  );
}
