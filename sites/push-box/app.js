import { createGameState, movePlayer, parseLevel, undoState, keyFor } from './game.js';

const LEVELS = [
  {
    name: '入门仓',
    hint: '先熟悉推箱子的节奏',
    map: [
      '#######',
      '#  .  #',
      '#  $  #',
      '#  @  #',
      '#     #',
      '#######',
    ].join('\n'),
  },
  {
    name: '双轨运输',
    hint: '两个箱子，分别送往上下货架',
    map: [
      '########',
      '#  .   #',
      '#  $   #',
      '#      #',
      '#  @ $ #',
      '#  .   #',
      '########',
    ].join('\n'),
  },
  {
    name: '并排货架',
    hint: '把两个木箱依次推上同一排目标点',
    map: [
      '########',
      '# .  . #',
      '# $  $ #',
      '#   @  #',
      '#      #',
      '########',
    ].join('\n'),
  },
  {
    name: '中央隔断',
    hint: '绕到箱子下方，避开中间的墙',
    map: [
      '#########',
      '# .   . #',
      '# $###$ #',
      '#   @   #',
      '#       #',
      '#########',
    ].join('\n'),
  },
  {
    name: '上下分流',
    hint: '一个箱子向上，一个箱子向下',
    map: [
      '#########',
      '#   .   #',
      '# $   $ #',
      '#  ###  #',
      '#   @   #',
      '#   .   #',
      '#########',
    ].join('\n'),
  },
  {
    name: '终点仓库',
    hint: '最后一关：留意箱子的转向空间',
    map: [
      '##########',
      '# .  .   #',
      '# $$     #',
      '#   ##   #',
      '#   @    #',
      '#        #',
      '##########',
    ].join('\n'),
  },
];

const sprites = {
  player: './assets/player.png',
  box: './assets/crate.png',
};

const elements = {
  board: document.querySelector('#board'),
  levelTitle: document.querySelector('#level-title'),
  levelHint: document.querySelector('#level-hint'),
  levelCount: document.querySelector('#level-count'),
  moves: document.querySelector('#moves'),
  pushes: document.querySelector('#pushes'),
  status: document.querySelector('#status'),
  reset: document.querySelector('#reset'),
  undo: document.querySelector('#undo'),
  next: document.querySelector('#next'),
  levelList: document.querySelector('#level-list'),
  controls: document.querySelectorAll('[data-direction]'),
};

let currentLevel = 0;
let state;
let history = [];

function loadLevel(index) {
  currentLevel = index;
  state = createGameState(parseLevel(LEVELS[index].map));
  history = [];
  render();
}

function render() {
  const level = LEVELS[currentLevel];
  elements.levelTitle.textContent = level.name;
  elements.levelHint.textContent = level.hint;
  elements.levelCount.textContent = `关卡 ${currentLevel + 1} / ${LEVELS.length}`;
  elements.moves.textContent = String(state.moves).padStart(2, '0');
  elements.pushes.textContent = String(state.pushes).padStart(2, '0');
  elements.undo.disabled = history.length === 0;
  elements.next.disabled = !state.completed;
  elements.next.textContent = currentLevel === LEVELS.length - 1 ? '重新挑战' : '下一关';
  elements.status.textContent = state.completed ? '🎉 仓库整理完成！' : '把所有木箱推到黄色目标点';
  elements.status.classList.toggle('is-complete', state.completed);

  elements.board.style.setProperty('--columns', state.width);
  elements.board.innerHTML = '';
  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const key = keyFor(x, y);
      const tile = document.createElement('div');
      const isWall = state.walls.has(key);
      const isGoal = state.goals.has(key);
      const isBox = state.boxes.has(key);
      const isPlayer = state.player.x === x && state.player.y === y;
      tile.className = 'tile';
      if (isWall) tile.classList.add('wall');
      else tile.classList.add('floor');
      if (isGoal) tile.classList.add('goal');
      if (isBox && isGoal) tile.classList.add('box-on-goal');
      if (isPlayer) tile.classList.add('player-tile');
      tile.setAttribute('aria-label', isWall ? '墙' : isBox ? (isGoal ? '已到位的箱子' : '箱子') : isGoal ? '目标点' : '地面');

      if (isGoal && !isBox && !isPlayer) {
        tile.insertAdjacentHTML('beforeend', '<span class="goal-mark">✦</span>');
      }
      if (isBox) {
        tile.insertAdjacentHTML('beforeend', `<img class="box-sprite" src="${sprites.box}" alt="" draggable="false" />${isGoal ? '<span class="box-check" aria-hidden="true">✓</span>' : ''}`);
      }
      if (isPlayer) {
        tile.insertAdjacentHTML('beforeend', `<img class="player-sprite" src="${sprites.player}" alt="" draggable="false" />`);
      }
      elements.board.appendChild(tile);
    }
  }

  elements.levelList.querySelectorAll('button').forEach((button, index) => {
    button.classList.toggle('active', index === currentLevel);
    button.classList.toggle('completed', index < currentLevel || (index === currentLevel && state.completed));
  });
}

function tryMove(direction) {
  if (state.completed) return;
  const result = movePlayer(state, direction);
  if (!result.moved) {
    elements.board.classList.remove('shake');
    void elements.board.offsetWidth;
    elements.board.classList.add('shake');
    return;
  }
  history.push(state);
  state = result.state;
  render();
}

elements.reset.addEventListener('click', () => loadLevel(currentLevel));
elements.undo.addEventListener('click', () => {
  if (!history.length) return;
  state = undoState(state, history.pop());
  render();
});
elements.next.addEventListener('click', () => {
  loadLevel(currentLevel === LEVELS.length - 1 ? 0 : currentLevel + 1);
});
elements.controls.forEach((button) => button.addEventListener('click', () => tryMove(button.dataset.direction)));
elements.levelList.innerHTML = LEVELS.map((level, index) => `<button type="button" data-level="${index}"><span>${String(index + 1).padStart(2, '0')}</span>${level.name}</button>`).join('');
elements.levelList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-level]');
  if (button) loadLevel(Number(button.dataset.level));
});

document.addEventListener('keydown', (event) => {
  const keyMap = { ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down', ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right' };
  if (keyMap[event.key]) {
    event.preventDefault();
    tryMove(keyMap[event.key]);
  }
  if (event.key.toLowerCase() === 'r') loadLevel(currentLevel);
  if (event.key.toLowerCase() === 'z' && history.length) {
    state = undoState(state, history.pop());
    render();
  }
});

loadLevel(0);

