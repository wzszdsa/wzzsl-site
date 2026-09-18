const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function keyFor(x, y) {
  return `${x},${y}`;
}

export function parseLevel(rawLevel) {
  const rows = rawLevel.replace(/\r/g, '').split('\n');
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  const walls = new Set();
  const goals = new Set();
  const boxes = new Set();
  let player = null;

  rows.forEach((row, y) => {
    const padded = row.padEnd(width, ' ');
    [...padded].forEach((cell, x) => {
      const key = keyFor(x, y);
      if (cell === '#') walls.add(key);
      if (cell === '.' || cell === '*' || cell === '+') goals.add(key);
      if (cell === '$' || cell === '*') boxes.add(key);
      if (cell === '@' || cell === '+') player = { x, y };
    });
  });

  if (!player) throw new Error('Level must contain a player');
  if (boxes.size !== goals.size) throw new Error('Level must have the same number of boxes and goals');

  return { raw: rawLevel, width, height, walls, goals, boxes, player };
}

export function createGameState(level) {
  const state = {
    width: level.width,
    height: level.height,
    walls: new Set(level.walls),
    goals: new Set(level.goals),
    boxes: new Set(level.boxes),
    player: { ...level.player },
    moves: 0,
    pushes: 0,
    completed: false,
  };
  state.completed = isComplete(state);
  return state;
}

function copyState(state) {
  return {
    ...state,
    walls: new Set(state.walls),
    goals: new Set(state.goals),
    boxes: new Set(state.boxes),
    player: { ...state.player },
  };
}

export function isComplete(state) {
  return [...state.goals].every((goal) => state.boxes.has(goal));
}

export function movePlayer(state, direction) {
  const vector = DIRECTIONS[direction];
  if (!vector) throw new Error(`Unknown direction: ${direction}`);

  const next = copyState(state);
  const target = {
    x: state.player.x + vector.x,
    y: state.player.y + vector.y,
  };
  const targetKey = keyFor(target.x, target.y);

  if (state.walls.has(targetKey)) return { state, moved: false, pushed: false };

  if (state.boxes.has(targetKey)) {
    const beyond = {
      x: target.x + vector.x,
      y: target.y + vector.y,
    };
    const beyondKey = keyFor(beyond.x, beyond.y);
    if (state.walls.has(beyondKey) || state.boxes.has(beyondKey)) {
      return { state, moved: false, pushed: false };
    }
    next.boxes.delete(targetKey);
    next.boxes.add(beyondKey);
    next.pushes += 1;
  }

  next.player = target;
  next.moves += 1;
  next.completed = isComplete(next);
  return { state: next, moved: true, pushed: next.pushes > state.pushes };
}

export function undoState(currentState, previousState) {
  return copyState(previousState ?? currentState);
}
