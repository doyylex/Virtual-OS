import { useClock } from '../hooks/useClock.js';

export function Clock() {
  const time = useClock();

  return <time className="ros-clock">{time}</time>;
}
