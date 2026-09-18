import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, root), 'utf8');

test('uses generated character and crate sprites in the game UI', () => {
  assert.equal(existsSync(new URL('assets/player.png', root)), true);
  assert.equal(existsSync(new URL('assets/crate.png', root)), true);
  assert.match(read('app.js'), /assets\/player\.png/);
  assert.match(read('app.js'), /assets\/crate\.png/);
  assert.match(read('styles.css'), /\.player-sprite/);
  assert.match(read('styles.css'), /\.box-sprite/);
  assert.match(read('styles.css'), /\.box-check/);
});
