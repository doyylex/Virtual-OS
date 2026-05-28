const appAliases = {
  computer: 'computer',
  pc: 'computer',
  'mi-pc': 'computer',
  mipc: 'computer',
  notepad: 'notepad',
  bloc: 'notepad',
  terminal: 'terminal',
  cmd: 'terminal',
  explorer: 'explorer',
  explorador: 'explorer',
  settings: 'settings',
  control: 'settings',
  panel: 'settings',
  'panel-de-control': 'settings',
};

const wallpapers = ['bliss', 'azul', 'plata'];

const folderAliases = {
  desktop: 'desktop-folder',
  escritorio: 'desktop-folder',
  documents: 'documents',
  documentos: 'documents',
  docs: 'documents',
};

const folderLabels = {
  'desktop-folder': 'Escritorio',
  documents: 'Mis documentos',
};

const resolveFolderId = (folderName) => folderAliases[folderName?.toLowerCase()] ?? null;

const resolveFolderAndName = (rawArgs) => {
  const trimmedArgs = rawArgs.trim();
  const firstArg = trimmedArgs.split(/\s+/)[0];
  const folderId = resolveFolderId(firstArg);

  if (!folderId) {
    return { folderId: 'documents', name: trimmedArgs };
  }

  return {
    folderId,
    name: trimmedArgs.slice(firstArg.length).trim(),
  };
};

const helpLines = [
  'Comandos disponibles:',
  '  help                Muestra esta ayuda',
  '  clear               Limpia la terminal',
  '  date                Muestra fecha y hora',
  '  echo <texto>        Repite texto',
  '  whoami              Muestra usuario actual',
  '  dir [ubicacion]     Lista Mis documentos o Escritorio',
  '  mkdir [ubicacion] <nombre>  Crea una carpeta',
  '  touch [ubicacion] <nombre>  Crea un archivo',
  '  type [ubicacion] <archivo>  Muestra un archivo',
  '  open <app>          Abre explorer, computer, notepad, terminal o settings',
  '  theme <wallpaper>   Cambia entre bliss, azul o plata',
];

export function runTerminalCommand(input, context) {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return { type: 'output', lines: [] };
  }

  const [command, ...args] = trimmedInput.split(/\s+/);
  const normalizedCommand = command.toLowerCase();
  const rawArgs = trimmedInput.slice(command.length).trim();

  switch (normalizedCommand) {
    case 'help':
      return { type: 'output', lines: helpLines };
    case 'clear':
      return { type: 'clear' };
    case 'date':
      return {
        type: 'output',
        lines: [new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'medium' }).format(new Date())],
      };
    case 'echo':
      return { type: 'output', lines: [rawArgs] };
    case 'whoami':
      return { type: 'output', lines: ['Roso'] };
    case 'dir': {
      const folderId = rawArgs ? resolveFolderId(args[0]) : 'documents';

      if (!folderId) {
        return { type: 'output', lines: ['Uso: dir [desktop|documents]'] };
      }

      return {
        type: 'output',
        lines: [`Directorio de C:\\Roso\\${folderLabels[folderId]}`, '', ...(context.listFiles?.(folderId) ?? ['No hay archivos.'])],
      };
    }
    case 'mkdir': {
      const target = resolveFolderAndName(rawArgs);

      if (!target.name) {
        return { type: 'output', lines: ['Uso: mkdir [desktop|documents] <nombre>'] };
      }

      context.createFolder?.(target.name, target.folderId);
      return { type: 'output', lines: [`Carpeta creada en ${folderLabels[target.folderId]}: ${target.name}`] };
    }
    case 'touch': {
      const target = resolveFolderAndName(rawArgs);

      if (!target.name) {
        return { type: 'output', lines: ['Uso: touch [desktop|documents] <nombre>'] };
      }

      context.createFile?.(target.name, target.folderId);
      return { type: 'output', lines: [`Archivo creado en ${folderLabels[target.folderId]}: ${target.name}`] };
    }
    case 'type': {
      const target = resolveFolderAndName(rawArgs);
      const file = context.findFile?.(target.name, target.folderId);

      if (!target.name || !file) {
        return { type: 'output', lines: [`Archivo no encontrado en ${folderLabels[target.folderId]}.`] };
      }

      return { type: 'output', lines: (file.content || 'Archivo vacio.').split('\n') };
    }
    case 'open': {
      const target = appAliases[args.join('-').toLowerCase()] ?? appAliases[args[0]?.toLowerCase()];

      if (!target) {
        return { type: 'output', lines: ['Uso: open computer|notepad|terminal|settings'] };
      }

      context.openApp(target);
      return { type: 'output', lines: [`Abriendo ${target}...`] };
    }
    case 'theme': {
      const wallpaper = args[0]?.toLowerCase();

      if (!wallpapers.includes(wallpaper)) {
        return { type: 'output', lines: ['Uso: theme bliss|azul|plata'] };
      }

      context.setWallpaper(wallpaper);
      return { type: 'output', lines: [`Wallpaper cambiado a ${wallpaper}.`] };
    }
    default:
      return {
        type: 'output',
        lines: [`'${command}' no se reconoce como un comando interno de Roso OS.`],
      };
  }
}
