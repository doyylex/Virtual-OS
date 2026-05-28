import { ComputerApp } from './ComputerApp.jsx';
import { FileExplorerApp } from './FileExplorerApp.jsx';
import { NotepadApp } from './NotepadApp.jsx';
import { PropertiesApp } from './PropertiesApp.jsx';
import { SettingsApp } from './SettingsApp.jsx';
import { TerminalApp } from './TerminalApp.jsx';

export const appRegistry = [
  {
    id: 'explorer',
    title: 'Explorador',
    description: 'Carpetas y archivos persistentes.',
    iconTone: 'folder',
    component: FileExplorerApp,
    defaultPosition: { x: 176, y: 92 },
    defaultSize: { width: 720, height: 460 },
    minSize: { width: 460, height: 300 },
    quickLaunch: true,
    desktop: true,
  },
  {
    id: 'computer',
    title: 'Mi PC',
    description: 'Unidades, lugares del sistema y accesos principales.',
    iconTone: 'computer',
    component: ComputerApp,
    defaultPosition: { x: 154, y: 86 },
    defaultSize: { width: 640, height: 420 },
    minSize: { width: 360, height: 260 },
    quickLaunch: true,
    desktop: true,
  },
  {
    id: 'notepad',
    title: 'Bloc de notas',
    description: 'Editor de texto simple con guardado local.',
    iconTone: 'notepad',
    component: NotepadApp,
    defaultPosition: { x: 238, y: 132 },
    defaultSize: { width: 560, height: 390 },
    minSize: { width: 340, height: 250 },
    quickLaunch: true,
    desktop: true,
  },
  {
    id: 'terminal',
    title: 'Terminal',
    description: 'Consola fake con comandos locales.',
    iconTone: 'terminal',
    component: TerminalApp,
    defaultPosition: { x: 292, y: 154 },
    defaultSize: { width: 600, height: 360 },
    minSize: { width: 360, height: 240 },
    quickLaunch: true,
    desktop: true,
  },
  {
    id: 'settings',
    title: 'Panel de control',
    description: 'Wallpapers, sonido y ajustes visuales.',
    iconTone: 'settings',
    component: SettingsApp,
    defaultPosition: { x: 214, y: 112 },
    defaultSize: { width: 560, height: 390 },
    minSize: { width: 360, height: 270 },
    quickLaunch: false,
    desktop: true,
  },
  {
    id: 'properties',
    title: 'Propiedades',
    description: 'Detalles del elemento seleccionado.',
    iconTone: 'settings',
    component: PropertiesApp,
    defaultPosition: { x: 320, y: 156 },
    defaultSize: { width: 390, height: 300 },
    minSize: { width: 320, height: 240 },
    quickLaunch: false,
    desktop: false,
    hidden: true,
  },
];

export const getAppById = (appId) => appRegistry.find((app) => app.id === appId);

export const getQuickLaunchApps = () => appRegistry.filter((app) => app.quickLaunch);

export const getDesktopApps = () => appRegistry.filter((app) => app.desktop);
