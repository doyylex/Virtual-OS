import { useEffect, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { runTerminalCommand } from '../services/terminalCommands.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const initialHistory = [
  { type: 'system', lines: ['Roso OS Terminal [Version 0.4.0]', 'Escribe help para ver comandos.'] },
];

export function TerminalApp() {
  const [history, setHistory] = useState(initialHistory);
  const [input, setInput] = useState('');
  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);
  const nodes = useFileSystemStore((state) => state.nodes);
  const createFile = useFileSystemStore((state) => state.createFile);
  const createFolder = useFileSystemStore((state) => state.createFolder);
  const getChildren = useFileSystemStore((state) => state.getChildren);
  const openApp = useWindowStore((state) => state.openApp);
  const setWallpaper = useUiStore((state) => state.setWallpaper);
  const playSound = useSystemSound();

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ block: 'end' });
  }, [history]);

  const executeCommand = (commandInput) => {
    const result = runTerminalCommand(commandInput, {
      openApp,
      setWallpaper,
      listFiles: (folderId = 'documents') => {
        const children = getChildren(folderId);

        if (children.length === 0) {
          return ['No hay archivos.'];
        }

        return children.map((node) => `${node.type === 'folder' ? '<DIR>' : '     '}  ${node.name}`);
      },
      createFolder: (name, folderId = 'documents') => createFolder(folderId, name),
      createFile: (name, folderId = 'documents') => createFile(folderId, name, ''),
      findFile: (name, folderId = 'documents') =>
        nodes.find((node) => node.parentId === folderId && node.type === 'file' && node.name.toLowerCase() === name.toLowerCase()),
    });
    setInput('');
    playSound('click');

    if (result.type === 'clear') {
      setHistory([]);
      return;
    }

    setHistory((currentHistory) => [
      ...currentHistory,
      { type: 'command', lines: [`C:\\Roso> ${commandInput}`] },
      { type: 'output', lines: result.lines },
    ]);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    executeCommand(input);
  };

  const handleInputKeyDown = (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    executeCommand(event.currentTarget.value);
  };

  return (
    <div className="ros-terminal-app" onClick={() => inputRef.current?.focus()}>
      <div className="ros-terminal-output" aria-label="Salida de Terminal">
        {history.map((entry, entryIndex) => (
          <div className={`ros-terminal-entry ros-terminal-entry-${entry.type}`} key={`${entry.type}-${entryIndex}`}>
            {entry.lines.map((line, lineIndex) => (
              <div key={`${line}-${lineIndex}`}>{line || '\u00A0'}</div>
            ))}
          </div>
        ))}
        <div ref={terminalEndRef} />
      </div>

      <form className="ros-terminal-prompt" onSubmit={handleSubmit}>
        <label htmlFor="ros-terminal-input">C:\Roso&gt;</label>
        <input
          id="ros-terminal-input"
          ref={inputRef}
          value={input}
          autoComplete="off"
          spellCheck="false"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleInputKeyDown}
        />
      </form>
    </div>
  );
}
