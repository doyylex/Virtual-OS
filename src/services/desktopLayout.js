const TASKBAR_HEIGHT = 40;
const GRID_ORIGIN_X = 18;
const GRID_ORIGIN_Y = 16;
const GRID_CELL_WIDTH = 86;
const GRID_CELL_HEIGHT = 86;
const ICON_WIDTH = 78;
const ICON_HEIGHT = 74;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getDesktopBounds = () => ({
  width: window.innerWidth,
  height: window.innerHeight - TASKBAR_HEIGHT,
});

export const getDesktopGridPosition = (index) => {
  const bounds = getDesktopBounds();
  const rowsPerColumn = Math.max(1, Math.floor((bounds.height - GRID_ORIGIN_Y) / GRID_CELL_HEIGHT));
  const column = Math.floor(index / rowsPerColumn);
  const row = index % rowsPerColumn;

  return {
    x: GRID_ORIGIN_X + column * GRID_CELL_WIDTH,
    y: GRID_ORIGIN_Y + row * GRID_CELL_HEIGHT,
  };
};

export const snapDesktopPosition = (position) => {
  const bounds = getDesktopBounds();
  const maxColumn = Math.max(0, Math.floor((bounds.width - GRID_ORIGIN_X - ICON_WIDTH) / GRID_CELL_WIDTH));
  const maxRow = Math.max(0, Math.floor((bounds.height - GRID_ORIGIN_Y - ICON_HEIGHT) / GRID_CELL_HEIGHT));
  const column = clamp(Math.round((position.x - GRID_ORIGIN_X) / GRID_CELL_WIDTH), 0, maxColumn);
  const row = clamp(Math.round((position.y - GRID_ORIGIN_Y) / GRID_CELL_HEIGHT), 0, maxRow);

  return {
    x: GRID_ORIGIN_X + column * GRID_CELL_WIDTH,
    y: GRID_ORIGIN_Y + row * GRID_CELL_HEIGHT,
  };
};

export const arrangeIconPositions = (iconIds) =>
  iconIds.reduce((positions, iconId, index) => {
    positions[iconId] = getDesktopGridPosition(index);
    return positions;
  }, {});

const getPositionKey = (position) => `${position.x}:${position.y}`;

const getFirstFreePosition = (occupiedSlots) => {
  for (let index = 0; index < occupiedSlots.size + 64; index += 1) {
    const position = getDesktopGridPosition(index);

    if (!occupiedSlots.has(getPositionKey(position))) {
      return position;
    }
  }

  return getDesktopGridPosition(occupiedSlots.size);
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

export const findNextDesktopPosition = (iconIds, iconPositions) => {
  const occupiedSlots = new Set(
    iconIds
      .map((iconId) => iconPositions[iconId])
      .filter(Boolean)
      .map(getPositionKey),
  );

  return getFirstFreePosition(occupiedSlots);
};
