import { create } from 'zustand';
import { getAppById } from '../apps/appRegistry.js';

const DESKTOP_TASKBAR_OFFSET = 40;
const TITLEBAR_VISIBLE_WIDTH = 140;
const TITLEBAR_VISIBLE_HEIGHT = 32;
const WINDOW_MARGIN = 8;
const WINDOW_CASCADE_OFFSET = 26;
const WINDOW_CASCADE_STEPS = 8;
const TRANSITION_IDLE = 'idle';
const TRANSITION_MINIMIZING = 'minimizing';
const TRANSITION_RESTORING = 'restoring';
const beforeCloseHandlers = new Map();

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

const constrainResizeGeometry = (position, size, minSize) => {
  const bounds = getDesktopBounds();
  const minimumSize = {
    width: minSize?.width ?? 320,
    height: minSize?.height ?? 220,
  };
  const nextPosition = {
    x: clamp(position.x, 0, Math.max(0, bounds.width - minimumSize.width)),
    y: clamp(position.y, 0, Math.max(0, bounds.height - minimumSize.height)),
  };

  return {
    position: nextPosition,
    size: {
      width: clamp(size.width, minimumSize.width, bounds.width - nextPosition.x),
      height: clamp(size.height, minimumSize.height, bounds.height - nextPosition.y),
    },
  };
};

const getInitialWindowPosition = (app, size, state) => {
  if (!app.multiInstance) {
    return constrainPosition(app.defaultPosition, size);
  }

  const sameAppWindowCount = state.windows.filter((windowItem) => windowItem.appId === app.id).length;
  const cascadeStep = sameAppWindowCount % WINDOW_CASCADE_STEPS;

  return constrainPosition(
    {
      x: app.defaultPosition.x + cascadeStep * WINDOW_CASCADE_OFFSET,
      y: app.defaultPosition.y + cascadeStep * WINDOW_CASCADE_OFFSET,
    },
    size,
  );
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
            transitionState:
              windowItem.isMinimized || windowItem.transitionState === TRANSITION_MINIMIZING
                ? TRANSITION_RESTORING
                : TRANSITION_IDLE,
            launchData: shouldUpdateLaunchData ? launchData : windowItem.launchData,
            launchToken: shouldUpdateLaunchData ? nextLaunchToken : windowItem.launchToken,
          }
        : windowItem,
    ),
  };
};

const getNextActiveWindowId = (windows) => {
  const visibleWindows = windows.filter(
    (windowItem) => !windowItem.isMinimized && windowItem.transitionState !== TRANSITION_MINIMIZING,
  );

  if (visibleWindows.length === 0) {
    return null;
  }

  return visibleWindows.reduce((topWindow, windowItem) =>
    windowItem.zIndex > topWindow.zIndex ? windowItem : topWindow,
  ).id;
};

const minimizeWindowInState = (windowId, state) => {
  const targetWindow = state.windows.find((windowItem) => windowItem.id === windowId);

  if (!targetWindow || targetWindow.isMinimized || targetWindow.transitionState === TRANSITION_MINIMIZING) {
    return state;
  }

  const nextWindows = state.windows.map((windowItem) =>
    windowItem.id === windowId
      ? { ...windowItem, isMinimized: false, transitionState: TRANSITION_MINIMIZING }
      : windowItem,
  );

  return {
    windows: nextWindows,
    activeWindowId: state.activeWindowId === windowId ? getNextActiveWindowId(nextWindows) : state.activeWindowId,
  };
};

const restoreWindowInState = (windowId, state) => {
  const targetWindow = state.windows.find((windowItem) => windowItem.id === windowId);

  if (!targetWindow) {
    return state;
  }

  const nextZIndex = state.zCounter + 1;

  return {
    zCounter: nextZIndex,
    activeWindowId: windowId,
    windows: state.windows.map((windowItem) => {
      if (windowItem.id !== windowId) {
        return windowItem;
      }

      if (windowItem.isMinimized || windowItem.transitionState === TRANSITION_MINIMIZING) {
        return {
          ...windowItem,
          zIndex: nextZIndex,
          isMinimized: false,
          transitionState: TRANSITION_RESTORING,
        };
      }

      if (windowItem.isMaximized) {
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
          transitionState: TRANSITION_IDLE,
        };
      }

      return {
        ...windowItem,
        zIndex: nextZIndex,
        isMinimized: false,
        transitionState: TRANSITION_IDLE,
      };
    }),
  };
};

export const useWindowStore = create((set) => ({
  windows: [],
  activeWindowId: null,
  zCounter: 20,
  launchCounter: 0,
  instanceCounter: 0,

  openApp: (appId, launchData) =>
    set((state) => {
      const app = getAppById(appId);

      if (!app) {
        return state;
      }

      const existingWindow = app.multiInstance
        ? null
        : state.windows.find((windowItem) => windowItem.appId === appId);

      if (existingWindow) {
        return bringToFront(existingWindow.id, state, launchData);
      }

      const nextZIndex = state.zCounter + 1;
      const nextLaunchToken = state.launchCounter + 1;
      const nextInstanceCounter = state.instanceCounter + 1;
      const size = { ...app.defaultSize };
      const position = getInitialWindowPosition(app, size, state);
      const windowId = app.multiInstance ? `window-${app.id}-${nextInstanceCounter}` : `window-${app.id}`;

      return {
        zCounter: nextZIndex,
        launchCounter: nextLaunchToken,
        instanceCounter: app.multiInstance ? nextInstanceCounter : state.instanceCounter,
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
            transitionState: TRANSITION_RESTORING,
            launchData: launchData ?? null,
            launchToken: nextLaunchToken,
          },
        ],
      };
    }),

  closeWindow: async (windowId) => {
    const beforeClose = beforeCloseHandlers.get(windowId);

    if (beforeClose) {
      try {
        const canClose = await beforeClose();

        if (!canClose) {
          return false;
        }
      } catch {
        return false;
      }
    }

    beforeCloseHandlers.delete(windowId);
    set((state) => {
      const nextWindows = state.windows.filter((windowItem) => windowItem.id !== windowId);

      return {
        windows: nextWindows,
        activeWindowId: getNextActiveWindowId(nextWindows),
      };
    });

    return true;
  },

  registerBeforeClose: (windowId, handler) => {
    beforeCloseHandlers.set(windowId, handler);

    return () => {
      if (beforeCloseHandlers.get(windowId) === handler) {
        beforeCloseHandlers.delete(windowId);
      }
    };
  },

  setWindowTitle: (windowId, title) =>
    set((state) => {
      const targetWindow = state.windows.find((windowItem) => windowItem.id === windowId);

      if (!targetWindow || targetWindow.title === title) {
        return state;
      }

      return {
        windows: state.windows.map((windowItem) =>
          windowItem.id === windowId ? { ...windowItem, title } : windowItem,
        ),
      };
    }),

  focusWindow: (windowId) =>
    set((state) => {
      const targetWindow = state.windows.find((windowItem) => windowItem.id === windowId);

      if (
        !targetWindow ||
        (state.activeWindowId === windowId &&
          !targetWindow.isMinimized &&
          targetWindow.transitionState !== TRANSITION_MINIMIZING)
      ) {
        return state;
      }

      return bringToFront(windowId, state);
    }),

  minimizeWindow: (windowId) => set((state) => minimizeWindowInState(windowId, state)),

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
                transitionState: TRANSITION_IDLE,
              }
            : windowItem,
        ),
      };
    }),

  restoreWindow: (windowId) => set((state) => restoreWindowInState(windowId, state)),

  toggleTaskbarWindow: (windowId) =>
    set((state) => {
      const targetWindow = state.windows.find((windowItem) => windowItem.id === windowId);

      if (!targetWindow) {
        return state;
      }

      if (targetWindow.isMinimized || targetWindow.transitionState === TRANSITION_MINIMIZING) {
        return restoreWindowInState(windowId, state);
      }

      if (state.activeWindowId === windowId) {
        return minimizeWindowInState(windowId, state);
      }

      return bringToFront(windowId, state);
    }),

  finishWindowTransition: (windowId, transitionState) =>
    set((state) => {
      let didMinimizeActiveWindow = false;
      const nextWindows = state.windows.map((windowItem) => {
        if (windowItem.id !== windowId || windowItem.transitionState !== transitionState) {
          return windowItem;
        }

        if (transitionState === TRANSITION_MINIMIZING) {
          didMinimizeActiveWindow = state.activeWindowId === windowId;
          return {
            ...windowItem,
            isMinimized: true,
            transitionState: TRANSITION_IDLE,
          };
        }

        return {
          ...windowItem,
          transitionState: TRANSITION_IDLE,
        };
      });

      return {
        windows: nextWindows,
        activeWindowId: didMinimizeActiveWindow ? getNextActiveWindowId(nextWindows) : state.activeWindowId,
      };
    }),

  moveWindow: (windowId, position) =>
    set((state) => ({
      windows: state.windows.map((windowItem) =>
        windowItem.id === windowId && !windowItem.isMaximized
          ? { ...windowItem, position: constrainPosition(position, windowItem.size), transitionState: TRANSITION_IDLE }
          : windowItem,
      ),
    })),

  resizeWindow: (windowId, geometry) =>
    set((state) => ({
      windows: state.windows.map((windowItem) => {
        if (windowItem.id !== windowId || windowItem.isMaximized) {
          return windowItem;
        }

        const app = getAppById(windowItem.appId);
        const nextGeometry = constrainResizeGeometry(
          geometry.position ?? windowItem.position,
          geometry.size ?? windowItem.size,
          app?.minSize,
        );

        return {
          ...windowItem,
          position: nextGeometry.position,
          size: nextGeometry.size,
          transitionState: TRANSITION_IDLE,
        };
      }),
    })),
}));
