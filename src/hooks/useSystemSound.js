import { useCallback } from 'react';
import { playSystemSound } from '../services/soundSystem.js';
import { useUiStore } from '../store/useUiStore.js';

export function useSystemSound() {
  const isSoundEnabled = useUiStore((state) => state.isSoundEnabled);
  const soundVolume = useUiStore((state) => state.soundVolume);
  const soundPack = useUiStore((state) => state.soundPack);

  return useCallback(
    (soundName, overrides = {}) => {
      playSystemSound(soundName, {
        isEnabled: isSoundEnabled,
        pack: soundPack,
        volume: soundVolume,
        ...overrides,
      });
    },
    [isSoundEnabled, soundPack, soundVolume],
  );
}
