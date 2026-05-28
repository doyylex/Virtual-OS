import { appRegistry } from '../apps/appRegistry.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const systemLinks = [
  { label: 'Mis documentos', iconTone: 'folder', appId: 'explorer', launchData: { folderId: 'documents' } },
  { label: 'Mi PC', iconTone: 'computer', appId: 'computer' },
  { label: 'Bloc de notas', iconTone: 'notepad', appId: 'notepad' },
  { label: 'Terminal', iconTone: 'terminal', appId: 'terminal' },
  { label: 'Panel de control', iconTone: 'settings', appId: 'settings' },
  { label: 'Ayuda y soporte tecnico', iconTone: 'help' },
];

export function StartMenu() {
  const isStartMenuOpen = useUiStore((state) => state.isStartMenuOpen);
  const isAllProgramsOpen = useUiStore((state) => state.isAllProgramsOpen);
  const closeStartMenu = useUiStore((state) => state.closeStartMenu);
  const toggleAllPrograms = useUiStore((state) => state.toggleAllPrograms);
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();

  const handleOpenApp = (appId, launchData) => {
    openApp(appId, launchData);
    closeStartMenu();
    playSound('open');
  };

  if (!isStartMenuOpen) {
    return null;
  }

  return (
    <nav className="ros-start-menu" aria-label="Menu inicio">
      <header className="ros-start-menu-header">
        <div className="ros-user-picture" aria-hidden="true">R</div>
        <div>
          <p className="ros-user-name">Roso</p>
          <p className="ros-user-status">Sesion local</p>
        </div>
      </header>

      <div className="ros-start-menu-body">
        <section className="ros-start-menu-column" aria-label="Programas fijados">
          <p className="ros-menu-section-title">Programas fijados</p>
          {appRegistry.filter((app) => app.quickLaunch && !app.hidden).map((app) => (
            <button
              className="ros-menu-item"
              key={app.id}
              type="button"
              onClick={() => handleOpenApp(app.id)}
            >
              <span className="ros-menu-item-icon" data-kind={app.iconTone} aria-hidden="true" />
              <span>
                <strong>{app.title}</strong>
                <small>{app.description}</small>
              </span>
            </button>
          ))}
          <button
            className="ros-all-programs-button"
            type="button"
            aria-expanded={isAllProgramsOpen}
            onClick={() => {
              toggleAllPrograms();
              playSound('click');
            }}
          >
            Todos los programas
            <span aria-hidden="true">&gt;</span>
          </button>
          {isAllProgramsOpen ? (
            <div className="ros-programs-panel" aria-label="Todos los programas">
              {appRegistry.filter((app) => !app.hidden).map((app) => (
                <button className="ros-menu-item ros-menu-item-compact" key={app.id} type="button" onClick={() => handleOpenApp(app.id)}>
                  <span className="ros-menu-item-icon" data-kind={app.iconTone} aria-hidden="true" />
                  {app.title}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="ros-start-menu-column ros-start-menu-column-alt" aria-label="Accesos del sistema">
          {systemLinks.map((link) => (
            <button
              className="ros-menu-item ros-menu-item-secondary"
              key={link.label}
              type="button"
              onClick={() => {
                if (link.appId) {
                  handleOpenApp(link.appId, link.launchData);
                }
              }}
            >
              <span className="ros-menu-item-icon" data-kind={link.iconTone} aria-hidden="true" />
              {link.label}
            </button>
          ))}
        </section>
      </div>

      <footer className="ros-start-menu-footer">
        <button className="ros-session-button" type="button">Cerrar sesion</button>
        <button className="ros-session-button ros-session-button-danger" type="button">Apagar</button>
      </footer>
    </nav>
  );
}
