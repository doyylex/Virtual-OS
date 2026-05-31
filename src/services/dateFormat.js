const shortDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatShortDateTime = (timestamp, fallback = 'Date unavailable') => {
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
