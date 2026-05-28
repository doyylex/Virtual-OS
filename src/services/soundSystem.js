let audioContext;

const sounds = {
  start: { frequency: 523, secondFrequency: 784, duration: 0.12, type: 'triangle' },
  open: { frequency: 660, secondFrequency: 880, duration: 0.09, type: 'sine' },
  close: { frequency: 392, secondFrequency: 262, duration: 0.1, type: 'triangle' },
  minimize: { frequency: 494, secondFrequency: 330, duration: 0.08, type: 'square' },
  restore: { frequency: 392, secondFrequency: 659, duration: 0.09, type: 'triangle' },
  click: { frequency: 880, secondFrequency: 988, duration: 0.04, type: 'sine' },
};

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
};

const playTone = (context, { frequency, secondFrequency, duration, type }) => {
  const startTime = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(secondFrequency, startTime + duration);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.045, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);
};

export function playSystemSound(soundName, isEnabled) {
  if (!isEnabled || !sounds[soundName]) {
    return;
  }

  try {
    const context = getAudioContext();
    context.resume();
    playTone(context, sounds[soundName]);
  } catch {
    // Browsers may block audio until a user gesture; Roso OS should continue silently.
  }
}
