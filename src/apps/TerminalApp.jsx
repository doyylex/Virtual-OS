import { useEffect, useRef, useState } from 'react';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { getTerminalCompletion, getTerminalPath, runTerminalCommand } from '../services/terminalCommands.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const initialHistory = [
  { type: 'system', lines: ['Roso OS Terminal [Version 0.4.0]', 'Type help to see commands.'] },
];

export function TerminalApp({ windowId }) {
  const [history, setHistory] = useState(initialHistory);
  const [commandHistory, setCommandHistory] = useState([]);
  const [commandHistoryCursor, setCommandHistoryCursor] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState('documents');
  const [input, setInput] = useState('');
  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);
  const nodes = useFileSystemStore((state) => state.nodes);
  const copyNodeToFolder = useFileSystemStore((state) => state.copyNodeToFolder);
  const createFile = useFileSystemStore((state) => state.createFile);
  const createFolder = useFileSystemStore((state) => state.createFolder);
  const moveNodeToFolder = useFileSystemStore((state) => state.moveNodeToFolder);
  const moveNodeToTrash = useFileSystemStore((state) => state.moveNodeToTrash);
  const closeWindow = useWindowStore((state) => state.closeWindow);
  const openApp = useWindowStore((state) => state.openApp);
  const setWindowTitle = useWindowStore((state) => state.setWindowTitle);
  const windowCount = useWindowStore((state) => state.windows.length);
  const setWallpaper = useUiStore((state) => state.setWallpaper);
  const isSoundEnabled = useUiStore((state) => state.isSoundEnabled);
  const playSound = useSystemSound();
  const promptPath = getTerminalPath(nodes, currentFolderId);
  const terminalWindowId = windowId ?? 'window-terminal';
  const terminalInputId = `${terminalWindowId}-input`;

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ block: 'end' });
  }, [history]);

  useEffect(() => {
    if (!windowId) {
      return;
    }

    setWindowTitle(windowId, `Terminal - ${promptPath}`);
  }, [promptPath, setWindowTitle, windowId]);

  const getCommandContext = () => ({
    currentFolderId,
    nodes,
    openApp,
    soundsEnabled: isSoundEnabled,
    setWallpaper,
    windowCount,
    createFolder: (name, folderId) => {
      const createdId = createFolder(folderId, name);
      return useFileSystemStore.getState().getNode(createdId);
    },
    createFile: (name, folderId) => {
      const createdId = createFile(folderId, name, '');
      return useFileSystemStore.getState().getNode(createdId);
    },
    copyNodeToFolder: (nodeId, folderId) => {
      const copiedId = copyNodeToFolder(nodeId, folderId);
      return useFileSystemStore.getState().getNode(copiedId);
    },
    moveNodeToFolder: (nodeId, folderId) => {
      const movedId = moveNodeToFolder(nodeId, folderId);
      return useFileSystemStore.getState().getNode(movedId);
    },
    moveNodeToTrash: (nodeId) => {
      const [movedId] = moveNodeToTrash(nodeId);
      return useFileSystemStore.getState().getNode(movedId);
    },
  });

  const executeCommand = (commandInput) => {
    const commandPrompt = promptPath;
    const trimmedCommand = commandInput.trim();

    if (!trimmedCommand) {
      setInput('');
      return;
    }

    const result = runTerminalCommand(commandInput, getCommandContext());

    if (result.type === 'exit') {
      closeWindow(terminalWindowId);
      return;
    }

    setCommandHistory((currentHistory) => {
      const nextHistory =
        currentHistory.at(-1) === trimmedCommand ? currentHistory : [...currentHistory, trimmedCommand];

      return nextHistory.slice(-60);
    });
    setCommandHistoryCursor(null);
    setInput('');
    playSound('click');

    if (result.nextFolderId) {
      setCurrentFolderId(result.nextFolderId);
    }

    if (result.type === 'clear') {
      setHistory(initialHistory);
      return;
    }

    setHistory((currentHistory) => [
      ...currentHistory,
      { type: 'command', lines: [`${commandPrompt}> ${commandInput}`] },
      { type: 'output', lines: result.lines },
    ]);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    executeCommand(input);
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      executeCommand(event.currentTarget.value);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      if (commandHistory.length === 0) {
        return;
      }

      const nextCursor =
        commandHistoryCursor === null
          ? commandHistory.length - 1
          : Math.max(0, commandHistoryCursor - 1);

      setCommandHistoryCursor(nextCursor);
      setInput(commandHistory[nextCursor]);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (commandHistoryCursor === null) {
        return;
      }

      if (commandHistoryCursor >= commandHistory.length - 1) {
        setCommandHistoryCursor(null);
        setInput('');
        return;
      }

      const nextCursor = commandHistoryCursor + 1;
      setCommandHistoryCursor(nextCursor);
      setInput(commandHistory[nextCursor]);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();

      const completion = getTerminalCompletion(input, getCommandContext());

      if (!completion) {
        return;
      }

      if (completion.value) {
        setInput(completion.value);
      }

      if (completion.lines?.length) {
        setHistory((currentHistory) => [
          ...currentHistory,
          { type: 'output', lines: completion.lines },
        ]);
      }
    }
  };

  return (
    <div className="ros-terminal-app" onClick={() => inputRef.current?.focus()}>
      <div className="ros-terminal-output" aria-label="Terminal output">
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
        <label htmlFor={terminalInputId}>{promptPath}&gt;</label>
        <input
          id={terminalInputId}
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
