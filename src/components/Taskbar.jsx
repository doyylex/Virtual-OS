import { Clock } from './Clock.jsx';
import { StartButton } from './StartButton.jsx';
import { StartMenu } from './StartMenu.jsx';
import { TaskbarButton } from './TaskbarButton.jsx';
import { useWindowStore } from '../store/useWindowStore.js';

export function Taskbar() {
  const windows = useWindowStore((state) => state.windows);

  return (
    <footer className="ros-taskbar" aria-label="Taskbar">
      <StartMenu />
      <StartButton />
      <div className="ros-taskbar-windows" aria-label="Running windows">
        {windows.map((windowItem) => (
          <TaskbarButton key={windowItem.id} windowItem={windowItem} />
        ))}
      </div>
      <div className="ros-taskbar-spacer" />
      <div className="ros-tray" aria-label="Notification area">
        <Clock />
      </div>
    </footer>
  );
}
