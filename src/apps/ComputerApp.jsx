import { useSystemSound } from '../hooks/useSystemSound.js';
import { useWindowStore } from '../store/useWindowStore.js';

const computerItems = [
  { label: 'Disco local (C:)', detail: 'Sistema de Roso OS', tone: 'drive', appId: 'explorer', launchData: { folderId: 'root' } },
  { label: 'Escritorio', detail: 'Archivos visibles en el desktop', tone: 'folder', appId: 'explorer', launchData: { folderId: 'desktop-folder' } },
  { label: 'Mis documentos', detail: 'Archivos persistentes', tone: 'folder', appId: 'explorer', launchData: { folderId: 'documents' } },
  { label: 'Explorador', detail: 'Carpetas y archivos', tone: 'folder', appId: 'explorer' },
  { label: 'Bloc de notas', detail: 'Editor con guardado local', tone: 'notepad', appId: 'notepad' },
  { label: 'Terminal', detail: 'Comandos fake', tone: 'terminal', appId: 'terminal' },
  { label: 'Panel de control', detail: 'Wallpapers y sonido', tone: 'settings', appId: 'settings' },
  { label: 'Red', detail: 'Conexiones simuladas', tone: 'network' },
];

export function ComputerApp() {
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();

  return (
    <div className="ros-computer-app">
      <div className="ros-app-toolbar" aria-label="Barra de herramientas">
        <button className="ros-app-toolbar-button" type="button">Atras</button>
        <button className="ros-app-toolbar-button" type="button">Buscar</button>
        <button className="ros-app-toolbar-button" type="button">Carpetas</button>
      </div>

      <div className="ros-computer-layout">
        <aside className="ros-computer-sidebar" aria-label="Tareas del sistema">
          <section className="ros-sidebar-panel">
            <h2>Tareas del sistema</h2>
            <button type="button">Ver informacion del sistema</button>
            <button type="button">Agregar o quitar programas</button>
            <button type="button">Cambiar una configuracion</button>
          </section>
          <section className="ros-sidebar-panel">
            <h2>Otros lugares</h2>
            <button type="button">Mis documentos</button>
            <button type="button">Panel de control</button>
          </section>
        </aside>

        <section className="ros-computer-content" aria-label="Contenido de Mi PC">
          <h1>Mi PC</h1>
          <p>Accesos principales al sistema de ventanas y al filesystem persistente de Roso OS.</p>

          <div className="ros-computer-grid">
            {computerItems.map((item) => (
              <button
                className="ros-computer-item"
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.appId) {
                    openApp(item.appId, item.launchData);
                    playSound('open');
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
