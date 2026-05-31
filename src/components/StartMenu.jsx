import { useState } from 'react';
import { appRegistry } from '../apps/appRegistry.js';
import { useSystemSound } from '../hooks/useSystemSound.js';
import { getNodeIconTone, isImageFileName, isTextFileName } from '../services/fileIcons.js';
import { getNodeSearchRank, nodeMatchesSearchQuery, normalizeSearchText } from '../services/search.js';
import { getPathLabel, isPathInsideTrash } from '../services/trashPaths.js';
import { useFileSystemStore } from '../store/useFileSystemStore.js';
import { useUiStore } from '../store/useUiStore.js';
import { useWindowStore } from '../store/useWindowStore.js';

const systemLinks = [
  { label: 'My Documents', iconTone: 'folder', appId: 'explorer', launchData: { folderId: 'documents' } },
  { label: 'My Computer', iconTone: 'computer', appId: 'computer' },
  { label: 'Notepad', iconTone: 'notepad', appId: 'notepad' },
  { label: 'Terminal', iconTone: 'terminal', appId: 'terminal' },
  { label: 'Calculator', iconTone: 'calculator', appId: 'calculator' },
  { label: 'Control Panel', iconTone: 'settings', appId: 'settings' },
  { label: 'Search', iconTone: 'search', appId: 'explorer', launchData: { folderId: 'root', searchMode: true } },
];

const matchesSearch = (query, ...values) =>
  values.some((value) => normalizeSearchText(value).includes(query));

export function StartMenu() {
  const isStartMenuOpen = useUiStore((state) => state.isStartMenuOpen);

  if (!isStartMenuOpen) {
    return null;
  }

  return <StartMenuContent />;
}

function StartMenuContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const isAllProgramsOpen = useUiStore((state) => state.isAllProgramsOpen);
  const closeStartMenu = useUiStore((state) => state.closeStartMenu);
  const toggleAllPrograms = useUiStore((state) => state.toggleAllPrograms);
  const nodes = useFileSystemStore((state) => state.nodes);
  const getPath = useFileSystemStore((state) => state.getPath);
  const openApp = useWindowStore((state) => state.openApp);
  const playSound = useSystemSound();
  const normalizedSearchQuery = normalizeSearchText(searchQuery);
  const searchableApps = appRegistry.filter((app) => !app.hidden);
  const pinnedApps = searchableApps.filter((app) => app.quickLaunch);
  const filteredApps = normalizedSearchQuery
    ? searchableApps.filter((app) => matchesSearch(normalizedSearchQuery, app.title, app.description, app.id))
    : pinnedApps;
  const filteredAppIds = new Set(filteredApps.map((app) => app.id));
  const filteredSystemLinks = normalizedSearchQuery
    ? systemLinks.filter((link) => matchesSearch(normalizedSearchQuery, link.label) && (!link.appId || !filteredAppIds.has(link.appId)))
    : systemLinks;
  const matchingFileNodeResults = normalizedSearchQuery
    ? nodes
        .map((node) => {
          const path = getPath(node.id);
          const parentPathLabel = getPathLabel(getPath(node.parentId), 'C:');

          return { node, parentPathLabel, path };
        })
        .filter(({ node, parentPathLabel, path }) => {
          if (node.id === 'root' || isPathInsideTrash(path)) {
            return false;
          }

          return nodeMatchesSearchQuery(node, normalizedSearchQuery, [parentPathLabel]);
        })
        .sort((firstResult, secondResult) => {
          const rankDifference =
            getNodeSearchRank(firstResult.node, normalizedSearchQuery) -
            getNodeSearchRank(secondResult.node, normalizedSearchQuery);

          if (rankDifference !== 0) {
            return rankDifference;
          }

          if (firstResult.node.type !== secondResult.node.type) {
            return firstResult.node.type === 'folder' ? -1 : 1;
          }

          return firstResult.node.name.localeCompare(secondResult.node.name, 'en');
        })
    : [];
  const filteredFileNodeResults = matchingFileNodeResults.slice(0, 5);
  const exactFileNodeMatch = normalizedSearchQuery
    ? matchingFileNodeResults.find((result) => getNodeSearchRank(result.node, normalizedSearchQuery) === 0)?.node
    : null;
  const hasSearchResults = filteredApps.length > 0 || filteredSystemLinks.length > 0 || filteredFileNodeResults.length > 0;

  const handleSearchChange = (value) => {
    if (!normalizedSearchQuery && normalizeSearchText(value)) {
      playSound('search');
    }

    setSearchQuery(value);
  };

  const handleOpenApp = (appId, launchData, soundName = 'open') => {
    openApp(appId, launchData);
    setSearchQuery('');
    closeStartMenu();
    playSound(soundName);
  };

  const handleOpenFileNode = (node) => {
    if (node.type === 'folder') {
      handleOpenApp('explorer', { folderId: node.id });
      return;
    }

    if (node.type === 'file' && isTextFileName(node.name)) {
      handleOpenApp('notepad', { fileId: node.id });
      return;
    }

    if (node.type === 'file' && isImageFileName(node.name)) {
      handleOpenApp('image-viewer', { fileId: node.id });
      return;
    }

    handleOpenApp('explorer', { folderId: node.parentId ?? 'root', searchQuery: node.name });
  };

  const handleSearchSubmit = (event) => {
    if (event.key !== 'Enter' || !normalizedSearchQuery) {
      return;
    }

    event.preventDefault();

    if (exactFileNodeMatch) {
      handleOpenFileNode(exactFileNodeMatch);
      return;
    }

    if (matchingFileNodeResults.length === 1 && filteredApps.length === 0 && filteredSystemLinks.length === 0) {
      handleOpenFileNode(matchingFileNodeResults[0].node);
      return;
    }

    if (filteredApps.length === 1 && filteredSystemLinks.length === 0 && matchingFileNodeResults.length === 0) {
      handleOpenApp(filteredApps[0].id);
      return;
    }

    handleOpenApp('explorer', { folderId: 'root', searchQuery: searchQuery.trim() }, 'search');
  };

  return (
    <nav className="ros-start-menu" aria-label="Start menu">
      <header className="ros-start-menu-header">
        <div className="ros-user-picture" aria-hidden="true">R</div>
        <div>
          <p className="ros-user-name">Roso</p>
          <p className="ros-user-status">Local session</p>
        </div>
      </header>

      <div className="ros-start-menu-body">
        <section className="ros-start-menu-column" aria-label="Pinned Programs">
          <label className="ros-start-search">
            <span>Search</span>
            <input
              value={searchQuery}
              placeholder="Apps, files..."
              autoComplete="off"
              spellCheck="false"
              onChange={(event) => handleSearchChange(event.target.value)}
              onKeyDown={handleSearchSubmit}
            />
          </label>
          <p className="ros-menu-section-title">{normalizedSearchQuery ? 'Results' : 'Pinned Programs'}</p>
          {filteredApps.map((app) => (
            <button
              className="ros-menu-item"
              key={app.id}
              type="button"
              onClick={() => handleOpenApp(app.id)}
            >
              <span className="ros-menu-item-icon" data-kind={app.iconTone} aria-hidden="true" />
              <span>
                <strong>{app.title}</strong>
                <small>{app.description}</small>
              </span>
            </button>
          ))}
          {filteredFileNodeResults.length > 0 ? (
            <>
              <p className="ros-menu-section-title">Files and folders</p>
              {filteredFileNodeResults.map(({ node, parentPathLabel }) => (
                <button
                  className="ros-menu-item"
                  key={node.id}
                  type="button"
                  onClick={() => handleOpenFileNode(node)}
                >
                  <span className="ros-menu-item-icon" data-kind={getNodeIconTone(node)} aria-hidden="true" />
                  <span>
                    <strong>{node.name}</strong>
                    <small>{parentPathLabel}</small>
                  </span>
                </button>
              ))}
            </>
          ) : null}
          {normalizedSearchQuery && !hasSearchResults ? (
            <p className="ros-menu-empty">No results.</p>
          ) : null}
          {normalizedSearchQuery ? (
            <button
              className="ros-all-programs-button"
              type="button"
              onClick={() => handleOpenApp('explorer', { folderId: 'root', searchQuery: searchQuery.trim() }, 'search')}
            >
              Search files
              <span aria-hidden="true">&gt;</span>
            </button>
          ) : (
            <button
              className="ros-all-programs-button"
              type="button"
              aria-expanded={isAllProgramsOpen}
              onClick={() => {
                toggleAllPrograms();
                playSound('click');
              }}
            >
              All Programs
              <span aria-hidden="true">&gt;</span>
            </button>
          )}
          {isAllProgramsOpen && !normalizedSearchQuery ? (
            <div className="ros-programs-panel" aria-label="All Programs">
              {searchableApps.map((app) => (
                <button className="ros-menu-item ros-menu-item-compact" key={app.id} type="button" onClick={() => handleOpenApp(app.id)}>
                  <span className="ros-menu-item-icon" data-kind={app.iconTone} aria-hidden="true" />
                  {app.title}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="ros-start-menu-column ros-start-menu-column-alt" aria-label="System Shortcuts">
          {filteredSystemLinks.map((link) => (
            <button
              className="ros-menu-item ros-menu-item-secondary"
              key={link.label}
              type="button"
              onClick={() => {
                if (link.appId) {
                  handleOpenApp(link.appId, link.launchData, link.iconTone === 'search' ? 'search' : 'open');
                }
              }}
            >
              <span className="ros-menu-item-icon" data-kind={link.iconTone} aria-hidden="true" />
              {link.label}
            </button>
          ))}
        </section>
      </div>
    </nav>
  );
}
