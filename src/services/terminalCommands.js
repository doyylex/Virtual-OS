import { joinFileName, splitFileName } from './fileNames.js';
import { isImageFileName, isTextFileName } from './fileIcons.js';

const rootId = 'root';
const defaultFolderId = 'documents';
const recycleBinFolderId = 'recycle-bin-folder';
const protectedNodeIds = new Set([rootId, 'documents', 'desktop-folder', 'system-folder', recycleBinFolderId]);
const terminalVersion = 'Roso OS Terminal [Version 0.4.0]';
const systemVersion = 'Roso OS 0.18.4';

const appAliases = {
  computer: 'computer',
  pc: 'computer',
  notepad: 'notepad',
  terminal: 'terminal',
  cmd: 'terminal',
  explorer: 'explorer',
  settings: 'settings',
  control: 'settings',
  panel: 'settings',
};

const wallpapers = ['bliss', 'blue', 'silver'];

const folderAliases = {
  '.': null,
  c: rootId,
  'c:': rootId,
  root: rootId,
  roso: rootId,
  desktop: 'desktop-folder',
  documents: 'documents',
  docs: 'documents',
  trash: 'recycle-bin-folder',
  recycle: 'recycle-bin-folder',
};

const stripOuterQuotes = (value) => {
  const trimmedValue = value.trim();
  const firstChar = trimmedValue[0];
  const lastChar = trimmedValue.at(-1);

  if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
    return trimmedValue.slice(1, -1).trim();
  }

  return trimmedValue;
};

const normalizeSegment = (segment) => segment.trim().toLowerCase();

const getNodeById = (nodes, nodeId) => nodes.find((node) => node.id === nodeId) ?? null;

const getNodePath = (nodes, nodeId) => {
  const path = [];
  let currentNode = getNodeById(nodes, nodeId);

  while (currentNode) {
    path.unshift(currentNode);
    currentNode = getNodeById(nodes, currentNode.parentId);
  }

  return path;
};

const isNodeInsideTrash = (nodes, nodeId) => {
  let currentNode = getNodeById(nodes, nodeId);

  while (currentNode) {
    if (currentNode.parentId === recycleBinFolderId) {
      return true;
    }

    currentNode = getNodeById(nodes, currentNode.parentId);
  }

  return false;
};

const getDescendantIds = (nodes, nodeId) => {
  const directChildren = nodes.filter((node) => node.parentId === nodeId);

  return directChildren.flatMap((child) => [child.id, ...getDescendantIds(nodes, child.id)]);
};

export const getTerminalPath = (nodes, folderId = defaultFolderId) => {
  const path = getNodePath(nodes, folderId);
  const visiblePath = path.filter((node) => node.id !== rootId).map((node) => node.name);

  return `C:\\Roso${visiblePath.length > 0 ? `\\${visiblePath.join('\\')}` : ''}`;
};

const findChildByName = (nodes, parentId, segment) =>
  nodes.find(
    (node) => node.parentId === parentId && node.name.toLowerCase() === segment.trim().toLowerCase(),
  ) ?? null;

const getPathSegments = (rawPath) =>
  stripOuterQuotes(rawPath)
    .replaceAll('/', '\\')
    .split('\\')
    .map((segment) => segment.trim())
    .filter(Boolean);

const tokenizeCommandArgs = (rawArgs) => {
  const tokens = [];
  let currentToken = '';
  let quoteChar = null;

  for (const char of rawArgs.trim()) {
    if ((char === '"' || char === "'") && !quoteChar) {
      quoteChar = char;
      continue;
    }

    if (char === quoteChar) {
      quoteChar = null;
      continue;
    }

    if (/\s/.test(char) && !quoteChar) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }

      continue;
    }

    currentToken += char;
  }

  if (currentToken) {
    tokens.push(currentToken);
  }

  return tokens;
};

const resolvePath = (rawPath, context) => {
  const nodes = context.nodes ?? [];
  const trimmedPath = stripOuterQuotes(rawPath);
  const fallbackFolder = getNodeById(nodes, context.currentFolderId) ?? getNodeById(nodes, defaultFolderId) ?? getNodeById(nodes, rootId);

  if (!trimmedPath) {
    return { node: fallbackFolder };
  }

  const normalizedPath = trimmedPath.replaceAll('/', '\\').replace(/\\+/g, '\\');
  const lowerPath = normalizedPath.toLowerCase();

  if (['\\', 'c:', 'c:\\', 'c:\\roso', 'c:\\roso\\'].includes(lowerPath)) {
    return { node: getNodeById(nodes, rootId) };
  }

  let startNode = fallbackFolder;
  let pathToResolve = normalizedPath;

  if (lowerPath.startsWith('c:\\roso\\')) {
    startNode = getNodeById(nodes, rootId);
    pathToResolve = normalizedPath.slice('C:\\Roso\\'.length);
  } else if (normalizedPath.startsWith('\\')) {
    startNode = getNodeById(nodes, rootId);
    pathToResolve = normalizedPath.replace(/^\\+/, '');
  }

  const segments = getPathSegments(pathToResolve);

  if (segments.length === 0) {
    return { node: startNode };
  }

  const firstAliasId = folderAliases[normalizeSegment(segments[0])];
  let currentNode = firstAliasId ? getNodeById(nodes, firstAliasId) : startNode;
  const remainingSegments = firstAliasId ? segments.slice(1) : segments;

  if (!currentNode) {
    return { error: 'Path not found.' };
  }

  for (const segment of remainingSegments) {
    const normalizedSegment = normalizeSegment(segment);

    if (!segment || normalizedSegment === '.') {
      continue;
    }

    if (normalizedSegment === '..') {
      currentNode = getNodeById(nodes, currentNode.parentId) ?? currentNode;
      continue;
    }

    if (currentNode.type !== 'folder') {
      return { error: `"${currentNode.name}" is not a folder.` };
    }

    const childNode = findChildByName(nodes, currentNode.id, segment);

    if (!childNode) {
      return { error: `The specified path was not found: ${segment}` };
    }

    currentNode = childNode;
  }

  return { node: currentNode };
};

const resolveFolderPath = (rawPath, context) => {
  const result = resolvePath(rawPath, context);

  if (result.error) {
    return result;
  }

  if (result.node?.type !== 'folder') {
    return { error: `"${result.node?.name ?? rawPath}" is not a folder.` };
  }

  return result;
};

const getFileSize = (node) => (node?.type === 'file' ? (node.content ?? '').length : 0);

const formatDirectoryLine = (node) => {
  if (node.type === 'folder') {
    return `<DIR>       ${node.name}`;
  }

  return `${String(getFileSize(node)).padStart(5, ' ')} bytes  ${node.name}`;
};

const listDirectory = (folder, context) => {
  const children = (context.nodes ?? [])
    .filter((node) => node.parentId === folder.id)
    .sort((firstNode, secondNode) => {
      if (firstNode.type !== secondNode.type) {
        return firstNode.type === 'folder' ? -1 : 1;
      }

      return firstNode.name.localeCompare(secondNode.name, 'en');
    });

  return [
    `Directory of ${getTerminalPath(context.nodes, folder.id)}`,
    '',
    ...(children.length > 0 ? children.map(formatDirectoryLine) : ['No files.']),
  ];
};

const resolveFolderAndName = (rawArgs, context) => {
  const trimmedArgs = stripOuterQuotes(rawArgs);

  if (!trimmedArgs) {
    return { folderId: context.currentFolderId ?? defaultFolderId, name: '' };
  }

  const [firstArg, ...restArgs] = trimmedArgs.split(/\s+/);
  const normalizedFirstArg = normalizeSegment(firstArg);
  const hasFolderAlias = Object.prototype.hasOwnProperty.call(folderAliases, normalizedFirstArg);
  const folderId = folderAliases[normalizedFirstArg] ?? context.currentFolderId ?? defaultFolderId;

  if (hasFolderAlias && restArgs.length > 0) {
    return {
      folderId,
      name: stripOuterQuotes(restArgs.join(' ')),
    };
  }

  const segments = getPathSegments(trimmedArgs);

  if (segments.length <= 1) {
    return { folderId: context.currentFolderId ?? defaultFolderId, name: trimmedArgs };
  }

  const name = segments.at(-1);
  const parentPath = segments.slice(0, -1).join('\\');
  const parentResult = resolveFolderPath(parentPath, context);

  if (parentResult.error) {
    return { error: parentResult.error, folderId: context.currentFolderId ?? defaultFolderId, name };
  }

  return { folderId: parentResult.node.id, name };
};

const getTerminalTextFileName = (name) => {
  const cleanName = stripOuterQuotes(name);
  const { baseName } = splitFileName(cleanName);

  return joinFileName(baseName || cleanName, '.txt');
};

const canOperateOnNode = (node, context) =>
  Boolean(node && !protectedNodeIds.has(node.id) && !isNodeInsideTrash(context.nodes ?? [], node.id));

const parseSourceAndTarget = (rawArgs) => {
  const tokens = tokenizeCommandArgs(rawArgs);

  if (tokens.length < 2) {
    return { error: 'missing-target' };
  }

  return {
    sourcePath: tokens[0],
    targetPath: tokens.slice(1).join(' '),
  };
};

const commandHelp = {
  help: ['help [command]', 'Shows general help or details for a command.'],
  clear: ['clear', 'Clears terminal output. Alias: cls.'],
  cls: ['cls', 'Alias for clear.'],
  exit: ['exit', 'Closes the current Terminal window.'],
  ver: ['ver', 'Shows the Roso OS Terminal version.'],
  systeminfo: ['systeminfo', 'Shows simulated system information.'],
  date: ['date', 'Shows the current date and time.'],
  echo: ['echo <text>', 'Repeats the written text.'],
  whoami: ['whoami', 'Shows the current user.'],
  pwd: ['pwd', 'Shows the current folder.'],
  cd: ['cd [path]', 'Changes folder. Supports ., .., desktop, documents, and C:\\Roso.'],
  dir: ['dir [path]', 'Lists files and folders in the given path or current folder.'],
  cat: ['cat <file>', 'Shows the contents of a text file.'],
  type: ['type <file>', 'Alias for cat.'],
  mkdir: ['mkdir [path] <name>', 'Creates a folder in the given path or current folder.'],
  touch: ['touch [path] <name>', 'Creates a .txt file in the given path or current folder.'],
  rm: ['rm <path>', 'Moves a file or folder to the Recycle Bin. Alias: del.'],
  del: ['del <path>', 'Alias for rm.'],
  copy: ['copy <source> <target-folder>', 'Copies a file or folder to another folder.'],
  move: ['move <source> <target-folder>', 'Moves a file or folder to another folder.'],
  open: ['open <app|path>', 'Opens apps, folders in File Explorer, or .txt files in Notepad.'],
  theme: ['theme <bliss|blue|silver>', 'Changes the desktop wallpaper.'],
};

const commandNames = Object.keys(commandHelp);

const helpLines = [
  'Available commands:',
  '  help [command]               Shows this help or command-specific help',
  '  clear                        Clears the terminal',
  '  cls                          Alias for clear',
  '  exit                         Closes Terminal',
  '  ver                          Shows system version',
  '  systeminfo                   Shows system information',
  '  date                         Shows date and time',
  '  echo <text>                  Repeats text',
  '  whoami                       Shows current user',
  '  pwd                          Shows the current folder',
  '  cd [path]                    Changes folder',
  '  dir [path]                   Lists a folder',
  '  cat <file>                  Shows a text file',
  '  type <file>                 Alias for cat',
  '  mkdir [path] <name>          Creates a folder',
  '  touch [path] <name>          Creates a file',
  '  rm <path>                    Moves file/folder to Recycle Bin',
  '  copy <source> <folder>      Copies to another folder',
  '  move <source> <folder>      Moves to another folder',
  '  open <app|path>              Opens apps, folders, or .txt files',
  '  theme <wallpaper>            Switches between bliss, blue, or silver',
  '',
  'Useful paths: .  ..  desktop  documents  C:\\Roso',
];

const getSpecificHelpLines = (commandName) => {
  const normalizedCommandName = normalizeSegment(commandName);
  const detail = commandHelp[normalizedCommandName];

  if (!detail) {
    return [`No help for "${commandName}".`, 'Use help to see available commands.'];
  }

  return [detail[0], `  ${detail[1]}`];
};

const getSystemInfoLines = (context) => {
  const nodes = context.nodes ?? [];
  const folders = nodes.filter((node) => node.type === 'folder');
  const files = nodes.filter((node) => node.type === 'file');
  const trashItems = nodes.filter((node) => node.parentId === recycleBinFolderId);

  return [
    `System name:             ${systemVersion}`,
    `Terminal version:        ${terminalVersion}`,
    'Registered user:         Roso',
    'System type:             Web simulation in browser',
    'Project stage:           18.4 Polished Terminal',
    `Current directory:       ${getTerminalPath(nodes, context.currentFolderId)}`,
    `Indexed folders:         ${folders.length}`,
    `Indexed files:           ${files.length}`,
    `Items in Recycle Bin:    ${trashItems.length}`,
    `Open windows:            ${context.windowCount ?? 0}`,
    `System sounds:           ${context.soundsEnabled ? 'Enabled' : 'Disabled'}`,
  ];
};

const getLastArgumentToken = (rawArgs) => {
  let quoteChar = null;
  let lastBoundaryIndex = -1;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const char = rawArgs[index];

    if ((char === '"' || char === "'") && !quoteChar) {
      quoteChar = char;
      continue;
    }

    if (char === quoteChar) {
      quoteChar = null;
      continue;
    }

    if (/\s/.test(char) && !quoteChar) {
      lastBoundaryIndex = index;
    }
  }

  const prefix = rawArgs.slice(0, lastBoundaryIndex + 1);
  const token = rawArgs.slice(lastBoundaryIndex + 1);
  const quote = token[0] === '"' || token[0] === "'" ? token[0] : '';

  return {
    prefix,
    rawToken: token,
    token: quote ? token.slice(1) : token,
    quote,
  };
};

const getCompletionParts = (token) => {
  const cleanToken = stripOuterQuotes(token).replaceAll('/', '\\');
  const slashIndex = cleanToken.lastIndexOf('\\');

  if (slashIndex === -1) {
    return {
      parentPath: '',
      pathPrefix: '',
      namePrefix: cleanToken,
    };
  }

  return {
    parentPath: cleanToken.slice(0, slashIndex),
    pathPrefix: cleanToken.slice(0, slashIndex + 1),
    namePrefix: cleanToken.slice(slashIndex + 1),
  };
};

const quoteCompletionValue = (value, shouldQuote) =>
  shouldQuote || /\s/.test(value) ? `"${value}"` : value;

const getPathCompletion = (command, rawArgs, context) => {
  const tokenInfo = getLastArgumentToken(rawArgs);
  const parts = getCompletionParts(tokenInfo.token);
  const parentResult = parts.parentPath ? resolveFolderPath(parts.parentPath, context) : resolveFolderPath('', context);

  if (parentResult.error) {
    return null;
  }

  const isTargetPath =
    ['copy', 'move'].includes(command) &&
    (tokenizeCommandArgs(rawArgs).length > 1 || (/\s$/.test(rawArgs) && tokenizeCommandArgs(rawArgs).length === 1));
  const foldersOnly = ['cd'].includes(command) || isTargetPath;
  const candidates = (context.nodes ?? [])
    .filter((node) => node.parentId === parentResult.node.id)
    .filter((node) => !foldersOnly || node.type === 'folder')
    .filter((node) => node.name.toLowerCase().startsWith(parts.namePrefix.toLowerCase()))
    .sort((firstNode, secondNode) => firstNode.name.localeCompare(secondNode.name, 'en'));

  if (candidates.length === 0) {
    return null;
  }

  if (candidates.length > 1) {
    return {
      lines: ['Suggestions:', ...candidates.map((node) => `  ${node.type === 'folder' ? '<DIR>' : '     '} ${node.name}`)],
    };
  }

  const completedPath = `${parts.pathPrefix}${candidates[0].name}`;
  const completedToken = quoteCompletionValue(completedPath, Boolean(tokenInfo.quote));

  return {
    value: `${command} ${tokenInfo.prefix}${completedToken} `,
  };
};

export const getTerminalCompletion = (input, context) => {
  const commandMatch = input.match(/^(\S*)(?:\s+([\s\S]*))?$/);
  const command = commandMatch?.[1] ?? '';
  const rawArgs = commandMatch?.[2] ?? '';
  const normalizedCommand = normalizeSegment(command);

  if (!input.includes(' ')) {
    const matches = commandNames.filter((commandName) => commandName.startsWith(normalizedCommand));

    if (matches.length === 1) {
      return { value: `${matches[0]} ` };
    }

    if (matches.length > 1) {
      return { lines: ['Commands:', `  ${matches.join('  ')}`] };
    }

    return null;
  }

  if (normalizedCommand === 'theme') {
    const matches = wallpapers.filter((wallpaper) => wallpaper.startsWith(rawArgs.toLowerCase()));

    if (matches.length === 1) {
      return { value: `theme ${matches[0]} ` };
    }

    return matches.length > 1 ? { lines: ['Wallpapers:', `  ${matches.join('  ')}`] } : null;
  }

  if (normalizedCommand === 'open') {
    const pathCompletion = getPathCompletion(normalizedCommand, rawArgs, context);

    if (pathCompletion) {
      return pathCompletion;
    }

    const appMatches = Object.keys(appAliases).filter((alias) => alias.startsWith(rawArgs.toLowerCase()));

    if (appMatches.length === 1) {
      return { value: `open ${appMatches[0]} ` };
    }

    if (appMatches.length > 1) {
      return { lines: ['Apps:', `  ${appMatches.join('  ')}`] };
    }
  }

  if (['cd', 'dir', 'cat', 'type', 'rm', 'del', 'copy', 'move'].includes(normalizedCommand)) {
    return getPathCompletion(normalizedCommand, rawArgs, context);
  }

  return null;
};

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
      return { type: 'output', lines: rawArgs ? getSpecificHelpLines(args[0]) : helpLines };
    case 'clear':
    case 'cls':
      return { type: 'clear' };
    case 'exit':
      return { type: 'exit' };
    case 'ver':
      return { type: 'output', lines: [terminalVersion] };
    case 'systeminfo':
      return { type: 'output', lines: getSystemInfoLines(context) };
    case 'date':
      return {
        type: 'output',
        lines: [new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'medium' }).format(new Date())],
      };
    case 'echo':
      return { type: 'output', lines: [rawArgs] };
    case 'whoami':
      return { type: 'output', lines: ['Roso'] };
    case 'pwd':
      return { type: 'output', lines: [getTerminalPath(context.nodes, context.currentFolderId)] };
    case 'cd': {
      if (!rawArgs) {
        return { type: 'output', lines: [getTerminalPath(context.nodes, context.currentFolderId)] };
      }

      const result = resolveFolderPath(rawArgs, context);

      if (result.error) {
        return { type: 'output', lines: [result.error] };
      }

      return { type: 'output', lines: [], nextFolderId: result.node.id };
    }
    case 'dir': {
      const result = rawArgs ? resolvePath(rawArgs, context) : resolveFolderPath('', context);

      if (result.error) {
        return { type: 'output', lines: [result.error] };
      }

      if (result.node.type === 'file') {
        const parent = getNodeById(context.nodes, result.node.parentId);

        return {
          type: 'output',
          lines: [`Directory of ${getTerminalPath(context.nodes, parent?.id)}`, '', formatDirectoryLine(result.node)],
        };
      }

      return { type: 'output', lines: listDirectory(result.node, context) };
    }
    case 'cat':
    case 'type': {
      if (!rawArgs) {
        return { type: 'output', lines: [`Usage: ${normalizedCommand} <file>`] };
      }

      const result = resolvePath(rawArgs, context);

      if (result.error) {
        return { type: 'output', lines: [result.error] };
      }

      if (result.node.type !== 'file') {
        return { type: 'output', lines: [`"${result.node.name}" is a folder.`] };
      }

      if (!isTextFileName(result.node.name)) {
        return { type: 'output', lines: [`"${result.node.name}" is not a text file.`] };
      }

      return { type: 'output', lines: (result.node.content || 'Empty file.').split('\n') };
    }
    case 'mkdir': {
      const target = resolveFolderAndName(rawArgs, context);

      if (target.error) {
        return { type: 'output', lines: [target.error] };
      }

      if (!target.name) {
        return { type: 'output', lines: ['Usage: mkdir [path] <name>'] };
      }

      const createdNode = context.createFolder?.(target.name, target.folderId);
      return { type: 'output', lines: [`Folder created: ${createdNode?.name ?? target.name}`] };
    }
    case 'touch': {
      const target = resolveFolderAndName(rawArgs, context);

      if (target.error) {
        return { type: 'output', lines: [target.error] };
      }

      if (!target.name) {
        return { type: 'output', lines: ['Usage: touch [path] <name>'] };
      }

      const fileName = getTerminalTextFileName(target.name);
      const createdNode = context.createFile?.(fileName, target.folderId);
      return { type: 'output', lines: [`File created: ${createdNode?.name ?? fileName}`] };
    }
    case 'rm':
    case 'del': {
      if (!rawArgs) {
        return { type: 'output', lines: [`Usage: ${normalizedCommand} <path>`] };
      }

      const result = resolvePath(rawArgs, context);

      if (result.error) {
        return { type: 'output', lines: [result.error] };
      }

      if (!canOperateOnNode(result.node, context)) {
        return { type: 'output', lines: [`Cannot delete "${result.node.name}".`] };
      }

      const movedNode = context.moveNodeToTrash?.(result.node.id);

      if (!movedNode) {
        return { type: 'output', lines: [`Could not move "${result.node.name}" to the Recycle Bin.`] };
      }

      return { type: 'output', lines: [`Moved to Recycle Bin: ${movedNode.name}`] };
    }
    case 'copy': {
      const parsedArgs = parseSourceAndTarget(rawArgs);

      if (parsedArgs.error) {
        return { type: 'output', lines: ['Usage: copy <source> <target-folder>'] };
      }

      const sourceResult = resolvePath(parsedArgs.sourcePath, context);
      const targetResult = resolveFolderPath(parsedArgs.targetPath, context);

      if (sourceResult.error) {
        return { type: 'output', lines: [sourceResult.error] };
      }

      if (targetResult.error) {
        return { type: 'output', lines: [targetResult.error] };
      }

      if (!canOperateOnNode(sourceResult.node, context)) {
        return { type: 'output', lines: [`Cannot copy "${sourceResult.node.name}".`] };
      }

      const copiedNode = context.copyNodeToFolder?.(sourceResult.node.id, targetResult.node.id);

      if (!copiedNode) {
        return { type: 'output', lines: [`Could not copy "${sourceResult.node.name}".`] };
      }

      return { type: 'output', lines: [`Copied to ${getTerminalPath(context.nodes, targetResult.node.id)}: ${copiedNode.name}`] };
    }
    case 'move': {
      const parsedArgs = parseSourceAndTarget(rawArgs);

      if (parsedArgs.error) {
        return { type: 'output', lines: ['Usage: move <source> <target-folder>'] };
      }

      const sourceResult = resolvePath(parsedArgs.sourcePath, context);
      const targetResult = resolveFolderPath(parsedArgs.targetPath, context);

      if (sourceResult.error) {
        return { type: 'output', lines: [sourceResult.error] };
      }

      if (targetResult.error) {
        return { type: 'output', lines: [targetResult.error] };
      }

      if (!canOperateOnNode(sourceResult.node, context)) {
        return { type: 'output', lines: [`Cannot move "${sourceResult.node.name}".`] };
      }

      if (
        sourceResult.node.type === 'folder' &&
        (sourceResult.node.id === targetResult.node.id ||
          getDescendantIds(context.nodes ?? [], sourceResult.node.id).includes(targetResult.node.id))
      ) {
        return { type: 'output', lines: ['Cannot move a folder inside itself.'] };
      }

      if (sourceResult.node.parentId === targetResult.node.id) {
        return { type: 'output', lines: [`"${sourceResult.node.name}" is already in that folder.`] };
      }

      const movedNode = context.moveNodeToFolder?.(sourceResult.node.id, targetResult.node.id);

      if (!movedNode) {
        return { type: 'output', lines: [`Could not move "${sourceResult.node.name}".`] };
      }

      return { type: 'output', lines: [`Moved to ${getTerminalPath(context.nodes, targetResult.node.id)}: ${movedNode.name}`] };
    }
    case 'open': {
      const target = appAliases[args.join('-').toLowerCase()] ?? appAliases[args[0]?.toLowerCase()];

      if (target) {
        context.openApp(target);
        return { type: 'output', lines: [`Opening ${target}...`] };
      }

      if (!rawArgs) {
        return { type: 'output', lines: ['Usage: open <app|path>'] };
      }

      const result = resolvePath(rawArgs, context);

      if (result.error) {
        return { type: 'output', lines: [result.error] };
      }

      if (result.node.type === 'folder') {
        context.openApp('explorer', { folderId: result.node.id });
        return { type: 'output', lines: [`Opening folder: ${result.node.name}`] };
      }

      if (isTextFileName(result.node.name)) {
        context.openApp('notepad', { fileId: result.node.id });
        return { type: 'output', lines: [`Opening file: ${result.node.name}`] };
      }

      if (isImageFileName(result.node.name)) {
        context.openApp('image-viewer', { fileId: result.node.id });
        return { type: 'output', lines: [`Opening image: ${result.node.name}`] };
      }

      return { type: 'output', lines: [`There is no associated app for "${result.node.name}".`] };
    }
    case 'theme': {
      const wallpaper = args[0]?.toLowerCase();

      if (!wallpapers.includes(wallpaper)) {
        return { type: 'output', lines: ['Usage: theme bliss|blue|silver'] };
      }

      context.setWallpaper(wallpaper);
      return { type: 'output', lines: [`Wallpaper changed to ${wallpaper}.`] };
    }
    default:
      return {
        type: 'output',
        lines: [`'${command}' is not recognized as an internal Roso OS command.`],
      };
  }
}
