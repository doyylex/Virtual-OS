import { create } from 'zustand';
import { soundPackNames } from '../services/soundSystem.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const availableSoundPacks = new Set(soundPackNames);

export const useUiStore = create((set) => ({
  isStartMenuOpen: false,
  isAllProgramsOpen: false,
  wallpaper: 'bliss',
  isSoundEnabled: true,
  soundVolume: 0.55,
  soundPack: 'xp',
  toggleStartMenu: () =>
    set((state) => ({
      isStartMenuOpen: !state.isStartMenuOpen,
      isAllProgramsOpen: state.isStartMenuOpen ? false : state.isAllProgramsOpen,
    })),
  closeStartMenu: () => set({ isStartMenuOpen: false, isAllProgramsOpen: false }),
  toggleAllPrograms: () => set((state) => ({ isAllProgramsOpen: !state.isAllProgramsOpen })),
  setWallpaper: (wallpaper) => set({ wallpaper }),
  toggleSoundEnabled: () => set((state) => ({ isSoundEnabled: !state.isSoundEnabled })),
  setSoundVolume: (soundVolume) =>
    set({ soundVolume: clamp(Number(soundVolume) || 0, 0, 1) }),
  setSoundPack: (soundPack) =>
    set((state) => ({
      soundPack: availableSoundPacks.has(soundPack) ? soundPack : state.soundPack,
    })),
}));
