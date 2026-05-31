let audioContext;

const DEFAULT_PACK = 'xp';
const DEFAULT_VOLUME = 0.55;
const MASTER_GAIN = 0.08;
const MIN_GAIN = 0.0001;
const lastPlayedAtBySound = new Map();

const soundCooldownMs = {
  click: 35,
  navigation: 120,
  search: 220,
  open: 70,
  close: 70,
  minimize: 70,
  restore: 70,
  rename: 120,
  save: 180,
  success: 180,
  error: 220,
  trash: 160,
  delete: 220,
  restoreFile: 160,
};

const tone = ({
  frequency,
  secondFrequency = frequency,
  duration = 0.08,
  type = 'sine',
  at = 0,
  volume = 1,
}) => ({
  frequency,
  secondFrequency,
  duration,
  type,
  at,
  volume,
});

const soundPacks = {
  xp: {
    start: [
      tone({ frequency: 523, secondFrequency: 784, duration: 0.12, type: 'triangle' }),
      tone({ frequency: 784, secondFrequency: 988, duration: 0.09, type: 'sine', at: 0.08, volume: 0.65 }),
    ],
    startup: [
      tone({ frequency: 392, secondFrequency: 523, duration: 0.15, type: 'triangle', volume: 0.75 }),
      tone({ frequency: 659, secondFrequency: 784, duration: 0.16, type: 'sine', at: 0.11 }),
      tone({ frequency: 988, secondFrequency: 1175, duration: 0.2, type: 'triangle', at: 0.22, volume: 0.8 }),
    ],
    shutdown: [
      tone({ frequency: 784, secondFrequency: 523, duration: 0.16, type: 'triangle' }),
      tone({ frequency: 523, secondFrequency: 330, duration: 0.18, type: 'sine', at: 0.13, volume: 0.75 }),
    ],
    open: [tone({ frequency: 660, secondFrequency: 880, duration: 0.09, type: 'sine', volume: 0.85 })],
    close: [tone({ frequency: 392, secondFrequency: 262, duration: 0.1, type: 'triangle', volume: 0.72 })],
    minimize: [tone({ frequency: 494, secondFrequency: 330, duration: 0.08, type: 'square', volume: 0.42 })],
    restore: [tone({ frequency: 392, secondFrequency: 659, duration: 0.09, type: 'triangle', volume: 0.78 })],
    click: [tone({ frequency: 880, secondFrequency: 988, duration: 0.035, type: 'sine', volume: 0.36 })],
    error: [
      tone({ frequency: 220, secondFrequency: 185, duration: 0.1, type: 'square', volume: 0.62 }),
      tone({ frequency: 185, secondFrequency: 147, duration: 0.12, type: 'square', at: 0.09, volume: 0.52 }),
    ],
    success: [
      tone({ frequency: 523, secondFrequency: 659, duration: 0.08, type: 'triangle', volume: 0.58 }),
      tone({ frequency: 659, secondFrequency: 880, duration: 0.12, type: 'sine', at: 0.07, volume: 0.62 }),
    ],
    save: [tone({ frequency: 740, secondFrequency: 988, duration: 0.1, type: 'triangle', volume: 0.58 })],
    rename: [tone({ frequency: 622, secondFrequency: 740, duration: 0.07, type: 'sine', volume: 0.45 })],
    trash: [tone({ frequency: 330, secondFrequency: 220, duration: 0.12, type: 'triangle', volume: 0.56 })],
    delete: [tone({ frequency: 196, secondFrequency: 130, duration: 0.14, type: 'square', volume: 0.46 })],
    restoreFile: [tone({ frequency: 440, secondFrequency: 698, duration: 0.12, type: 'triangle', volume: 0.56 })],
    navigation: [tone({ frequency: 587, secondFrequency: 784, duration: 0.045, type: 'sine', volume: 0.28 })],
    search: [tone({ frequency: 988, secondFrequency: 1175, duration: 0.04, type: 'sine', volume: 0.24 })],
  },
  soft: {
    start: [tone({ frequency: 440, secondFrequency: 659, duration: 0.12, type: 'sine', volume: 0.55 })],
    startup: [
      tone({ frequency: 349, secondFrequency: 440, duration: 0.16, type: 'sine', volume: 0.5 }),
      tone({ frequency: 523, secondFrequency: 659, duration: 0.18, type: 'sine', at: 0.12, volume: 0.55 }),
    ],
    shutdown: [tone({ frequency: 659, secondFrequency: 392, duration: 0.2, type: 'sine', volume: 0.5 })],
    open: [tone({ frequency: 523, secondFrequency: 698, duration: 0.09, type: 'sine', volume: 0.38 })],
    close: [tone({ frequency: 440, secondFrequency: 330, duration: 0.1, type: 'sine', volume: 0.34 })],
    minimize: [tone({ frequency: 392, secondFrequency: 294, duration: 0.08, type: 'sine', volume: 0.28 })],
    restore: [tone({ frequency: 392, secondFrequency: 587, duration: 0.09, type: 'sine', volume: 0.38 })],
    click: [tone({ frequency: 784, secondFrequency: 880, duration: 0.035, type: 'sine', volume: 0.18 })],
    error: [tone({ frequency: 247, secondFrequency: 196, duration: 0.13, type: 'triangle', volume: 0.5 })],
    success: [tone({ frequency: 523, secondFrequency: 784, duration: 0.14, type: 'sine', volume: 0.48 })],
    save: [tone({ frequency: 659, secondFrequency: 784, duration: 0.11, type: 'sine', volume: 0.42 })],
    rename: [tone({ frequency: 523, secondFrequency: 587, duration: 0.08, type: 'sine', volume: 0.28 })],
    trash: [tone({ frequency: 294, secondFrequency: 220, duration: 0.13, type: 'triangle', volume: 0.38 })],
    delete: [tone({ frequency: 220, secondFrequency: 165, duration: 0.14, type: 'triangle', volume: 0.38 })],
    restoreFile: [tone({ frequency: 440, secondFrequency: 659, duration: 0.13, type: 'sine', volume: 0.42 })],
    navigation: [tone({ frequency: 523, secondFrequency: 659, duration: 0.045, type: 'sine', volume: 0.22 })],
    search: [tone({ frequency: 659, secondFrequency: 880, duration: 0.04, type: 'sine', volume: 0.16 })],
  },
  terminal: {
    start: [tone({ frequency: 880, secondFrequency: 1175, duration: 0.06, type: 'square', volume: 0.4 })],
    startup: [
      tone({ frequency: 523, secondFrequency: 523, duration: 0.05, type: 'square', volume: 0.38 }),
      tone({ frequency: 659, secondFrequency: 659, duration: 0.05, type: 'square', at: 0.08, volume: 0.34 }),
      tone({ frequency: 784, secondFrequency: 784, duration: 0.07, type: 'square', at: 0.16, volume: 0.32 }),
    ],
    shutdown: [tone({ frequency: 392, secondFrequency: 196, duration: 0.14, type: 'square', volume: 0.3 })],
    open: [tone({ frequency: 988, secondFrequency: 988, duration: 0.045, type: 'square', volume: 0.26 })],
    close: [tone({ frequency: 330, secondFrequency: 330, duration: 0.06, type: 'square', volume: 0.24 })],
    minimize: [tone({ frequency: 440, secondFrequency: 220, duration: 0.055, type: 'square', volume: 0.2 })],
    restore: [tone({ frequency: 220, secondFrequency: 440, duration: 0.055, type: 'square', volume: 0.22 })],
    click: [tone({ frequency: 1175, secondFrequency: 1175, duration: 0.025, type: 'square', volume: 0.13 })],
    error: [
      tone({ frequency: 147, secondFrequency: 147, duration: 0.06, type: 'square', volume: 0.35 }),
      tone({ frequency: 147, secondFrequency: 147, duration: 0.06, type: 'square', at: 0.09, volume: 0.3 }),
    ],
    success: [
      tone({ frequency: 659, secondFrequency: 659, duration: 0.045, type: 'square', volume: 0.25 }),
      tone({ frequency: 880, secondFrequency: 880, duration: 0.055, type: 'square', at: 0.06, volume: 0.25 }),
    ],
    save: [tone({ frequency: 784, secondFrequency: 784, duration: 0.055, type: 'square', volume: 0.26 })],
    rename: [tone({ frequency: 587, secondFrequency: 587, duration: 0.04, type: 'square', volume: 0.2 })],
    trash: [tone({ frequency: 247, secondFrequency: 196, duration: 0.08, type: 'square', volume: 0.28 })],
    delete: [tone({ frequency: 165, secondFrequency: 130, duration: 0.1, type: 'square', volume: 0.25 })],
    restoreFile: [tone({ frequency: 523, secondFrequency: 784, duration: 0.08, type: 'square', volume: 0.26 })],
    navigation: [tone({ frequency: 1047, secondFrequency: 1047, duration: 0.025, type: 'square', volume: 0.14 })],
    search: [tone({ frequency: 1319, secondFrequency: 1319, duration: 0.025, type: 'square', volume: 0.1 })],
  },
};

export const soundPackNames = Object.keys(soundPacks);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getAudioContext = () => {
  if (!audioContext) {
    const AudioContextConstructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextConstructor) {
      return null;
    }

    audioContext = new AudioContextConstructor();
  }

  return audioContext;
};

const getSoundSequence = (pack, soundName) => {
  return soundPacks[pack]?.[soundName] || soundPacks[DEFAULT_PACK][soundName];
};

const getTimestamp = () => globalThis.performance?.now?.() ?? Date.now();

const canPlaySound = (soundName, timestamp, force = false) => {
  if (force) {
    lastPlayedAtBySound.set(soundName, timestamp);
    return true;
  }

  const cooldown = soundCooldownMs[soundName] ?? 0;
  const lastPlayedAt = lastPlayedAtBySound.get(soundName) ?? -Infinity;

  if (timestamp - lastPlayedAt < cooldown) {
    return false;
  }

  lastPlayedAtBySound.set(soundName, timestamp);
  return true;
};

const playTone = (context, config, startTime, masterVolume) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const peakGain = clamp(masterVolume * config.volume * MASTER_GAIN, MIN_GAIN, MASTER_GAIN);
  const endTime = startTime + config.duration;

  oscillator.type = config.type;
  oscillator.frequency.setValueAtTime(config.frequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(config.secondFrequency, endTime);

  gain.gain.setValueAtTime(MIN_GAIN, startTime);
  gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(MIN_GAIN, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect();
    gain.disconnect();
  });
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.02);
};

export function playSystemSound(soundName, options = true) {
  const normalizedOptions =
    typeof options === 'boolean'
      ? { isEnabled: options }
      : {
          isEnabled: options?.isEnabled ?? true,
          pack: options?.pack,
          force: options?.force,
          volume: options?.volume,
        };

  const sequence = getSoundSequence(normalizedOptions.pack || DEFAULT_PACK, soundName);
  const volume = clamp(Number(normalizedOptions.volume ?? DEFAULT_VOLUME) || 0, 0, 1);

  if (!normalizedOptions.isEnabled || !sequence || volume <= 0) {
    return;
  }

  try {
    const timestamp = getTimestamp();

    if (!canPlaySound(soundName, timestamp, normalizedOptions.force)) {
      return;
    }

    const context = getAudioContext();
    if (!context) {
      return;
    }

    void context.resume().catch(() => {});
    const baseTime = context.currentTime;
    sequence.forEach((config) => {
      playTone(context, config, baseTime + config.at, volume);
    });
  } catch {
    // Browsers may block audio until a user gesture; Roso OS should continue silently.
  }
}
