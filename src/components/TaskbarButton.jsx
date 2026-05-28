import { getAppById } from '../apps/appRegistry.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useWindowStore } from '../store/useWindowStore.js';

export function TaskbarButton({ windowItem }) {
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const focusWindow = useWindowStore((state) => state.focusWindow);
  const restoreWindow = useWindowStore((state) => state.restoreWindow);
  const playSound = useSystemSound();
  const app = getAppById(windowItem.appId);
  const isActive = activeWindowId === windowItem.id && !windowItem.isMinimized;

  const handleClick = () => {
    if (windowItem.isMinimized) {
      restoreWindow(windowItem.id);
      playSound('restore');
      return;
    }

    focusWindow(windowItem.id);
    playSound('click');
  };

  return (
    <button
      className="ros-taskbar-button"
      data-active={isActive ? 'true' : 'false'}
      data-minimized={windowItem.isMinimized ? 'true' : 'false'}
      type="button"
      onClick={handleClick}
      aria-pressed={isActive}
    >
      <span className="ros-taskbar-button-icon" data-tone={app?.iconTone ?? 'window'} aria-hidden="true" />
      <span className="ros-taskbar-button-label">{windowItem.title}</span>
    </button>
  );
}
