const shortDateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatShortDateTime = (timestamp, fallback = 'Fecha no disponible') => {
  const time = Number(timestamp);

  if (!Number.isFinite(time) || time <= 0) {
    return fallback;
  }

  const date = new Date(time);

  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return shortDateTimeFormatter.format(date);
};
