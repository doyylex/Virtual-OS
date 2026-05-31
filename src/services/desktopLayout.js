const TASKBAR_HEIGHT = 40;
const GRID_ORIGIN_X = 18;
const GRID_ORIGIN_Y = 16;
const GRID_CELL_WIDTH = 86;
const GRID_CELL_HEIGHT = 86;
const ICON_WIDTH = 78;
const ICON_HEIGHT = 74;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const getDesktopBounds = () => ({
  width: typeof window === 'undefined' ? 1024 : window.innerWidth,
  height: typeof window === 'undefined' ? 728 : Math.max(0, window.innerHeight - TASKBAR_HEIGHT),
});

const getVisibleGridLimits = (bounds) => ({
  maxColumn: Math.max(0, Math.floor((bounds.width - GRID_ORIGIN_X - ICON_WIDTH) / GRID_CELL_WIDTH)),
  maxRow: Math.max(0, Math.floor((bounds.height - GRID_ORIGIN_Y - ICON_HEIGHT) / GRID_CELL_HEIGHT)),
});

export const getDesktopGridPosition = (index, bounds = getDesktopBounds()) => {
  const rowsPerColumn = Math.max(1, Math.floor((bounds.height - GRID_ORIGIN_Y) / GRID_CELL_HEIGHT));
  const column = Math.floor(index / rowsPerColumn);
  const row = index % rowsPerColumn;

  return {
    x: GRID_ORIGIN_X + column * GRID_CELL_WIDTH,
    y: GRID_ORIGIN_Y + row * GRID_CELL_HEIGHT,
  };
};

export const snapDesktopPosition = (position, bounds = getDesktopBounds()) => {
  const { maxColumn, maxRow } = getVisibleGridLimits(bounds);
  const column = clamp(Math.round((position.x - GRID_ORIGIN_X) / GRID_CELL_WIDTH), 0, maxColumn);
  const row = clamp(Math.round((position.y - GRID_ORIGIN_Y) / GRID_CELL_HEIGHT), 0, maxRow);

  return {
    x: GRID_ORIGIN_X + column * GRID_CELL_WIDTH,
    y: GRID_ORIGIN_Y + row * GRID_CELL_HEIGHT,
  };
};

export const arrangeIconPositions = (iconIds, bounds = getDesktopBounds()) =>
  iconIds.reduce((positions, iconId, index) => {
    positions[iconId] = getDesktopGridPosition(index, bounds);
    return positions;
  }, {});

const getPositionKey = (position) => `${position.x}:${position.y}`;

const getFirstFreePosition = (occupiedSlots, bounds = getDesktopBounds()) => {
  for (let index = 0; index < occupiedSlots.size + 64; index += 1) {
    const position = getDesktopGridPosition(index, bounds);

    if (!occupiedSlots.has(getPositionKey(position))) {
      return position;
    }
  }

  return getDesktopGridPosition(occupiedSlots.size, bounds);
};

export const isIconPositionVisible = (position, bounds = getDesktopBounds()) =>
  Boolean(position) &&
  Number.isFinite(position.x) &&
  Number.isFinite(position.y) &&
  position.x >= 0 &&
  position.y >= 0 &&
  position.x <= Math.max(0, bounds.width - ICON_WIDTH) &&
  position.y <= Math.max(0, bounds.height - ICON_HEIGHT);

const getFirstFreeVisiblePosition = (occupiedSlots, bounds) => {
  const { maxColumn, maxRow } = getVisibleGridLimits(bounds);
  const rows = maxRow + 1;
  const columns = maxColumn + 1;
  const totalVisibleSlots = rows * columns;

  for (let index = 0; index < totalVisibleSlots; index += 1) {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const position = {
      x: GRID_ORIGIN_X + column * GRID_CELL_WIDTH,
      y: GRID_ORIGIN_Y + row * GRID_CELL_HEIGHT,
    };
    const positionKey = getPositionKey(position);

    if (!occupiedSlots.has(positionKey) && isIconPositionVisible(position, bounds)) {
      return position;
    }
  }

  return getDesktopGridPosition(occupiedSlots.size, bounds);
};

export const normalizeIconPositions = (iconIds, iconPositions) => {
  const occupiedSlots = new Set();
  let didChange = false;
  const positions = {};

  iconIds.forEach((iconId) => {
    const storedPosition = iconPositions[iconId];
    const storedPositionKey = storedPosition ? getPositionKey(storedPosition) : null;

    if (storedPosition && !occupiedSlots.has(storedPositionKey)) {
      positions[iconId] = storedPosition;
      occupiedSlots.add(storedPositionKey);
      return;
    }

    const nextPosition = getFirstFreePosition(occupiedSlots);
    positions[iconId] = nextPosition;
    occupiedSlots.add(getPositionKey(nextPosition));
    didChange = true;
  });

  if (Object.keys(iconPositions).some((iconId) => !iconIds.includes(iconId))) {
    didChange = true;
  }

  return { didChange, positions };
};

export const findNextDesktopPosition = (iconIds, iconPositions, bounds = getDesktopBounds()) => {
  const occupiedSlots = new Set(
    iconIds
      .map((iconId) => iconPositions[iconId])
      .filter(Boolean)
      .map(getPositionKey),
  );

  return getFirstFreeVisiblePosition(occupiedSlots, bounds);
};

export const getResponsiveIconPositions = (iconIds, iconPositions, bounds = getDesktopBounds()) => {
  const occupiedSlots = new Set();
  const positions = {};

  iconIds.forEach((iconId) => {
    const storedPosition = iconPositions[iconId];
    const storedPositionKey = storedPosition ? getPositionKey(storedPosition) : null;

    if (
      storedPosition &&
      isIconPositionVisible(storedPosition, bounds) &&
      !occupiedSlots.has(storedPositionKey)
    ) {
      positions[iconId] = storedPosition;
      occupiedSlots.add(storedPositionKey);
      return;
    }

    const responsivePosition = getFirstFreeVisiblePosition(occupiedSlots, bounds);

    positions[iconId] = responsivePosition;
    occupiedSlots.add(getPositionKey(responsivePosition));
  });

  return positions;
};
