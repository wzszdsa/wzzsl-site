import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, createGameState, movePlayer, undoState, isComplete } from '../game.js';

const LEVEL = [
  '#######',
  '#  .  #',
  '#  $  #',
  '#  @  #',
  '#     #',
  '#######',
].join('\n');

test('parses walls, goals, boxes, and player from a level', () => {
  const level = parseLevel(LEVEL);
  assert.equal(level.width, 7);
  assert.equal(level.height, 6);
  assert.deepEqual(level.player, { x: 3, y: 3 });
  assert.equal(level.boxes.size, 1);
  assert.equal(level.goals.size, 1);
  assert.ok(level.walls.has('0,0'));
});

test('pushes a box only when the next tile is free', () => {
  const state = createGameState(parseLevel(LEVEL));
  const moved = movePlayer(state, 'up');
  assert.equal(moved.moved, true);
  assert.equal(moved.pushed, true);
  assert.deepEqual(moved.state.player, { x: 3, y: 2 });
  assert.ok(moved.state.boxes.has('3,1'));
  assert.equal(moved.state.moves, 1);

  const blocked = movePlayer(moved.state, 'up');
  assert.equal(blocked.moved, false);
  assert.deepEqual(blocked.state.player, { x: 3, y: 2 });
  assert.ok(blocked.state.boxes.has('3,1'));
});

test('supports undo without mutating the current state', () => {
  const initial = createGameState(parseLevel(LEVEL));
  const next = movePlayer(initial, 'up').state;
  const undone = undoState(next, initial);
  assert.deepEqual(undone.player, initial.player);
  assert.deepEqual([...undone.boxes], [...initial.boxes]);
  assert.equal(next.player.y, 2);
});

test('recognizes a completed level when every goal has a box', () => {
  const state = createGameState(parseLevel(LEVEL));
  const completed = movePlayer(state, 'up').state;
  assert.equal(isComplete(completed), true);
  assert.equal(completed.completed, true);
});
