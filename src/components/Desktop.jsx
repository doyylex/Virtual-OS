import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDesktopApps } from '../apps/appRegistry.js';
import { findNextDesktopPosition, getDesktopGridPosition, snapDesktopPosition } from '../services/desktopLayout.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { useDesktopLayoutStore } from '../store/useDesktopLayoutStore.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';
import { DesktopContextMenu } from './DesktopContextMenu.jsx';
import { DesktopIcon } from './DesktopIcon.jsx';
import { WindowManager } from './WindowManager.jsx';

const CONTEXT_MENU_WIDTH = 214;
const CONTEXT_MENU_ITEM_HEIGHT = 28;
const TASKBAR_HEIGHT = 40;

const desktopAppIcons = getDesktopApps().map((app) => ({
  id: `app:${app.id}`,
  label: app.title,
  tone: app.iconTone,
  appId: app.id,
  kind: 'app',
  description: app.description,
}));

const staticDesktopIcons = [
  { id: 'static:documents', label: 'Mis documentos', tone: 'folder', folderId: 'documents', kind: 'folder-shortcut' },
  { id: 'static:portfolio', label: 'Portfolio', tone: 'screen', kind: 'static' },
  { id: 'static:recycle-bin', label: 'Papelera', tone: 'bin', folderId: 'recycle-bin-folder', kind: 'recycle-bin' },
];

const sortDesktopNodes = (nodes) =>
  [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }

    return a.name.localeCompare(b.name, 'es');
  });

const getMenuPosition = (event, itemCount) => ({
  x: Math.max(4, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 8)),
  y: Math.max(4, Math.min(event.clientY, window.innerHeight - TASKBAR_HEIGHT - itemCount * CONTEXT_MENU_ITEM_HEIGHT - 10)),
});

export function Desktop() {
  const [contextMenu, setContextMenu] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [dragPreview, setDragPreview] = useState(null);
  const [draggingIconId, setDraggingIconId] = useState(null);
  const [editingIconId, setEditingIconId] = useState(null);
  const [selectedIconId, setSelectedIconId] = useState(null);
  const nodes = useFileSystemStore((state) => state.nodes);
  const closeStartMenu = useUiStore((state) => state.closeStartMenu);
  const wallpaper = useUiStore((state) => state.wallpaper);
  const createDesktopFolder = useFileSystemStore((state) => state.createDesktopFolder);
  const createDesktopTextFile = useFileSystemStore((state) => state.createDesktopTextFile);
  const emptyTrash = useFileSystemStore((state) => state.emptyTrash);
  const moveNodeToTrash = useFileSystemStore((state) => state.moveNodeToTrash);
  const renameNode = useFileSystemStore((state) => state.renameNode);
  const iconPositions = useDesktopLayoutStore((state) => state.iconPositions);
  const ensureIconPositions = useDesktopLayoutStore((state) => state.ensureIconPositions);
  const isDesktopLayoutReady = useDesktopLayoutStore((state) => state.isReady);
  const resetIconPositions = useDesktopLayoutStore((state) => state.resetIconPositions);
  const setIconPosition = useDesktopLayoutStore((state) => state.setIconPosition);
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();

  const desktopFileIcons = useMemo(
    () =>
      sortDesktopNodes(nodes.filter((node) => node.parentId === 'desktop-folder')).map((node) => ({
        id: `fs:${node.id}`,
        label: node.name,
        tone: node.type === 'folder' ? 'folder' : 'notepad',
        kind: node.type,
        node,
      })),
    [nodes],
  );
  const desktopIcons = useMemo(
    () => [...desktopAppIcons, ...desktopFileIcons, ...staticDesktopIcons],
    [desktopFileIcons],
  );
  const selectedIcon = desktopIcons.find((icon) => icon.id === selectedIconId) ?? null;
  const contextTargetIcon = desktopIcons.find((icon) => icon.id === contextMenu?.iconId) ?? null;

  useEffect(() => {
    if (!isDesktopLayoutReady) {
      return;
    }

    ensureIconPositions(desktopIcons.map((icon) => icon.id));
  }, [desktopIcons, ensureIconPositions, iconPositions, isDesktopLayoutReady]);

  const getDisplayedIconPosition = (iconId, index) => {
    if (dragPreview?.id === iconId) {
      return dragPreview.position;
    }

    return iconPositions[iconId] ?? getDesktopGridPosition(index);
  };

  const getDisplayedIconPositions = () =>
    desktopIcons.reduce((positions, icon, index) => {
      positions[icon.id] = getDisplayedIconPosition(icon.id, index);
      return positions;
    }, {});

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const openDesktopIcon = (icon) => {
    closeContextMenu();
    closeStartMenu();

    if (icon.appId) {
      openApp(icon.appId);
      playSound('open');
      return;
    }

    if (icon.folderId) {
      openApp('explorer', { folderId: icon.folderId });
      playSound('open');
      return;
    }

    if (icon.node?.type === 'folder') {
      openApp('explorer', { folderId: icon.node.id });
      playSound('open');
      return;
    }

    if (icon.node?.type === 'file' && icon.node.name.toLowerCase().endsWith('.txt')) {
      openApp('notepad', { fileId: icon.node.id });
      playSound('open');
    }
  };

  const openProperties = (icon) => {
    closeContextMenu();
    closeStartMenu();

    if (!icon) {
      openApp('properties', { nodeId: 'desktop-folder' });
      playSound('open');
      return;
    }

    if (icon.node) {
      openApp('properties', { nodeId: icon.node.id });
      playSound('open');
      return;
    }

    if (icon.folderId) {
      openApp('properties', { nodeId: icon.folderId });
      playSound('open');
      return;
    }

    openApp('properties', {
      shortcut: {
        name: icon.label,
        description: icon.description ?? 'Elemento del escritorio',
        kind: icon.kind,
      },
    });
    playSound('open');
  };

  const beginRename = useCallback((icon) => {
    if (!icon?.node) {
      return;
    }

    closeContextMenu();
    setSelectedIconId(icon.id);
    setEditingIconId(icon.id);
    setDraftName(icon.label);
    playSound('click');
  }, [closeContextMenu, playSound]);

  const cancelRename = useCallback(() => {
    setEditingIconId(null);
    setDraftName('');
  }, []);

  const commitRename = () => {
    const icon = desktopIcons.find((desktopIcon) => desktopIcon.id === editingIconId);

    if (icon?.node && draftName.trim()) {
      renameNode(icon.node.id, draftName);
      playSound('click');
    }

    cancelRename();
  };

  const placeCreatedIcon = (nodeId) => {
    if (!nodeId) {
      return;
    }

    const createdIconId = `fs:${nodeId}`;
    const existingIconPositions = getDisplayedIconPositions();
    const nextPosition = findNextDesktopPosition(desktopIcons.map((icon) => icon.id), existingIconPositions);
    const createdNode = useFileSystemStore.getState().getNode(nodeId);

    setIconPosition(createdIconId, nextPosition);
    setSelectedIconId(createdIconId);
    setEditingIconId(createdIconId);
    setDraftName(createdNode?.name ?? '');
  };

  const handleCreateFolder = () => {
    closeContextMenu();
    placeCreatedIcon(createDesktopFolder());
    playSound('open');
  };

  const handleCreateTextFile = () => {
    closeContextMenu();
    placeCreatedIcon(createDesktopTextFile());
    playSound('open');
  };

  const handleMoveToTrash = useCallback((icon) => {
    if (!icon?.node) {
      return;
    }

    closeContextMenu();
    moveNodeToTrash(icon.node.id);
    setSelectedIconId(null);
    playSound('close');
  }, [closeContextMenu, moveNodeToTrash, playSound]);

  const handleEmptyTrash = () => {
    closeContextMenu();
    emptyTrash();
    playSound('close');
  };

  const handleArrangeByName = () => {
    closeContextMenu();
    resetIconPositions(
      [...desktopIcons]
        .sort((firstIcon, secondIcon) => firstIcon.label.localeCompare(secondIcon.label, 'es'))
        .map((icon) => icon.id),
    );
    playSound('click');
  };

  const handleRefresh = useCallback(() => {
    closeContextMenu();
    playSound('click');
  }, [closeContextMenu, playSound]);

  const getContextMenuItems = () => {
    const wrap = (callback) => () => callback();

    if (contextMenu?.type === 'desktop') {
      return [
        { id: 'new-folder', label: 'Nueva carpeta', onSelect: wrap(handleCreateFolder) },
        { id: 'new-text-file', label: 'Nuevo documento de texto', onSelect: wrap(handleCreateTextFile) },
        { id: 'separator-create', type: 'separator' },
        { id: 'sort-name', label: 'Ordenar por nombre', onSelect: wrap(handleArrangeByName) },
        { id: 'refresh', label: 'Actualizar', hint: 'F5', onSelect: wrap(handleRefresh) },
        { id: 'separator-properties', type: 'separator' },
        { id: 'desktop-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(null)) },
      ];
    }

    if (contextTargetIcon?.kind === 'recycle-bin') {
      return [
        { id: 'open-recycle', label: 'Abrir', onSelect: wrap(() => openDesktopIcon(contextTargetIcon)) },
        { id: 'empty-recycle', label: 'Vaciar Papelera', onSelect: wrap(handleEmptyTrash) },
        { id: 'separator-recycle', type: 'separator' },
        { id: 'recycle-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(contextTargetIcon)) },
      ];
    }

    if (contextTargetIcon?.node) {
      return [
        { id: 'open-node', label: 'Abrir', onSelect: wrap(() => openDesktopIcon(contextTargetIcon)) },
        { id: 'rename-node', label: 'Renombrar', hint: 'F2', onSelect: wrap(() => beginRename(contextTargetIcon)) },
        { id: 'delete-node', label: 'Eliminar', hint: 'Del', onSelect: wrap(() => handleMoveToTrash(contextTargetIcon)) },
        { id: 'separator-node', type: 'separator' },
        { id: 'node-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(contextTargetIcon)) },
      ];
    }

    if (contextTargetIcon) {
      return [
        { id: 'open-shortcut', label: 'Abrir', onSelect: wrap(() => openDesktopIcon(contextTargetIcon)) },
        { id: 'separator-shortcut', type: 'separator' },
        { id: 'shortcut-properties', label: 'Propiedades', onSelect: wrap(() => openProperties(contextTargetIcon)) },
      ];
    }

    return [];
  };

  const handleDesktopClick = () => {
    setSelectedIconId(null);
    closeContextMenu();
    closeStartMenu();
  };

  const handleDesktopContextMenu = (event) => {
    event.preventDefault();
    closeStartMenu();
    setSelectedIconId(null);
    setContextMenu({
      type: 'desktop',
      position: getMenuPosition(event, 7),
    });
  };

  const handleIconContextMenu = (event, icon) => {
    event.preventDefault();
    event.stopPropagation();
    closeStartMenu();
    setSelectedIconId(icon.id);
    setContextMenu({
      type: 'icon',
      iconId: icon.id,
      position: getMenuPosition(event, icon.node ? 5 : 4),
    });
  };

  const handleIconPointerDown = (event, icon, iconPosition) => {
    if (event.button !== 0 || editingIconId === icon.id) {
      return;
    }

    event.stopPropagation();
    closeContextMenu();
    closeStartMenu();
    setSelectedIconId(icon.id);

    const element = event.currentTarget;
    const pointerId = event.pointerId;
    const startClientPosition = { x: event.clientX, y: event.clientY };
    let didMove = false;
    let latestPosition = iconPosition;

    element.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent) => {
      const delta = {
        x: moveEvent.clientX - startClientPosition.x,
        y: moveEvent.clientY - startClientPosition.y,
      };

      if (!didMove && Math.hypot(delta.x, delta.y) < 4) {
        return;
      }

      didMove = true;
      latestPosition = {
        x: iconPosition.x + delta.x,
        y: iconPosition.y + delta.y,
      };
      setDraggingIconId(icon.id);
      setDragPreview({ id: icon.id, position: latestPosition });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }

      if (didMove) {
        setIconPosition(icon.id, snapDesktopPosition(latestPosition));
        playSound('click');
      }

      setDraggingIconId(null);
      setDragPreview(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (editingIconId) {
          event.preventDefault();
          cancelRename();
          return;
        }

        if (contextMenu) {
          event.preventDefault();
          closeContextMenu();
        }
      }

      if (event.key === 'F2' && selectedIcon?.node) {
        event.preventDefault();
        beginRename(selectedIcon);
      }

      if (event.key === 'Delete' && selectedIcon?.node) {
        event.preventDefault();
        handleMoveToTrash(selectedIcon);
      }

      if (event.key === 'F5') {
        event.preventDefault();
        handleRefresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [beginRename, cancelRename, closeContextMenu, contextMenu, editingIconId, handleMoveToTrash, handleRefresh, selectedIcon]);

  return (
    <main
      className="ros-desktop"
      data-wallpaper={wallpaper}
      aria-label="Escritorio de Roso OS"
      onClick={handleDesktopClick}
      onContextMenu={handleDesktopContextMenu}
    >
      <div className="ros-wallpaper" aria-hidden="true" />
      <div className="ros-desktop-icons" aria-label="Iconos del escritorio">
        {desktopIcons.map((icon, index) => {
          const iconPosition = getDisplayedIconPosition(icon.id, index);

          return (
            <DesktopIcon
              draftName={draftName}
              isDragging={draggingIconId === icon.id}
              isEditing={editingIconId === icon.id}
              isSelected={selectedIconId === icon.id}
              key={icon.id}
              label={icon.label}
              position={iconPosition}
              tone={icon.tone}
              onContextMenu={(event) => handleIconContextMenu(event, icon)}
              onFocus={() => {
                if (!editingIconId) {
                  setSelectedIconId(icon.id);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'F2' && icon.node) {
                  event.preventDefault();
                  beginRename(icon);
                }

                if (event.key === 'Delete' && icon.node) {
                  event.preventDefault();
                  handleMoveToTrash(icon);
                }
              }}
              onOpen={(event) => {
                event.stopPropagation();
                openDesktopIcon(icon);
              }}
              onPointerDown={(event) => handleIconPointerDown(event, icon, iconPosition)}
              onRenameBlur={commitRename}
              onRenameChange={setDraftName}
              onRenameKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              onSelect={(event) => {
                event.stopPropagation();
                closeContextMenu();
                closeStartMenu();
                setSelectedIconId(icon.id);
              }}
            />
          );
        })}
      </div>
      {contextMenu ? <DesktopContextMenu items={getContextMenuItems()} position={contextMenu.position} /> : null}
      <WindowManager />
    </main>
  );
}
