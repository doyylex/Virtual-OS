import { getQuickLaunchApps } from '../apps/appRegistry.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { Clock } from './Clock.jsx';
import { StartButton } from './StartButton.jsx';
import { StartMenu } from './StartMenu.jsx';
import { TaskbarButton } from './TaskbarButton.jsx';
import { useWindowStore } from '../store/useWindowStore.js';

export function Taskbar() {
  const windows = useWindowStore((state) => state.windows);
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();
  const quickLaunchApps = getQuickLaunchApps();

  return (
    <footer className="ros-taskbar" aria-label="Barra de tareas">
      <StartMenu />
      <StartButton />
      <div className="ros-quick-launch" aria-label="Inicio rapido">
        {quickLaunchApps.map((app) => (
          <button
            className="ros-quick-launch-button"
            data-tone={app.iconTone}
            key={app.id}
            type="button"
            aria-label={`Abrir ${app.title}`}
            title={app.title}
            onClick={() => {
              openApp(app.id);
              playSound('open');
            }}
          />
        ))}
      </div>
      <div className="ros-taskbar-windows" aria-label="Ventanas en ejecucion">
        {windows.map((windowItem) => (
          <TaskbarButton key={windowItem.id} windowItem={windowItem} />
        ))}
      </div>
      <div className="ros-taskbar-spacer" />
      <div className="ros-tray" aria-label="Area de notificacion">
        <Clock />
      </div>
    </footer>
  );
}
