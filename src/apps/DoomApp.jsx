import { useCallback, useEffect, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useWindowStore } from '../store/useWindowStore.js';

const getAssetUrl = (filename) => {
  const base = import.meta.env?.BASE_URL || '/';
  const separator = base.endsWith('/') ? '' : '/';

  return `${base}${separator}${filename}`;
};

const configureDosRuntime = () => {
  if (window.emulators) {
    window.emulators.pathPrefix = getAssetUrl('js-dos/');
  }
};

const focusEmulatorCanvas = (container) => {
  const canvas = container?.querySelector('canvas');

  canvas?.focus();
};

const removeGlobalDosStylesheet = () => {
  const cssUrl = getAssetUrl('js-dos/js-dos.css');
  const link = document.querySelector(`link[href="${cssUrl}"]`);

  link?.remove();
};

export function DoomApp({ windowId }) {
  const containerRef = useRef(null);
  const emulatorRef = useRef(null);
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const playSound = useSystemSound();
  const [isReady, setIsReady] = useState(() => Boolean(window.Dos));
  const [loadError, setLoadError] = useState('');
  const [resetCounter, setResetCounter] = useState(0);

  useEffect(() => {
    configureDosRuntime();
    removeGlobalDosStylesheet();

    if (window.Dos) {
      return undefined;
    }

    const jsUrl = getAssetUrl('js-dos/js-dos.js');
    let script = document.querySelector(`script[src="${jsUrl}"]`);
    let readinessTimer = null;

    const markReady = () => {
      configureDosRuntime();
      setLoadError('');
      setIsReady(true);
    };

    if (!script) {
      script = document.createElement('script');
      script.src = jsUrl;
      script.async = true;
      script.onload = markReady;
      script.onerror = () => {
        setLoadError('The emulation engine could not be loaded.');
      };
      document.head.appendChild(script);
    } else if (!window.Dos) {
      readinessTimer = window.setInterval(() => {
        if (window.Dos) {
          window.clearInterval(readinessTimer);
          markReady();
        }
      }, 100);
    }

    return () => {
      if (readinessTimer) {
        window.clearInterval(readinessTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady || !containerRef.current || !window.Dos) {
      return undefined;
    }

    let isMounted = true;
    let emulatorInstance = null;

    setLoadError('');
    configureDosRuntime();

    window.Dos(containerRef.current, {
      noFullscreen: true,
      noSideBar: true,
      noSocialLinks: true,
      style: 'none',
    })
      .run(getAssetUrl('doom.jsdos'))
      .then((instance) => {
        if (!isMounted) {
          instance.exit();
          return;
        }

        emulatorInstance = instance;
        emulatorRef.current = instance;

        window.setTimeout(() => {
          focusEmulatorCanvas(containerRef.current);
        }, 200);
      })
      .catch((error) => {
        console.error('Error starting DOOM:', error);
        setLoadError('DOOM could not be started.');
      });

    return () => {
      isMounted = false;

      if (emulatorInstance) {
        emulatorInstance.exit();
      } else if (emulatorRef.current) {
        emulatorRef.current.exit();
      }

      emulatorRef.current = null;
    };
  }, [isReady, resetCounter]);

  useEffect(() => {
    if (!windowId || activeWindowId === windowId) {
      focusEmulatorCanvas(containerRef.current);
    }
  }, [activeWindowId, windowId, isReady, resetCounter]);

  const handleRestart = useCallback(() => {
    playSound('click');

    if (emulatorRef.current) {
      emulatorRef.current.exit();
      emulatorRef.current = null;
    }

    setResetCounter((currentResetCounter) => currentResetCounter + 1);
  }, [playSound]);

  return (
    <div className="ros-doom-app">
      <div className="ros-app-toolbar ros-doom-toolbar" aria-label="DOOM controls">
        <div className="ros-doom-toolbar-main">
          <strong>DOOM</strong>
          <span className="ros-doom-legend">
            Move: WASD/Arrows | Fire: CTRL/Left click | Doors/Use: Space
          </span>
        </div>
        <div className="ros-doom-toolbar-actions">
          <button className="ros-app-toolbar-button ros-doom-restart-button" type="button" onClick={handleRestart}>
            Restart Game
          </button>
        </div>
      </div>

      <div className="ros-doom-container">
        <aside className="ros-doom-help-panel" aria-label="DOOM help">
          <h3>Control Guide</h3>
          <div className="ros-doom-controls-list">
            <div><strong>Move:</strong> WASD / Arrows</div>
            <div><strong>Fire:</strong> Ctrl / Left click</div>
            <div><strong>Open doors:</strong> Spacebar</div>
            <div><strong>Strafe:</strong> Alt + movement</div>
            <div><strong>Weapons:</strong> Numbers 1 to 7</div>
            <div><strong>Mouse capture:</strong> Click screen, Esc releases</div>
          </div>

          <h3>Classic Cheats</h3>
          <div className="ros-doom-cheat-grid">
            <strong>iddqd</strong><span>God mode</span>
            <strong>idkfa</strong><span>Weapons and keys</span>
            <strong>idclip</strong><span>Walk through walls</span>
            <strong>idchoppers</strong><span>Chainsaw</span>
            <strong>idclevXX</strong><span>Go to level 01-09</span>
          </div>

          <div className="ros-doom-legal">id Software 1993</div>
        </aside>

        <div className="ros-doom-stage">
          {(!isReady || loadError) && (
            <div className="ros-doom-loading">
              {loadError || 'Loading emulation engine...'}
            </div>
          )}
          <div className="ros-doom-emulator" ref={containerRef} />
        </div>
      </div>
    </div>
  );
}
