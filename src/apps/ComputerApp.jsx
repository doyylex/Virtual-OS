import { useSystemSound } from '../hooks/useSystemSound.js';
import { useWindowStore } from '../store/useWindowStore.js';

const computerItems = [
  { label: 'Local Disk (C:)', detail: 'Roso OS system', tone: 'drive', appId: 'explorer', launchData: { folderId: 'root' } },
  { label: 'Desktop', detail: 'Files visible on the desktop', tone: 'folder', appId: 'explorer', launchData: { folderId: 'desktop-folder' } },
  { label: 'My Documents', detail: 'Persistent files', tone: 'folder', appId: 'explorer', launchData: { folderId: 'documents' } },
  { label: 'File Explorer', detail: 'Folders and files', tone: 'explorer', appId: 'explorer' },
  { label: 'Notepad', detail: 'Local-saving editor', tone: 'notepad', appId: 'notepad' },
  { label: 'Terminal', detail: 'Fake commands', tone: 'terminal', appId: 'terminal' },
  { label: 'Control Panel', detail: 'Wallpapers and sound', tone: 'settings', appId: 'settings' },
];

export function ComputerApp() {
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();

  const handleOpenApp = (appId, launchData) => {
    openApp(appId, launchData);
    playSound('open');
  };

  return (
    <div className="ros-computer-app">
      <div className="ros-computer-layout">
        <aside className="ros-computer-sidebar" aria-label="Other Places">
          <section className="ros-sidebar-panel">
            <h2>Other Places</h2>
            <button type="button" onClick={() => handleOpenApp('explorer', { folderId: 'documents' })}>
              My Documents
            </button>
            <button type="button" onClick={() => handleOpenApp('settings')}>
              Control Panel
            </button>
          </section>
        </aside>

        <section className="ros-computer-content" aria-label="My Computer contents">
          <h1>My Computer</h1>
          <p>Main shortcuts to Roso OS system locations and persistent files.</p>

          <div className="ros-computer-grid">
            {computerItems.map((item) => (
              <button
                className="ros-computer-item"
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.appId) {
                    handleOpenApp(item.appId, item.launchData);
                  }
                }}
              >
                <span className="ros-computer-item-icon" data-tone={item.tone} aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
