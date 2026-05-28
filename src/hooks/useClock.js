import { useEffect, useState } from 'react';

const formatTime = (date) =>
  new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

export function useClock() {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTime(formatTime(new Date()));
    }, 1000 * 30);

    return () => window.clearInterval(intervalId);
  }, []);

  return time;
}
