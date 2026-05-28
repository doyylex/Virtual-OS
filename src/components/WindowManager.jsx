import { getAppById } from '../apps/appRegistry.js';
import { useWindowStore } from '../store/useWindowStore.js';
import { WindowFrame } from './WindowFrame.jsx';

export function WindowManager() {
  const windows = useWindowStore((state) => state.windows);
  const visibleWindows = windows.filter((windowItem) => !windowItem.isMinimized);

  return (
    <div className="ros-window-stage" aria-label="Ventanas abiertas">
      {visibleWindows.map((windowItem) => {
        const app = getAppById(windowItem.appId);

        if (!app) {
          return null;
        }

        const AppComponent = app.component;

        return (
          <WindowFrame app={app} key={windowItem.id} windowItem={windowItem}>
            <AppComponent key={`${windowItem.id}-${windowItem.launchToken}`} launchData={windowItem.launchData} />
          </WindowFrame>
        );
      })}
    </div>
  );
}
