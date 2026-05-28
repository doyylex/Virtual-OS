import { useState } from 'react';
import { appRegistry } from './appRegistry.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const wallpaperOptions = [
  { id: 'bliss', label: 'Bliss', description: 'Colinas verdes y cielo azul clasico.' },
  { id: 'azul', label: 'Azul', description: 'Fondo limpio para concentrarse.' },
  { id: 'plata', label: 'Plata', description: 'Tono claro inspirado en el tema Silver.' },
];

export function SettingsApp() {
  const [activeTab, setActiveTab] = useState('appearance');
  const wallpaper = useUiStore((state) => state.wallpaper);
  const isSoundEnabled = useUiStore((state) => state.isSoundEnabled);
  const setWallpaper = useUiStore((state) => state.setWallpaper);
  const toggleSoundEnabled = useUiStore((state) => state.toggleSoundEnabled);
  const windows = useWindowStore((state) => state.windows);
  const playSound = useSystemSound();
  const visibleWindows = windows.filter((windowItem) => !windowItem.isMinimized);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    playSound('click');
  };

  return (
    <div className="ros-settings-app">
      <section className="ros-settings-section">
        <header>
          <h1>Panel de control</h1>
          <p>Ajustes visuales, sonido y estado del sistema.</p>
        </header>

        <div className="ros-settings-tabs" role="tablist" aria-label="Secciones de Panel de control">
          <button type="button" role="tab" aria-selected={activeTab === 'appearance'} onClick={() => handleTabClick('appearance')}>
            Apariencia
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'sound'} onClick={() => handleTabClick('sound')}>
            Sonido
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'system'} onClick={() => handleTabClick('system')}>
            Sistema
          </button>
        </div>

        {activeTab === 'appearance' ? (
          <div className="ros-settings-group" role="tabpanel">
            <h2>Wallpapers</h2>
            <div className="ros-wallpaper-options">
              {wallpaperOptions.map((option) => (
                <button
                  className="ros-wallpaper-option"
                  data-active={wallpaper === option.id ? 'true' : 'false'}
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setWallpaper(option.id);
                    playSound('click');
                  }}
                >
                  <span className="ros-wallpaper-preview" data-wallpaper={option.id} aria-hidden="true" />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'sound' ? (
          <div className="ros-settings-group" role="tabpanel">
            <h2>Sonido</h2>
            <button
              className="ros-toggle-row"
              data-active={isSoundEnabled ? 'true' : 'false'}
              type="button"
              onClick={() => {
                toggleSoundEnabled();
                playSound('click');
              }}
            >
              <span className="ros-toggle-switch" aria-hidden="true" />
              <span>
                <strong>Sonidos retro</strong>
                <small>{isSoundEnabled ? 'Activados' : 'Desactivados'}</small>
              </span>
            </button>
          </div>
        ) : null}

        {activeTab === 'system' ? (
          <div className="ros-settings-group" role="tabpanel">
            <h2>Sistema</h2>
            <dl className="ros-system-info">
              <div>
                <dt>Nombre</dt>
                <dd>Roso OS</dd>
              </div>
              <div>
                <dt>Etapa</dt>
                <dd>4 - Apps simples</dd>
              </div>
              <div>
                <dt>Memoria simulada</dt>
                <dd>256 MB</dd>
              </div>
              <div>
                <dt>Apps registradas</dt>
                <dd>{appRegistry.length}</dd>
              </div>
              <div>
                <dt>Ventanas abiertas</dt>
                <dd>{windows.length}</dd>
              </div>
              <div>
                <dt>Ventanas visibles</dt>
                <dd>{visibleWindows.length}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </section>
    </div>
  );
}
