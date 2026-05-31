import { useState } from 'react';
import { appRegistry } from './appRegistry.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { soundPackNames } from '../services/soundSystem.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const wallpaperOptions = [
  { id: 'bliss', label: 'Bliss', description: 'Colinas verdes y cielo azul clasico.' },
  { id: 'azul', label: 'Azul', description: 'Fondo limpio para concentrarse.' },
  { id: 'plata', label: 'Plata', description: 'Tono claro inspirado en el tema Silver.' },
];

const soundPackLabels = {
  xp: 'XP clasico',
  soft: 'Suave',
  terminal: 'Terminal',
};

const testSounds = [
  { id: 'click', label: 'Click' },
  { id: 'error', label: 'Error' },
  { id: 'start', label: 'Inicio' },
  { id: 'save', label: 'Guardar' },
];

export function SettingsApp() {
  const [activeTab, setActiveTab] = useState('appearance');
  const wallpaper = useUiStore((state) => state.wallpaper);
  const isSoundEnabled = useUiStore((state) => state.isSoundEnabled);
  const soundVolume = useUiStore((state) => state.soundVolume);
  const soundPack = useUiStore((state) => state.soundPack);
  const setWallpaper = useUiStore((state) => state.setWallpaper);
  const toggleSoundEnabled = useUiStore((state) => state.toggleSoundEnabled);
  const setSoundVolume = useUiStore((state) => state.setSoundVolume);
  const setSoundPack = useUiStore((state) => state.setSoundPack);
  const windows = useWindowStore((state) => state.windows);
  const playSound = useSystemSound();
  const visibleWindows = windows.filter((windowItem) => !windowItem.isMinimized);
  const volumePercent = Math.round(soundVolume * 100);

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    playSound('click');
  };

  const handleVolumeChange = (event) => {
    setSoundVolume(event.target.valueAsNumber / 100);
  };

  const handleVolumeCommit = () => {
    playSound('click');
  };

  const handlePackClick = (packId) => {
    setSoundPack(packId);
    playSound('click', { pack: packId, force: true });
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
            <div className="ros-sound-panel">
              <button
                className="ros-toggle-row"
                data-active={isSoundEnabled ? 'true' : 'false'}
                type="button"
                onClick={() => {
                  toggleSoundEnabled();
                  if (!isSoundEnabled) {
                    playSound('click', { isEnabled: true, force: true });
                  }
                }}
              >
                <span className="ros-toggle-switch" aria-hidden="true" />
                <span>
                  <strong>Sonidos retro</strong>
                  <small>{isSoundEnabled ? 'Activados' : 'Desactivados'}</small>
                </span>
              </button>

              <label className="ros-sound-control">
                <span>
                  <strong>Volumen</strong>
                  <small>{volumePercent}%</small>
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={volumePercent}
                  disabled={!isSoundEnabled}
                  onChange={handleVolumeChange}
                  onPointerUp={handleVolumeCommit}
                  onKeyUp={handleVolumeCommit}
                />
              </label>

              <div className="ros-sound-control">
                <span>
                  <strong>Pack de sonido</strong>
                  <small>{soundPackLabels[soundPack] ?? soundPack}</small>
                </span>
                <div className="ros-sound-pack-list" role="group" aria-label="Pack de sonido">
                  {soundPackNames.map((packName) => (
                    <button
                      key={packName}
                      type="button"
                      aria-pressed={soundPack === packName}
                      disabled={!isSoundEnabled}
                      onClick={() => handlePackClick(packName)}
                    >
                      {soundPackLabels[packName] ?? packName}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ros-sound-test-row" role="group" aria-label="Probar sonidos">
                {testSounds.map((sound) => (
                  <button
                    key={sound.id}
                    className="ros-app-toolbar-button"
                    type="button"
                    disabled={!isSoundEnabled}
                    onClick={() => playSound(sound.id)}
                  >
                    {sound.label}
                  </button>
                ))}
              </div>
            </div>
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
                <dd>28 - Sistema de sonidos</dd>
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
