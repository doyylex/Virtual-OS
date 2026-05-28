import { create } from 'zustand';

export const useUiStore = create((set) => ({
  isStartMenuOpen: false,
  isAllProgramsOpen: false,
  wallpaper: 'bliss',
  isSoundEnabled: true,
  toggleStartMenu: () =>
    set((state) => ({
      isStartMenuOpen: !state.isStartMenuOpen,
      isAllProgramsOpen: state.isStartMenuOpen ? false : state.isAllProgramsOpen,
    })),
  closeStartMenu: () => set({ isStartMenuOpen: false, isAllProgramsOpen: false }),
  toggleAllPrograms: () => set((state) => ({ isAllProgramsOpen: !state.isAllProgramsOpen })),
  setWallpaper: (wallpaper) => set({ wallpaper }),
  toggleSoundEnabled: () => set((state) => ({ isSoundEnabled: !state.isSoundEnabled })),
}));
