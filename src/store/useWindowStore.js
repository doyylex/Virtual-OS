import { create } from 'zustand';
import { getAppById } from '../apps/appRegistry.js';

const DESKTOP_TASKBAR_OFFSET = 40;
const TITLEBAR_VISIBLE_WIDTH = 140;
const TITLEBAR_VISIBLE_HEIGHT = 32;
const WINDOW_MARGIN = 8;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDesktopBounds = () => ({
  width: window.innerWidth,
  height: window.innerHeight - DESKTOP_TASKBAR_OFFSET,
});

const constrainPosition = (position, size) => {
  const bounds = getDesktopBounds();

  return {
    x: clamp(position.x, WINDOW_MARGIN - size.width + TITLEBAR_VISIBLE_WIDTH, bounds.width - TITLEBAR_VISIBLE_WIDTH),
    y: clamp(position.y, 0, bounds.height - TITLEBAR_VISIBLE_HEIGHT),
  };
};

const bringToFront = (windowId, state, launchData) => {
  const nextZIndex = state.zCounter + 1;
  const shouldUpdateLaunchData = launchData !== undefined;
  const nextLaunchToken = shouldUpdateLaunchData ? state.launchCounter + 1 : state.launchCounter;

  return {
    zCounter: nextZIndex,
    launchCounter: nextLaunchToken,
    activeWindowId: windowId,
    windows: state.windows.map((windowItem) =>
      windowItem.id === windowId
        ? {
            ...windowItem,
            zIndex: nextZIndex,
            isMinimized: false,
            launchData: shouldUpdateLaunchData ? launchData : windowItem.launchData,
            launchToken: shouldUpdateLaunchData ? nextLaunchToken : windowItem.launchToken,
          }
        : windowItem,
    ),
  };
};

const getNextActiveWindowId = (windows) => {
  const visibleWindows = windows.filter((windowItem) => !windowItem.isMinimized);

  if (visibleWindows.length === 0) {
    return null;
  }

  return visibleWindows.reduce((topWindow, windowItem) =>
    windowItem.zIndex > topWindow.zIndex ? windowItem : topWindow,
  ).id;
};

export const useWindowStore = create((set) => ({
  windows: [],
  activeWindowId: null,
  zCounter: 20,
  launchCounter: 0,

  openApp: (appId, launchData) =>
    set((state) => {
      const app = getAppById(appId);

      if (!app) {
        return state;
      }

      const existingWindow = state.windows.find((windowItem) => windowItem.appId === appId);

      if (existingWindow) {
        return bringToFront(existingWindow.id, state, launchData);
      }

      const nextZIndex = state.zCounter + 1;
      const nextLaunchToken = state.launchCounter + 1;
      const size = { ...app.defaultSize };
      const position = constrainPosition(app.defaultPosition, size);
      const windowId = `window-${app.id}`;

      return {
        zCounter: nextZIndex,
        launchCounter: nextLaunchToken,
        activeWindowId: windowId,
        windows: [
          ...state.windows,
          {
            id: windowId,
            appId: app.id,
            title: app.title,
            position,
            size,
            previousPosition: null,
            previousSize: null,
            zIndex: nextZIndex,
            isMinimized: false,
            isMaximized: false,
            launchData: launchData ?? null,
            launchToken: nextLaunchToken,
          },
        ],
      };
    }),

  closeWindow: (windowId) =>
    set((state) => {
      const nextWindows = state.windows.filter((windowItem) => windowItem.id !== windowId);

      return {
        windows: nextWindows,
        activeWindowId: getNextActiveWindowId(nextWindows),
      };
    }),

  focusWindow: (windowId) =>
    set((state) => {
      const targetWindow = state.windows.find((windowItem) => windowItem.id === windowId);

      if (!targetWindow || state.activeWindowId === windowId) {
        return state;
      }

      return bringToFront(windowId, state);
    }),

  minimizeWindow: (windowId) =>
    set((state) => {
      const nextWindows = state.windows.map((windowItem) =>
        windowItem.id === windowId ? { ...windowItem, isMinimized: true } : windowItem,
      );

      return {
        windows: nextWindows,
        activeWindowId: state.activeWindowId === windowId ? getNextActiveWindowId(nextWindows) : state.activeWindowId,
      };
    }),

  maximizeWindow: (windowId) =>
    set((state) => {
      const nextZIndex = state.zCounter + 1;
      const bounds = getDesktopBounds();

      return {
        zCounter: nextZIndex,
        activeWindowId: windowId,
        windows: state.windows.map((windowItem) =>
          windowItem.id === windowId
            ? {
                ...windowItem,
                previousPosition: windowItem.isMaximized ? windowItem.previousPosition : windowItem.position,
                previousSize: windowItem.isMaximized ? windowItem.previousSize : windowItem.size,
                position: { x: 0, y: 0 },
                size: { width: bounds.width, height: bounds.height },
                zIndex: nextZIndex,
                isMinimized: false,
                isMaximized: true,
              }
            : windowItem,
        ),
      };
    }),

  restoreWindow: (windowId) =>
    set((state) => {
      const nextZIndex = state.zCounter + 1;

      return {
        zCounter: nextZIndex,
        activeWindowId: windowId,
        windows: state.windows.map((windowItem) => {
          if (windowItem.id !== windowId) {
            return windowItem;
          }

          const restoredSize = windowItem.previousSize ?? windowItem.size;
          const restoredPosition = constrainPosition(windowItem.previousPosition ?? windowItem.position, restoredSize);

          return {
            ...windowItem,
            position: restoredPosition,
            size: restoredSize,
            previousPosition: null,
            previousSize: null,
            zIndex: nextZIndex,
            isMinimized: false,
            isMaximized: false,
          };
        }),
      };
    }),

  moveWindow: (windowId, position) =>
    set((state) => ({
      windows: state.windows.map((windowItem) =>
        windowItem.id === windowId && !windowItem.isMaximized
          ? { ...windowItem, position: constrainPosition(position, windowItem.size) }
          : windowItem,
      ),
    })),
}));
