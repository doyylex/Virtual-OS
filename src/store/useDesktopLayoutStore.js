import { create } from 'zustand';
import { arrangeIconPositions, normalizeIconPositions } from '../services/desktopLayout.js';
import { loadDesktopLayout, saveDesktopLayout } from '../services/fileSystemDb.js';

const persistLayout = (positions) => {
  saveDesktopLayout(positions).catch(() => {});
};

export const useDesktopLayoutStore = create((set, get) => ({
  iconPositions: {},
  isReady: false,

  initializeDesktopLayout: async () => {
    if (get().isReady) {
      return;
    }

    try {
      const iconPositions = await loadDesktopLayout();
      set({ iconPositions, isReady: true });
    } catch {
      set({ iconPositions: {}, isReady: true });
    }
  },

  setIconPosition: (iconId, position) =>
    set((state) => {
      const iconPositions = {
        ...state.iconPositions,
        [iconId]: position,
      };

      persistLayout(iconPositions);
      return { iconPositions };
    }),

  ensureIconPositions: (orderedIconIds) =>
    set((state) => {
      const { didChange, positions } = normalizeIconPositions(orderedIconIds, state.iconPositions);

      if (!didChange) {
        return state;
      }

      persistLayout(positions);
      return { iconPositions: positions };
    }),

  resetIconPositions: (orderedIconIds) =>
    set(() => {
      const iconPositions = arrangeIconPositions(orderedIconIds);

      persistLayout(iconPositions);
      return { iconPositions };
    }),
}));
