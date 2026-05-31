import { getAppById } from '../apps/appRegistry.js';
import { useWindowStore } from '../store/useWindowStore.js';
import { WindowFrame } from './WindowFrame.jsx';

export function WindowManager() {
  const windows = useWindowStore((state) => state.windows);

  return (
    <div className="ros-window-stage" aria-label="Open windows">
      {windows.map((windowItem) => {
        const app = getAppById(windowItem.appId);

        if (!app) {
          return null;
        }

        const AppComponent = app.component;

        return (
          <WindowFrame app={app} key={windowItem.id} windowItem={windowItem}>
            <AppComponent
              appTitle={app.title}
              key={`${windowItem.id}-${windowItem.launchToken}`}
              launchData={windowItem.launchData}
              windowId={windowItem.id}
            />
          </WindowFrame>
        );
      })}
    </div>
  );
}
