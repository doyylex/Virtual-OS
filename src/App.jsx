import { useEffect } from 'react';
import { Desktop } from './components/Desktop.jsx';
import { SystemDialogs } from './components/SystemDialogs.jsx';
import { Taskbar } from './components/Taskbar.jsx';
import { useDesktopLayoutStore } from './store/useDesktopLayoutStore.js';
import { useFileSystemStore } from './store/useFileSystemStore.js';
import { useUiStore } from './store/useUiStore.js';

export default function App() {
  const closeStartMenu = useUiStore((state) => state.closeStartMenu);
  const initializeDesktopLayout = useDesktopLayoutStore((state) => state.initializeDesktopLayout);
  const initializeFileSystem = useFileSystemStore((state) => state.initializeFileSystem);

  useEffect(() => {
    initializeFileSystem();
  }, [initializeFileSystem]);

  useEffect(() => {
    initializeDesktopLayout();
  }, [initializeDesktopLayout]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeStartMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeStartMenu]);

  return (
    <div className="ros-root">
      <Desktop />
      <Taskbar />
      <SystemDialogs />
    </div>
  );
}
