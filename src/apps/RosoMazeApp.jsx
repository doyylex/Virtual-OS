import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowStore } from '../store/useWindowStore.js';

const hudRowCount = 2;
const playerSpeed = 4.4;
const enemySpeed = 2.35;
const frightenedEnemySpeed = 1.75;
const enemyEatenScore = 200;
const powerDurationMs = 7800;
const startingLives = 3;
const collisionRadius = 0.32;
const collisionDistance = 0.56;
const dotCollectTolerance = 0.42;
const enemyTurnSnapTolerance = 0.02;
const maxFrameDeltaMs = 42;
const turnSnapTolerance = 0.28;
const getCellKey = (position) => `${position.x}:${position.y}`;

const movementByKey = {
  arrowup: { angle: -Math.PI / 2, name: 'up', x: 0, y: -1 },
  w: { angle: -Math.PI / 2, name: 'up', x: 0, y: -1 },
  arrowdown: { angle: Math.PI / 2, name: 'down', x: 0, y: 1 },
  s: { angle: Math.PI / 2, name: 'down', x: 0, y: 1 },
  arrowleft: { angle: Math.PI, name: 'left', x: -1, y: 0 },
  a: { angle: Math.PI, name: 'left', x: -1, y: 0 },
  arrowright: { angle: 0, name: 'right', x: 1, y: 0 },
  d: { angle: 0, name: 'right', x: 1, y: 0 },
};

const mazeDirections = [
  movementByKey.arrowup,
  movementByKey.arrowright,
  movementByKey.arrowdown,
  movementByKey.arrowleft,
];

const levels = [
  {
    mazeRows: [
      '###################',
      '#........#........#',
      '#.###.##.#.##.###.#',
      '#.................#',
      '#.##.#.#####.#.##.#',
      '#....#...#...#....#',
      '####.###.#.###.####',
      '#                 #',
      '####.###.#.###.####',
      '#....#...#...#....#',
      '#.##.#.#####.#.##.#',
      '#.................#',
      '#.###.##.#.##.###.#',
      '#........#........#',
      '###################',
    ],
    playerStart: { x: 9, y: 7 },
    enemyStarts: [
      { id: 'red', name: 'Rojo', color: '#ff0000', eyeColor: '#3d0000', strategy: 'chase', direction: movementByKey.arrowleft, x: 17, y: 7 },
      { id: 'rose', name: 'Rosi', color: '#ff5fa8', eyeColor: '#2d001f', strategy: 'chase', direction: movementByKey.arrowright, x: 9, y: 3 },
      { id: 'cyan', name: 'Ciro', color: '#00e9ff', eyeColor: '#002d37', strategy: 'ambush', direction: movementByKey.arrowleft, x: 9, y: 11 },
      { id: 'amber', name: 'Ambar', color: '#ffb000', eyeColor: '#362000', strategy: 'patrol', direction: movementByKey.arrowup, x: 1, y: 7 },
    ]
  },
  {
    mazeRows: [
      '###################',
      '#.................#',
      '#.#####.###.#####.#',
      '#.#   #.....#   #.#',
      '#.# ###.###.### #.#',
      '#.#.....#.#.....#.#',
      '#.#.###.#.#.###.#.#',
      '#...#   . .   #...#',
      '#.#.###.###.###.#.#',
      '#.#.....#.#.....#.#',
      '#.#.###.#.#.###.#.#',
      '#.#...#.....#...#.#',
      '#.###.#######.###.#',
      '#.................#',
      '###################',
    ],
    playerStart: { x: 9, y: 7 },
    enemyStarts: [
      { id: 'red', name: 'Rojo', color: '#ff0000', eyeColor: '#3d0000', strategy: 'chase', direction: movementByKey.arrowleft, x: 17, y: 7 },
      { id: 'rose', name: 'Rosi', color: '#ff5fa8', eyeColor: '#2d001f', strategy: 'chase', direction: movementByKey.arrowright, x: 9, y: 3 },
      { id: 'cyan', name: 'Ciro', color: '#00e9ff', eyeColor: '#002d37', strategy: 'ambush', direction: movementByKey.arrowleft, x: 9, y: 11 },
      { id: 'amber', name: 'Ambar', color: '#ffb000', eyeColor: '#362000', strategy: 'patrol', direction: movementByKey.arrowup, x: 1, y: 7 },
    ]
  },
  {
    mazeRows: [
      '###################',
      '#.................#',
      '#.###.###.###.###.#',
      '#.#.#.#.#.#.#.#.#.#',
      '#.#.#.#.#.#.#.#.#.#',
      '#.................#',
      '#.###.###.###.###.#',
      '#.................#',
      '#.###.###.###.###.#',
      '#.................#',
      '#.#.#.#.#.#.#.#.#.#',
      '#.#.#.#.#.#.#.#.#.#',
      '#.###.###.###.###.#',
      '#.................#',
      '###################',
    ],
    playerStart: { x: 9, y: 7 },
    enemyStarts: [
      { id: 'red', name: 'Rojo', color: '#ff0000', eyeColor: '#3d0000', strategy: 'chase', direction: movementByKey.arrowleft, x: 17, y: 7 },
      { id: 'rose', name: 'Rosi', color: '#ff5fa8', eyeColor: '#2d001f', strategy: 'chase', direction: movementByKey.arrowright, x: 9, y: 3 },
      { id: 'cyan', name: 'Ciro', color: '#00e9ff', eyeColor: '#002d37', strategy: 'ambush', direction: movementByKey.arrowleft, x: 9, y: 11 },
      { id: 'amber', name: 'Ambar', color: '#ffb000', eyeColor: '#362000', strategy: 'patrol', direction: movementByKey.arrowup, x: 1, y: 7 },
    ]
  }
];

let activeMazeRows = [];
let activeMazeColumns = 0;
let activeMazeRowCount = 0;
let activeDotKeySet = new Set();
let activePowerPelletKeys = new Set();

const loadLevelConfig = (levelIndex) => {
  const config = levels[levelIndex % levels.length];
  activeMazeRows = config.mazeRows;
  activeMazeColumns = activeMazeRows[0].length;
  activeMazeRowCount = activeMazeRows.length;

  const dotKeys = activeMazeRows.flatMap((row, y) =>
    Array.from(row).flatMap((cell, x) => (cell === '.' ? [getCellKey({ x, y })] : [])),
  );
  activeDotKeySet = new Set(dotKeys);

  activePowerPelletKeys = new Set([
    getCellKey({ x: 1, y: 1 }),
    getCellKey({ x: activeMazeColumns - 2, y: 1 }),
    getCellKey({ x: 1, y: activeMazeRowCount - 2 }),
    getCellKey({ x: activeMazeColumns - 2, y: activeMazeRowCount - 2 }),
  ]);

  return {
    dotKeys,
    playerStart: config.playerStart,
    enemyStarts: config.enemyStarts,
  };
};

const getAudioUrl = (filename) => {
  const base = import.meta.env?.BASE_URL || '/';
  const separator = base.endsWith('/') ? '' : '/';
  return `${base}${separator}${filename}`;
};

const chompAudio = typeof window !== 'undefined' ? new Audio(getAudioUrl('pacman_chomp.wav')) : null;
const deathAudio = typeof window !== 'undefined' ? new Audio(getAudioUrl('pacman_death.wav')) : null;
const beginningAudio = typeof window !== 'undefined' ? new Audio(getAudioUrl('pacman_beginning.wav')) : null;
const eatghostAudio = typeof window !== 'undefined' ? new Audio(getAudioUrl('pacman_eatghost.wav')) : null;
const eatfruitAudio = typeof window !== 'undefined' ? new Audio(getAudioUrl('pacman_eatfruit.wav')) : null;

if (deathAudio) {
  deathAudio.volume = 0.15;
}
if (beginningAudio) {
  beginningAudio.volume = 0.15;
}
if (eatghostAudio) {
  eatghostAudio.volume = 0.05;
}
if (eatfruitAudio) {
  eatfruitAudio.volume = 0.05;
}

let pacAudioContext = null;
let sirenOsc = null;
let sirenLfo = null;
let sirenGain = null;

const getPacAudioContext = () => {
  if (!pacAudioContext) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextConstructor) {
      pacAudioContext = new AudioContextConstructor();
    }
  }
  return pacAudioContext;
};

const resumePacAudioContext = () => {
  const ctx = getPacAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }

  [chompAudio, deathAudio, beginningAudio, eatghostAudio, eatfruitAudio].forEach((audio) => {
    if (audio) {
      audio.load();
    }
  });
};

const startSiren = (dotsRemaining, totalDots, isPowerActive) => {
  const ctx = getPacAudioContext();
  if (!ctx) return;

  if (sirenOsc) {
    updateSirenParameters(dotsRemaining, totalDots, isPowerActive);
    return;
  }

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    sirenOsc = ctx.createOscillator();
    sirenLfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    sirenGain = ctx.createGain();

    sirenOsc.type = 'triangle';
    sirenLfo.type = 'sine';

    let baseFreq, modDepth, lfoFreq;
    if (isPowerActive) {
      baseFreq = 180;
      modDepth = 30;
      lfoFreq = 6.5;
    } else {
      const ratio = dotsRemaining / (totalDots || 200);
      baseFreq = 380 - ratio * 130;
      modDepth = 80 + (1 - ratio) * 40;
      lfoFreq = 5.5 - ratio * 3.5;
    }

    sirenOsc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    sirenLfo.frequency.setValueAtTime(lfoFreq, ctx.currentTime);
    lfoGain.gain.setValueAtTime(modDepth, ctx.currentTime);

    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);

    sirenGain.gain.setValueAtTime(0.015, ctx.currentTime);

    sirenOsc.connect(sirenGain);
    sirenGain.connect(ctx.destination);

    sirenOsc.start();
    sirenLfo.start();
  } catch (err) {
    // catch
  }
};

const updateSirenParameters = (dotsRemaining, totalDots, isPowerActive) => {
  const ctx = getPacAudioContext();
  if (!ctx || !sirenOsc || !sirenLfo) return;

  try {
    let baseFreq, lfoFreq;
    if (isPowerActive) {
      baseFreq = 180;
      lfoFreq = 6.5;
    } else {
      const ratio = dotsRemaining / (totalDots || 200);
      baseFreq = 380 - ratio * 130;
      lfoFreq = 5.5 - ratio * 3.5;
    }

    sirenOsc.frequency.setTargetAtTime(baseFreq, ctx.currentTime, 0.1);
    sirenLfo.frequency.setTargetAtTime(lfoFreq, ctx.currentTime, 0.1);
  } catch (err) {
    // catch
  }
};

const stopSiren = () => {
  try {
    if (sirenOsc) {
      sirenOsc.stop();
      sirenOsc.disconnect();
      sirenOsc = null;
    }
    if (sirenLfo) {
      sirenLfo.stop();
      sirenLfo.disconnect();
      sirenLfo = null;
    }
    if (sirenGain) {
      sirenGain.disconnect();
      sirenGain = null;
    }
  } catch (err) {
    // catch
  }
};

const playPacSound = (audio) => {
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Silently catch autoplay blocks
    });
  } catch (err) {
    // Silently catch
  }
};

let chompFadeTimeout = null;
let chompFadeInterval = null;

const playWakaSound = () => {
  if (!chompAudio) return;

  try {
    if (chompFadeTimeout) {
      clearTimeout(chompFadeTimeout);
      chompFadeTimeout = null;
    }
    if (chompFadeInterval) {
      clearInterval(chompFadeInterval);
      chompFadeInterval = null;
    }

    chompAudio.volume = 0.5;
    chompAudio.currentTime = 0;
    chompAudio.play().catch(() => {});

    chompFadeTimeout = setTimeout(() => {
      chompFadeInterval = setInterval(() => {
        if (chompAudio.volume > 0.05) {
          chompAudio.volume = Math.max(0, chompAudio.volume - 0.05);
        } else {
          chompAudio.volume = 0;
          chompAudio.pause();
          clearInterval(chompFadeInterval);
          chompFadeInterval = null;
        }
      }, 15);
    }, 100);
  } catch (err) {
    // catch
  }
};

const playDeathSound = () => {
  playPacSound(deathAudio);
};

const playEatGhostSound = () => {
  playPacSound(eatghostAudio);
};

const playPowerPelletSound = () => {
  playPacSound(eatfruitAudio);
};

const playPacTheme = () => {
  playPacSound(beginningAudio);
};

const createInitialMazeState = (levelIndex = 0) => {
  const config = loadLevelConfig(levelIndex);
  const startKey = getCellKey(config.playerStart);
  const collectedDotKeys = new Set();

  if (activeDotKeySet.has(startKey)) {
    collectedDotKeys.add(startKey);
  }

  // Clear dots on ghost starting positions
  config.enemyStarts.forEach((enemy) => {
    const enemyKey = getCellKey(enemy);
    if (activeDotKeySet.has(enemyKey)) {
      collectedDotKeys.add(enemyKey);
    }
  });

  return {
    levelIndex,
    collectedDotKeys,
    direction: movementByKey.arrowright,
    enemies: config.enemyStarts.map((enemy) => ({ ...enemy })),
    lives: startingLives,
    player: { ...config.playerStart },
    powerMs: 0,
    score: 0,
    status: 'ready',
    tick: 0,
  };
};

const isWallCell = (position) => {
  const x = Math.floor(position.x);
  const y = Math.floor(position.y);

  if (x < 0 || y < 0 || x >= activeMazeColumns || y >= activeMazeRowCount) {
    return true;
  }

  return activeMazeRows[y][x] === '#';
};

const getEntityCell = (position) => ({
  x: Math.floor(position.x + 0.5),
  y: Math.floor(position.y + 0.5),
});

const getCenteredPosition = (position) => ({
  x: Math.round(position.x),
  y: Math.round(position.y),
});

const getDistance = (firstPosition, secondPosition) =>
  Math.abs(firstPosition.x - secondPosition.x) + Math.abs(firstPosition.y - secondPosition.y);

const getRealDistance = (firstPosition, secondPosition) =>
  Math.hypot(firstPosition.x - secondPosition.x, firstPosition.y - secondPosition.y);

const isSameDirection = (firstDirection, secondDirection) =>
  firstDirection?.x === secondDirection?.x && firstDirection?.y === secondDirection?.y;

const isOppositeDirection = (firstDirection, secondDirection) =>
  firstDirection?.x === -secondDirection?.x && firstDirection?.y === -secondDirection?.y;

const isNearCellCenter = (position, tolerance = turnSnapTolerance) => {
  const center = getCenteredPosition(position);

  return Math.abs(position.x - center.x) <= tolerance && Math.abs(position.y - center.y) <= tolerance;
};

const canOccupyPosition = (position) => {
  const centerX = position.x + 0.5;
  const centerY = position.y + 0.5;
  const left = Math.floor(centerX - collisionRadius);
  const right = Math.floor(centerX + collisionRadius);
  const top = Math.floor(centerY - collisionRadius);
  const bottom = Math.floor(centerY + collisionRadius);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (isWallCell({ x, y })) {
        return false;
      }
    }
  }

  return true;
};

const canMoveFromCenter = (position, direction) =>
  canOccupyPosition({
    x: position.x + direction.x * (collisionRadius + 0.08),
    y: position.y + direction.y * (collisionRadius + 0.08),
  });

const isDirectionBlocked = (position, direction) => {
  if (!direction) {
    return true;
  }

  return !canOccupyPosition({
    x: position.x + direction.x * 0.08,
    y: position.y + direction.y * 0.08,
  });
};

const getPositionAfterMove = (position, direction, distance) => {
  if (!direction || distance <= 0) {
    return position;
  }

  const targetPosition = {
    x: position.x + direction.x * distance,
    y: position.y + direction.y * distance,
  };

  if (canOccupyPosition(targetPosition)) {
    return targetPosition;
  }

  let lowDistance = 0;
  let highDistance = distance;

  for (let index = 0; index < 8; index += 1) {
    const middleDistance = (lowDistance + highDistance) / 2;
    const middlePosition = {
      x: position.x + direction.x * middleDistance,
      y: position.y + direction.y * middleDistance,
    };

    if (canOccupyPosition(middlePosition)) {
      lowDistance = middleDistance;
    } else {
      highDistance = middleDistance;
    }
  }

  return {
    x: position.x + direction.x * lowDistance,
    y: position.y + direction.y * lowDistance,
  };
};

const tryApplyDesiredDirection = (position, direction, desiredDirection) => {
  if (!desiredDirection || isSameDirection(direction, desiredDirection)) {
    return { direction, position };
  }

  if (isOppositeDirection(direction, desiredDirection) && canOccupyPosition({
    x: position.x + desiredDirection.x * 0.08,
    y: position.y + desiredDirection.y * 0.08,
  })) {
    return { direction: desiredDirection, position };
  }

  const isBlocked = isDirectionBlocked(position, direction);

  if (!isNearCellCenter(position) && !isBlocked) {
    return { direction, position };
  }

  const centeredPosition = getCenteredPosition(position);

  if (!canMoveFromCenter(centeredPosition, desiredDirection)) {
    return { direction, position };
  }

  return {
    direction: desiredDirection,
    position: centeredPosition,
  };
};

const getCollectibleDotKey = (position) => {
  const cell = getEntityCell(position);
  const key = getCellKey(cell);

  if (!activeDotKeySet.has(key)) {
    return null;
  }

  if (Math.abs(position.x - cell.x) > dotCollectTolerance || Math.abs(position.y - cell.y) > dotCollectTolerance) {
    return null;
  }

  return key;
};

const getEnemyStart = (enemyId, levelIndex) => {
  const config = levels[levelIndex % levels.length];
  return config.enemyStarts.find((enemy) => enemy.id === enemyId);
};

const resetEatenEnemies = (enemies, eatenEnemyIds, levelIndex) =>
  enemies.map((enemy) => (eatenEnemyIds.has(enemy.id) ? { ...getEnemyStart(enemy.id, levelIndex) } : enemy));

const createLifeLossState = (gameState, overrides = {}) => {
  const nextLives = Math.max(0, (overrides.lives ?? gameState.lives) - 1);
  const config = levels[gameState.levelIndex % levels.length];

  return {
    ...gameState,
    ...overrides,
    direction: movementByKey.arrowright,
    enemies: config.enemyStarts.map((enemy) => ({ ...enemy })),
    lives: nextLives,
    player: { ...config.playerStart },
    powerMs: 0,
    status: nextLives === 0 ? 'gameover' : 'ready',
    tick: overrides.tick ?? gameState.tick,
  };
};

const getEnemyTarget = (enemy, gameState, enemyIndex) => {
  if (enemy.strategy === 'ambush') {
    return {
      x: gameState.player.x + (gameState.direction?.x ?? 0) * 3,
      y: gameState.player.y + (gameState.direction?.y ?? 0) * 3,
    };
  }

  if (enemy.strategy === 'patrol') {
    const patrolTargets = [
      { x: 1, y: 1 },
      { x: activeMazeColumns - 2, y: 1 },
      { x: activeMazeColumns - 2, y: activeMazeRowCount - 2 },
      { x: 1, y: activeMazeRowCount - 2 },
    ];
    const targetIndex = Math.floor(gameState.tick / 2.4 + enemyIndex) % patrolTargets.length;

    return patrolTargets[targetIndex];
  }

  return gameState.player;
};

const getAvailableDirectionsFromCenter = (position) =>
  mazeDirections.filter((direction) => canMoveFromCenter(position, direction));

const getEnemyDirection = (enemy, gameState, enemyIndex) => {
  const centeredPosition = getCenteredPosition(enemy);
  const availableDirections = getAvailableDirectionsFromCenter(centeredPosition);

  if (availableDirections.length === 0) {
    return enemy.direction;
  }

  const forwardDirections = availableDirections.filter((direction) => !isOppositeDirection(direction, enemy.direction));
  const candidates = forwardDirections.length > 0 ? forwardDirections : availableDirections;
  const target = getEnemyTarget(enemy, gameState, enemyIndex);
  const shouldFlee = gameState.powerMs > 0;
  const [bestDirection] = [...candidates].sort((firstDirection, secondDirection) => {
    const firstDistance = getDistance(
      { x: centeredPosition.x + firstDirection.x, y: centeredPosition.y + firstDirection.y },
      target,
    );
    const secondDistance = getDistance(
      { x: centeredPosition.x + secondDirection.x, y: centeredPosition.y + secondDirection.y },
      target,
    );

    if (firstDistance !== secondDistance) {
      return shouldFlee ? secondDistance - firstDistance : firstDistance - secondDistance;
    }

    return firstDirection.name.localeCompare(secondDirection.name);
  });

  return bestDirection;
};

const moveEnemy = (enemy, gameState, enemyIndex, deltaSeconds) => {
  const isCentered = isNearCellCenter(enemy, enemyTurnSnapTolerance);
  const isBlocked = isDirectionBlocked(enemy, enemy.direction);
  const shouldChooseDirection = isCentered || isBlocked;
  const basePosition = shouldChooseDirection ? { ...enemy, ...getCenteredPosition(enemy) } : enemy;
  const nextDirection = shouldChooseDirection ? getEnemyDirection(basePosition, gameState, enemyIndex) : enemy.direction;
  const speed = gameState.powerMs > 0 ? frightenedEnemySpeed : enemySpeed;
  const nextPosition = getPositionAfterMove(basePosition, nextDirection, speed * deltaSeconds);

  return {
    ...enemy,
    direction: nextDirection,
    x: nextPosition.x,
    y: nextPosition.y,
  };
};

const getCollidingEnemyIds = (enemies, player) =>
  enemies.filter((enemy) => getRealDistance(enemy, player) <= collisionDistance).map((enemy) => enemy.id);

const getStatusLabel = (status) => {
  if (status === 'won') {
    return 'Victoria';
  }

  if (status === 'gameover') {
    return 'Game over';
  }

  if (status === 'ready') {
    return 'Listo';
  }

  if (status === 'level-clear') {
    return 'Completado';
  }

  return 'Jugando';
};

const getNextPlayerMovement = (gameState, desiredDirection, deltaSeconds) => {
  const turnResult = tryApplyDesiredDirection(gameState.player, gameState.direction, desiredDirection);
  const nextPlayer = getPositionAfterMove(turnResult.position, turnResult.direction, playerSpeed * deltaSeconds);

  return {
    direction: turnResult.direction,
    player: nextPlayer,
  };
};

const advanceGameState = (gameState, desiredDirection, deltaMs) => {
  if (gameState.status !== 'playing') {
    return { events: [], state: gameState };
  }

  const events = [];
  const deltaSeconds = deltaMs / 1000;
  const movementState = getNextPlayerMovement(gameState, desiredDirection, deltaSeconds);
  const nextCollectedDotKeys = new Set(gameState.collectedDotKeys);
  const dotKey = getCollectibleDotKey(movementState.player);
  const didCollectDot = dotKey && !nextCollectedDotKeys.has(dotKey);
  const didCollectPowerPellet = didCollectDot && activePowerPelletKeys.has(dotKey);
  let nextPowerMs = didCollectPowerPellet ? powerDurationMs : Math.max(0, gameState.powerMs - deltaMs);
  let nextScore = gameState.score;

  if (didCollectDot) {
    nextCollectedDotKeys.add(dotKey);
    nextScore += didCollectPowerPellet ? 50 : 10;
    events.push(didCollectPowerPellet ? 'power' : 'dot');
  }

  const enemyContext = {
    ...gameState,
    direction: movementState.direction,
    player: movementState.player,
    powerMs: nextPowerMs,
    tick: gameState.tick + deltaSeconds,
  };
  const nextEnemies = gameState.enemies.map((enemy, enemyIndex) =>
    moveEnemy(enemy, enemyContext, enemyIndex, deltaSeconds),
  );
  const hitEnemyIds = getCollidingEnemyIds(nextEnemies, movementState.player);
  
  const activeLevelConfig = levels[gameState.levelIndex % levels.length];
  const levelDotKeys = activeLevelConfig.mazeRows.flatMap((row, y) =>
    Array.from(row).flatMap((cell, x) => (cell === '.' ? [getCellKey({ x, y })] : [])),
  );
  const nextRemainingDots = levelDotKeys.length - nextCollectedDotKeys.size;
  const isFinalLevel = gameState.levelIndex + 1 >= levels.length;
  
  let nextGameState = {
    ...gameState,
    collectedDotKeys: nextCollectedDotKeys,
    direction: movementState.direction,
    enemies: nextEnemies,
    player: movementState.player,
    powerMs: nextPowerMs,
    score: nextScore,
    status: nextRemainingDots === 0 ? (isFinalLevel ? 'won' : 'level-clear') : 'playing',
    tick: gameState.tick + deltaSeconds,
  };

  if (nextRemainingDots === 0) {
    events.push('win');
    return { events, state: nextGameState };
  }

  if (hitEnemyIds.length > 0 && nextPowerMs > 0) {
    const eatenEnemyIds = new Set(hitEnemyIds);

    nextScore += eatenEnemyIds.size * enemyEatenScore;
    nextGameState = {
      ...nextGameState,
      enemies: resetEatenEnemies(nextEnemies, eatenEnemyIds, gameState.levelIndex),
      score: nextScore,
    };
    events.push('eatEnemy');
  } else if (hitEnemyIds.length > 0) {
    events.push('lifeLost');
    nextGameState = createLifeLossState(gameState, {
      collectedDotKeys: nextCollectedDotKeys,
      score: nextScore,
      tick: gameState.tick + deltaSeconds,
    });
  }

  return {
    events,
    state: nextGameState,
  };
};

const getMazeMetrics = (stageSize) => {
  const fallbackSize = { width: 560, height: 360 };
  const width = stageSize.width || fallbackSize.width;
  const height = stageSize.height || fallbackSize.height;
  const cellSize = Math.max(
    12,
    Math.floor(Math.min((width - 24) / activeMazeColumns, (height - 24) / (activeMazeRowCount + hudRowCount))),
  );

  return {
    cellSize,
    height: cellSize * (activeMazeRowCount + hudRowCount),
    width: cellSize * activeMazeColumns,
  };
};

const wallNeighborDirections = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const drawClassicWallCell = (context, x, y, cellSize, boardOffsetY) => {
  const left = x * cellSize;
  const top = boardOffsetY + y * cellSize;
  const centerX = left + cellSize / 2;
  const centerY = top + cellSize / 2;
  const trackWidth = Math.max(4, cellSize * 0.52);
  const glowWidth = Math.max(2, cellSize * 0.18);
  const hasWallNeighbor = (direction) => activeMazeRows[y + direction.y]?.[x + direction.x] === '#';

  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const direction of wallNeighborDirections) {
    if (!hasWallNeighbor(direction)) {
      continue;
    }

    context.strokeStyle = '#00145f';
    context.lineWidth = trackWidth;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + direction.x * cellSize * 0.5, centerY + direction.y * cellSize * 0.5);
    context.stroke();

    context.strokeStyle = '#234dff';
    context.lineWidth = glowWidth;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX + direction.x * cellSize * 0.5, centerY + direction.y * cellSize * 0.5);
    context.stroke();
  }

  context.fillStyle = '#00145f';
  context.beginPath();
  context.arc(centerX, centerY, trackWidth * 0.5, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#234dff';
  context.lineWidth = glowWidth;
  context.beginPath();
  context.arc(centerX, centerY, Math.max(1, trackWidth * 0.32), 0, Math.PI * 2);
  context.stroke();
};

const drawEnemy = (context, enemy, cellSize, boardOffsetY, gameState) => {
  const isVulnerable = gameState.powerMs > 0;
  const isWhitePhase = isVulnerable && gameState.powerMs < 2000 && Math.floor(gameState.powerMs / 200) % 2 === 0;

  const centerX = (enemy.x + 0.5) * cellSize;
  const centerY = boardOffsetY + (enemy.y + 0.5) * cellSize;
  const radius = cellSize * 0.38;
  const directionX = enemy.direction?.x ?? 1;
  const directionY = enemy.direction?.y ?? 0;

  context.save();
  context.translate(centerX, centerY);

  // Body color
  context.fillStyle = isVulnerable
    ? (isWhitePhase ? '#ffb8ae' : '#2121de')
    : enemy.color;

  context.beginPath();
  // Dome top
  context.arc(0, -radius * 0.15, radius, Math.PI, 0, false);
  // Right side
  context.lineTo(radius, radius * 0.75);

  // Bottom waves/feet (waddle animation wiggles left/right)
  const waddle = Math.floor(gameState.tick * 8) % 2 === 0;
  if (waddle) {
    context.lineTo(radius * 0.66, radius * 0.45);
    context.lineTo(radius * 0.33, radius * 0.75);
    context.lineTo(0, radius * 0.45);
    context.lineTo(-radius * 0.33, radius * 0.75);
    context.lineTo(-radius * 0.66, radius * 0.45);
    context.lineTo(-radius, radius * 0.75);
  } else {
    context.lineTo(radius * 0.75, radius * 0.55);
    context.lineTo(radius * 0.5, radius * 0.75);
    context.lineTo(radius * 0.25, radius * 0.55);
    context.lineTo(0, radius * 0.75);
    context.lineTo(-radius * 0.25, radius * 0.55);
    context.lineTo(-radius * 0.5, radius * 0.75);
    context.lineTo(-radius * 0.75, radius * 0.55);
    context.lineTo(-radius, radius * 0.75);
  }
  // Left side
  context.lineTo(-radius, -radius * 0.15);
  context.closePath();
  context.fill();

  // Face elements (eyes and mouth)
  if (isVulnerable) {
    const faceColor = isWhitePhase ? '#ff0000' : '#ffb8ae';
    context.fillStyle = faceColor;

    // Small scared eyes
    const scaredEyeOffset = radius * 0.32;
    const scaredEyeY = -radius * 0.15;
    const scaredEyeRadius = radius * 0.11;

    context.beginPath();
    context.arc(-scaredEyeOffset, scaredEyeY, scaredEyeRadius, 0, Math.PI * 2);
    context.arc(scaredEyeOffset, scaredEyeY, scaredEyeRadius, 0, Math.PI * 2);
    context.fill();

    // Squiggly mouth (scared expression)
    context.strokeStyle = faceColor;
    context.lineWidth = Math.max(1.5, cellSize * 0.06);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    
    const mouthY = radius * 0.25;
    const mouthW = radius * 0.55;
    const mouthH = radius * 0.15;

    context.moveTo(-mouthW, mouthY);
    context.lineTo(-mouthW * 0.6, mouthY + mouthH);
    context.lineTo(-mouthW * 0.2, mouthY - mouthH);
    context.lineTo(mouthW * 0.2, mouthY + mouthH);
    context.lineTo(mouthW * 0.6, mouthY - mouthH);
    context.lineTo(mouthW, mouthY);
    context.stroke();
  } else {
    // Normal Eyes
    const eyeOffsetX = radius * 0.3;
    const eyeOffsetY = -radius * 0.15;
    const eyeRadiusX = radius * 0.22;
    const eyeRadiusY = radius * 0.28;

    // Eyeballs
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.ellipse(-eyeOffsetX, eyeOffsetY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
    context.ellipse(eyeOffsetX, eyeOffsetY, eyeRadiusX, eyeRadiusY, 0, 0, Math.PI * 2);
    context.fill();

    // Pupils
    const pupilOffsetX = directionX * radius * 0.12;
    const pupilOffsetY = directionY * radius * 0.12;
    const pupilRadius = radius * 0.13;

    context.fillStyle = '#2121de';
    context.beginPath();
    context.arc(-eyeOffsetX + pupilOffsetX, eyeOffsetY + pupilOffsetY, pupilRadius, 0, Math.PI * 2);
    context.arc(eyeOffsetX + pupilOffsetX, eyeOffsetY + pupilOffsetY, pupilRadius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
};

const drawMazeBoard = (context, gameState, metrics) => {
  const { cellSize, height, width } = metrics;
  const boardOffsetY = cellSize * hudRowCount;

  context.clearRect(0, 0, width, height);

  context.fillStyle = '#000000';
  context.fillRect(0, 0, width, height);
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = '#ffffff';
  context.font = `700 ${Math.max(11, Math.round(cellSize * 0.5))}px Consolas, 'Courier New', monospace`;
  context.fillText('1UP', cellSize * 1.1, Math.max(2, cellSize * 0.08));
  context.fillText('HIGH SCORE', cellSize * 7, Math.max(2, cellSize * 0.08));
  context.font = `700 ${Math.max(12, Math.round(cellSize * 0.55))}px Consolas, 'Courier New', monospace`;
  context.fillText(String(gameState.score).padStart(2, '0'), cellSize * 1.25, cellSize * 0.72);
  context.fillText(String(Math.max(gameState.score, 1000)).padStart(4, '0'), cellSize * 8.15, cellSize * 0.72);
  context.textAlign = 'right';
  context.fillText(`VIDAS ${gameState.lives}`, width - cellSize * 1.1, cellSize * 0.72);

  if (gameState.powerMs > 0) {
    context.fillStyle = '#4cecff';
    context.fillText(`PODER ${Math.ceil(gameState.powerMs / 1000)}`, width - cellSize * 1.1, Math.max(2, cellSize * 0.08));
  }

  for (let y = 0; y < activeMazeRowCount; y += 1) {
    for (let x = 0; x < activeMazeColumns; x += 1) {
      const cell = activeMazeRows[y][x];
      const left = x * cellSize;
      const top = boardOffsetY + y * cellSize;

      if (cell === '#') {
        drawClassicWallCell(context, x, y, cellSize, boardOffsetY);
      } else if (cell === '.' && !gameState.collectedDotKeys.has(getCellKey({ x, y }))) {
        const dotKey = getCellKey({ x, y });
        const isPowerPellet = activePowerPelletKeys.has(dotKey);

        context.fillStyle = '#f6d7a7';
        context.beginPath();
        context.arc(
          left + cellSize / 2,
          top + cellSize / 2,
          Math.max(isPowerPellet ? 4 : 2, cellSize * (isPowerPellet ? 0.2 : 0.1)),
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
  }

  for (const enemy of gameState.enemies) {
    drawEnemy(context, enemy, cellSize, boardOffsetY, gameState);
  }

  const playerCenterX = (gameState.player.x + 0.5) * cellSize;
  const playerCenterY = boardOffsetY + (gameState.player.y + 0.5) * cellSize;
  const playerRadius = cellSize * 0.34;
  const animatedMouth = gameState.status === 'playing'
    ? Math.PI * (0.14 + Math.abs(Math.sin(gameState.tick * 9)) * 0.14)
    : Math.PI * 0.22;
  const directionAngle = gameState.direction?.angle ?? 0;

  context.fillStyle = '#ffe900';
  context.beginPath();
  context.moveTo(playerCenterX, playerCenterY);
  context.arc(
    playerCenterX,
    playerCenterY,
    playerRadius,
    directionAngle + animatedMouth,
    directionAngle + Math.PI * 2 - animatedMouth,
  );
  context.closePath();
  context.fill();

  if (gameState.status === 'ready') {
    context.fillStyle = '#ffd36a';
    context.font = `700 ${Math.max(13, Math.round(cellSize * 0.62))}px Consolas, 'Courier New', monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('READY!', width / 2, boardOffsetY + cellSize * 7.5);
  }

  if (gameState.status === 'level-clear') {
    context.fillStyle = 'rgba(0, 0, 0, 0.76)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffe900';
    context.font = `700 ${Math.max(18, Math.round(cellSize * 1.05))}px Consolas, 'Courier New', monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('NIVEL COMPLETADO', width / 2, height / 2 - cellSize * 0.45);
    context.fillStyle = '#f6d7a7';
    context.font = `400 ${Math.max(12, Math.round(cellSize * 0.48))}px Consolas, 'Courier New', monospace`;
    context.fillText('PREPARANDO SIGUIENTE NIVEL...', width / 2, height / 2 + cellSize * 0.42);
  }

  if (gameState.status === 'won') {
    context.fillStyle = 'rgba(0, 0, 0, 0.76)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#ffe900';
    context.font = `700 ${Math.max(18, Math.round(cellSize * 1.05))}px Consolas, 'Courier New', monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('GANASTE', width / 2, height / 2 - cellSize * 0.45);
    context.fillStyle = '#f6d7a7';
    context.font = `400 ${Math.max(12, Math.round(cellSize * 0.48))}px Consolas, 'Courier New', monospace`;
    context.fillText('R PARA REINICIAR', width / 2, height / 2 + cellSize * 0.42);
  }

  if (gameState.status === 'gameover') {
    context.fillStyle = 'rgba(0, 0, 0, 0.76)';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#ff6f6f';
    context.font = `700 ${Math.max(18, Math.round(cellSize * 0.98))}px Consolas, 'Courier New', monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('GAME OVER', width / 2, height / 2 - cellSize * 0.45);
    context.fillStyle = '#f6d7a7';
    context.font = `400 ${Math.max(12, Math.round(cellSize * 0.48))}px Consolas, 'Courier New', monospace`;
    context.fillText('R PARA REINICIAR', width / 2, height / 2 + cellSize * 0.42);
  }
};

export function RosoMazeApp({ windowId }) {
  const appRef = useRef(null);
  const canvasRef = useRef(null);
  const desiredDirectionRef = useRef(movementByKey.arrowright);
  const gameLoopRef = useRef(null);
  const gameStateRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const stageRef = useRef(null);
  const themePlayedRef = useRef(false);
  const [gameState, setGameState] = useState(() => createInitialMazeState());
  const [stageSize, setStageSize] = useState({ height: 0, width: 0 });
  const activeWindowId = useWindowStore((state) => state.activeWindowId);
  const remainingDots = Math.max(0, activeDotKeySet.size - gameState.collectedDotKeys.size);
  const powerSeconds = Math.ceil(gameState.powerMs / 1000);
  const isPowerActive = gameState.powerMs > 0;
  const metrics = useMemo(() => getMazeMetrics(stageSize), [stageSize]);

  const startNextLevel = useCallback((score, lives, nextLevelIndex) => {
    themePlayedRef.current = true;
    const config = loadLevelConfig(nextLevelIndex);
    const startKey = getCellKey(config.playerStart);
    const collectedDotKeys = new Set();
    if (activeDotKeySet.has(startKey)) {
      collectedDotKeys.add(startKey);
    }
    config.enemyStarts.forEach((enemy) => {
      const enemyKey = getCellKey(enemy);
      if (activeDotKeySet.has(enemyKey)) {
        collectedDotKeys.add(enemyKey);
      }
    });
    const nextGameState = {
      levelIndex: nextLevelIndex,
      collectedDotKeys,
      direction: movementByKey.arrowright,
      enemies: config.enemyStarts.map((enemy) => ({ ...enemy })),
      lives,
      player: { ...config.playerStart },
      powerMs: 0,
      score,
      status: 'ready',
      tick: 0,
    };
    desiredDirectionRef.current = movementByKey.arrowright;
    lastFrameTimeRef.current = null;
    gameStateRef.current = nextGameState;
    setGameState(nextGameState);
    playPacTheme();
  }, []);

  useEffect(() => {
    if (gameState.status === 'level-clear') {
      const timer = setTimeout(() => {
        startNextLevel(gameState.score, gameState.lives, gameState.levelIndex + 1);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState.status, gameState.score, gameState.lives, gameState.levelIndex, startNextLevel]);

  useEffect(() => {
    if (!windowId || activeWindowId === windowId) {
      appRef.current?.focus({ preventScroll: true });
    }
  }, [activeWindowId, windowId]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (gameState.status === 'playing') {
      startSiren(remainingDots, activeDotKeySet.size, isPowerActive);
    } else {
      stopSiren();
    }
    return () => {
      if (gameState.status !== 'playing') {
        stopSiren();
      }
    };
  }, [gameState.status, isPowerActive, remainingDots]);

  useEffect(() => {
    return () => {
      stopSiren();
      if (chompFadeTimeout) clearTimeout(chompFadeTimeout);
      if (chompFadeInterval) clearInterval(chompFadeInterval);
    };
  }, []);

  useEffect(() => {
    const updateStageSize = () => {
      const bounds = stageRef.current?.getBoundingClientRect();

      if (!bounds) {
        return;
      }

      setStageSize({
        height: Math.max(0, Math.floor(bounds.height)),
        width: Math.max(0, Math.floor(bounds.width)),
      });
    };

    updateStageSize();

    const observer = new ResizeObserver(updateStageSize);

    if (stageRef.current) {
      observer.observe(stageRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(metrics.width * ratio));
    canvas.height = Math.max(1, Math.round(metrics.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawMazeBoard(context, gameState, metrics);
  }, [gameState, metrics]);

  const focusMaze = () => {
    resumePacAudioContext();
    if (gameStateRef.current?.status === 'ready' && !themePlayedRef.current) {
      playPacTheme();
      themePlayedRef.current = true;
    }
    appRef.current?.focus({ preventScroll: true });
  };

  const playMazeEvents = useCallback((events) => {
    if (events.includes('win')) {
      playPacTheme();
    } else if (events.includes('lifeLost')) {
      playDeathSound();
    } else if (events.includes('eatEnemy')) {
      playEatGhostSound();
    } else if (events.includes('power')) {
      playPowerPelletSound();
    } else if (events.includes('dot')) {
      playWakaSound();
    }
  }, []);

  const stepGame = useCallback((deltaMs) => {
    const currentGameState = gameStateRef.current;

    if (!currentGameState) {
      return;
    }

    const { events, state: nextGameState } = advanceGameState(
      currentGameState,
      desiredDirectionRef.current,
      deltaMs,
    );

    if (nextGameState === currentGameState) {
      return;
    }

    if (events.includes('lifeLost')) {
      desiredDirectionRef.current = movementByKey.arrowright;
    }

    gameStateRef.current = nextGameState;
    setGameState(nextGameState);
    playMazeEvents(events);
  }, [playMazeEvents]);

  useEffect(() => {
    const runFrame = (timestamp) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }

      const deltaMs = Math.min(maxFrameDeltaMs, timestamp - lastFrameTimeRef.current);

      lastFrameTimeRef.current = timestamp;

      if (deltaMs > 0) {
        stepGame(deltaMs);
      }

      gameLoopRef.current = window.requestAnimationFrame(runFrame);
    };

    gameLoopRef.current = window.requestAnimationFrame(runFrame);

    return () => {
      if (gameLoopRef.current) {
        window.cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [stepGame]);

  const resetGame = useCallback(() => {
    resumePacAudioContext();
    themePlayedRef.current = true;
    const wasWon = gameStateRef.current?.status === 'won';
    const currentLevelIndex = wasWon ? 0 : (gameStateRef.current?.levelIndex ?? 0);
    const nextGameState = createInitialMazeState(currentLevelIndex);

    desiredDirectionRef.current = movementByKey.arrowright;
    lastFrameTimeRef.current = null;
    gameStateRef.current = nextGameState;
    setGameState(nextGameState);
    playPacTheme();
    focusMaze();
  }, []);

  const startMoving = (direction) => {
    resumePacAudioContext();
    const currentGameState = gameStateRef.current;

    if (!currentGameState || currentGameState.status === 'gameover' || currentGameState.status === 'won') {
      return;
    }

    desiredDirectionRef.current = direction;

    if (currentGameState.status === 'ready') {
      const nextGameState = {
        ...currentGameState,
        status: 'playing',
      };

      gameStateRef.current = nextGameState;
      setGameState(nextGameState);
    }
  };

  const handleKeyDown = (event) => {
    resumePacAudioContext();
    if (gameStateRef.current?.status === 'ready' && !themePlayedRef.current) {
      playPacTheme();
      themePlayedRef.current = true;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      resetGame();
      return;
    }

    const direction = movementByKey[event.key.toLowerCase()];

    if (!direction) {
      return;
    }

    event.preventDefault();
    startMoving(direction);
  };

  return (
    <div
      className="ros-maze-app"
      ref={appRef}
      tabIndex={0}
      aria-label="Pac-Man"
      onKeyDown={handleKeyDown}
      onPointerDownCapture={focusMaze}
    >
      <div className="ros-app-toolbar ros-maze-toolbar" aria-label="Controles de Pac-Man">
        <strong>Pac-Man</strong>
        <span>Flechas o WASD</span>
        <span>Movimiento continuo</span>
        <button className="ros-app-toolbar-button" type="button" onClick={resetGame}>
          Reiniciar
        </button>
      </div>

      <div className="ros-maze-stage" ref={stageRef}>
        <canvas
          className="ros-maze-canvas"
          ref={canvasRef}
          style={{
            height: `${metrics.height}px`,
            width: `${metrics.width}px`,
          }}
          aria-label="Laberinto de Pac-Man"
        />
      </div>

      <div className="ros-maze-status" aria-live="polite">
        <span>Nivel: {gameState.levelIndex + 1}/3</span>
        <span>Puntos: {gameState.score}</span>
        <span>Vidas: {gameState.lives}</span>
        <span>Restan: {remainingDots}</span>
        <span>{gameState.powerMs > 0 ? `Poder: ${powerSeconds}s` : 'Poder: no'}</span>
        <span>{getStatusLabel(gameState.status)}</span>
      </div>
    </div>
  );
}
