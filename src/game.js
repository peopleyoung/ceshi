/* 贪吃蛇核心规则：不依赖 DOM，浏览器与 Node 共用（PRD v1.1 §4.10 可测性建议） */
(function (root) {
  'use strict';

  const STATES = {
    IDLE: 'IDLE',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
    WON: 'WON'
  };

  const DIRECTIONS = {
    UP: { name: 'UP', x: 0, y: -1 },
    DOWN: { name: 'DOWN', x: 0, y: 1 },
    LEFT: { name: 'LEFT', x: -1, y: 0 },
    RIGHT: { name: 'RIGHT', x: 1, y: 0 }
  };

  const DEFAULT_CONFIG = {
    cols: 20,
    rows: 15,
    startLength: 3,
    startDir: 'RIGHT',
    startX: 2,
    startY: 2,
    baseTickMs: 150,
    scorePerFood: 10,
    speedEveryScore: 50,
    speedReduceMs: 10,
    minTickMs: 80,
    bestScore: 0,
    speedEnabled: true
  };

  function toDir(value) {
    if (!value) return null;
    if (typeof value === 'string') return DIRECTIONS[value] || null;
    if (typeof value.name === 'string') return DIRECTIONS[value.name] || null;
    return null;
  }

  function isReverseOf(a, b) {
    const x = toDir(a);
    const y = toDir(b);
    if (!x || !y) return false;
    return x !== y && x.x + y.x === 0 && x.y + y.y === 0;
  }

  function sameDir(a, b) {
    const x = toDir(a);
    const y = toDir(b);
    return !!x && !!y && x.name === y.name;
  }

  function buildSnake(state) {
    const cfg = state.cfg;
    const dir = toDir(cfg.startDir) || DIRECTIONS.RIGHT;
    const headX = Math.min(cfg.startX, cfg.cols - 1);
    const headY = Math.min(cfg.startY, cfg.rows - 1);
    const cells = [];
    for (let i = 0; i < cfg.startLength; i++) {
      const x = headX - dir.x * i;
      const y = headY - dir.y * i;
      if (x < 0 || y < 0 || x >= cfg.cols || y >= cfg.rows) break;
      cells.push({ x: x, y: y });
    }
    return cells;
  }

  function emptyCells(state) {
    const taken = Object.create(null);
    for (const cell of state.snake) taken[cell.x + ',' + cell.y] = true;
    const free = [];
    for (let y = 0; y < state.cfg.rows; y++) {
      for (let x = 0; x < state.cfg.cols; x++) {
        if (!taken[x + ',' + y]) free.push({ x: x, y: y });
      }
    }
    return free;
  }

  function finish(state, status, cause) {
    state.status = status;
    state.cause = cause || null;
    state.pendingDir = null;
    state.turnLocked = false;
    if (state.score > state.best) state.best = state.score;
  }

  function placeFood(state) {
    const free = emptyCells(state);
    if (!free.length) {
      state.food = null;
      finish(state, STATES.WON, null);
      return false;
    }
    const pick = free[Math.min(free.length - 1, Math.floor(state.rand() * free.length))];
    state.food = { x: pick.x, y: pick.y };
    return true;
  }

  function createGame(config) {
    const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
    cfg.rand = cfg.rand || Math.random;
    const state = {
      cfg: cfg,
      rand: cfg.rand,
      status: STATES.IDLE,
      cause: null,
      dir: toDir(cfg.startDir) || DIRECTIONS.RIGHT,
      pendingDir: null,
      turnLocked: false,
      snake: [],
      food: null,
      score: 0,
      best: Math.max(0, Number(cfg.bestScore) || 0),
      ticks: 0
    };
    state.snake = buildSnake(state);
    placeFood(state);
    return state;
  }

  function start(state, dir) {
    if (state.status !== STATES.IDLE) return false;
    const wanted = toDir(dir);
    if (wanted && !isReverseOf(state.dir, wanted)) state.pendingDir = wanted;
    state.status = STATES.PLAYING;
    return true;
  }

  function turn(state, dir) {
    const wanted = toDir(dir);
    if (!wanted) return false;
    if (state.status !== STATES.PLAYING && state.status !== STATES.PAUSED) return false;
    if (isReverseOf(state.dir, wanted)) return false;
    if (sameDir(state.dir, wanted)) return false;
    if (state.turnLocked) return false;
    if (state.pendingDir && state.pendingDir.name !== wanted.name) return false;
    state.pendingDir = wanted;
    state.turnLocked = true;
    return true;
  }

  function occupiedAt(state, x, y, checkedCount) {
    for (let i = 0; i < checkedCount; i++) {
      const cell = state.snake[i];
      if (cell.x === x && cell.y === y) return true;
    }
    return false;
  }

  function tick(state) {
    const out = {
      moved: false,
      ate: false,
      died: false,
      status: state.status,
      cause: null,
      score: state.score,
      best: state.best,
      length: state.snake.length,
      tickMs: tickMs(state)
    };
    if (state.status !== STATES.PLAYING) return out;

    if (state.pendingDir) {
      state.dir = state.pendingDir;
      state.pendingDir = null;
    }
    state.turnLocked = false;

    const cfg = state.cfg;
    const head = state.snake[0];
    const nx = head.x + state.dir.x;
    const ny = head.y + state.dir.y;

    if (nx < 0 || ny < 0 || nx >= cfg.cols || ny >= cfg.rows) {
      finish(state, STATES.GAME_OVER, 'wall');
      out.died = true;
      out.cause = 'wall';
      out.status = state.status;
      out.score = state.score;
      out.best = state.best;
      return out;
    }

    const eats = !!state.food && state.food.x === nx && state.food.y === ny;
    // 不吃食物时蛇尾本节拍会移走，因此尾格豁免自撞判定（PRD §4.5）
    const checkedCount = eats ? state.snake.length : state.snake.length - 1;
    if (occupiedAt(state, nx, ny, checkedCount)) {
      finish(state, STATES.GAME_OVER, 'self');
      out.died = true;
      out.cause = 'self';
      out.status = state.status;
      out.score = state.score;
      out.best = state.best;
      return out;
    }

    state.snake.unshift({ x: nx, y: ny });
    if (eats) {
      state.score += cfg.scorePerFood;
      out.ate = true;
      if (state.score > state.best) state.best = state.score;
      placeFood(state);
    } else {
      state.snake.pop();
    }

    state.ticks += 1;
    out.moved = true;
    out.status = state.status;
    out.score = state.score;
    out.best = state.best;
    out.length = state.snake.length;
    return out;
  }

  function pause(state) {
    if (state.status !== STATES.PLAYING) return false;
    state.status = STATES.PAUSED;
    return true;
  }

  function resume(state) {
    if (state.status !== STATES.PAUSED) return false;
    state.status = STATES.PLAYING;
    return true;
  }

  function togglePause(state) {
    if (state.status === STATES.PLAYING) return pause(state);
    if (state.status === STATES.PAUSED) return resume(state);
    return false;
  }

  function restart(state) {
    const cfg = state.cfg;
    const best = Math.max(state.best, state.score);
    state.status = STATES.PLAYING;
    state.cause = null;
    state.dir = toDir(cfg.startDir) || DIRECTIONS.RIGHT;
    state.pendingDir = null;
    state.turnLocked = false;
    state.score = 0;
    state.best = best;
    state.ticks = 0;
    state.snake = buildSnake(state);
    state.food = null;
    placeFood(state);
    return state;
  }

  function tickMs(state) {
    const cfg = state.cfg;
    if (!cfg.speedEnabled || !cfg.speedEveryScore || !cfg.speedReduceMs) return cfg.baseTickMs;
    const steps = Math.floor(state.score / cfg.speedEveryScore);
    return Math.max(cfg.minTickMs, cfg.baseTickMs - steps * cfg.speedReduceMs);
  }

  function foodCount(state) {
    return state.food ? 1 : 0;
  }

  function isOver(state) {
    return state.status === STATES.GAME_OVER || state.status === STATES.WON;
  }

  const SnakeGame = {
    STATES: STATES,
    DIRECTIONS: DIRECTIONS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    createGame: createGame,
    start: start,
    turn: turn,
    tick: tick,
    pause: pause,
    resume: resume,
    togglePause: togglePause,
    restart: restart,
    tickMs: tickMs,
    foodCount: foodCount,
    isOver: isOver,
    isReverseOf: isReverseOf,
    emptyCells: emptyCells
  };

  // 双导出：浏览器走全局，Node 走 module.exports（页面零构建、测试零依赖）
  if (typeof module !== 'undefined' && module.exports) module.exports = SnakeGame;
  else root.SnakeGame = SnakeGame;
})(typeof window !== 'undefined' ? window : globalThis);
