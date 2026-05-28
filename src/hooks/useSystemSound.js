import { useCallback } from 'react';
import { playSystemSound } from '../services/soundSystem.js';
import { useUiStore } from '../store/useUiStore.js';

export function useSystemSound() {
  const isSoundEnabled = useUiStore((state) => state.isSoundEnabled);

  return useCallback(
    (soundName) => {
      playSystemSound(soundName, isSoundEnabled);
    },
    [isSoundEnabled],
  );
}
