/* Snake game core: pure logic, free of DOM and storage APIs. Loadable as a classic script
   (exposes SnakeGame) or by Node (module.exports) so the rules can be asserted headlessly. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SnakeGame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 20;
  var ROWS = 15;
  var START_LEN = 3;
  var BASE_INTERVAL = 150;
  var SPEED_PER_SCORE = 50;
  var SPEED_STEP = 10;
  var MIN_INTERVAL = 80;
  var SCORE_PER_FOOD = 10;

  var DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function occupied(snake, x, y) {
    for (var i = 0; i < snake.length; i++) {
      if (snake[i].x === x && snake[i].y === y) return true;
    }
    return false;
  }

  function createGame(opts) {
    opts = opts || {};
    var cols = opts.cols || COLS;
    var rows = opts.rows || ROWS;
    var startLength = opts.startLength || START_LEN;
    var rand = opts.rand || Math.random;

    var snake = opts.snake
      ? opts.snake.map(function (c) { return { x: c.x, y: c.y }; })
      : (function () {
        var cells = [];
        var headX = Math.min(startLength - 1, cols - 1);
        for (var i = 0; i < startLength; i++) {
          cells.push({ x: headX - i, y: (rows - 1) >> 1 });
        }
        return cells;
      })();

    var dir = opts.dir || (snake.length > 1
      ? (snake[0].x > snake[1].x ? 'right' : snake[0].x < snake[1].x ? 'left'
        : snake[0].y > snake[1].y ? 'down' : 'up')
      : 'right');

    var game = {
      cols: cols,
      rows: rows,
      status: 'IDLE',
      snake: snake,
      dir: dir,
      pending: null,
      food: null,
      score: 0,
      intervalMs: BASE_INTERVAL,
      eaten: 0
    };

    function freeCells(excludeHead) {
      var cells = [];
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          if (excludeHead && x === snake[0].x && y === snake[0].y) continue;
          if (!occupied(snake, x, y)) cells.push({ x: x, y: y });
        }
      }
      return cells;
    }

    game.spawnFood = function () {
      var free = freeCells(false);
      if (!free.length) {
        game.food = null;
        return null;
      }
      game.food = free[Math.floor(rand() * free.length) % free.length];
      return game.food;
    };

    game.intervalFor = function (score) {
      var faster = BASE_INTERVAL - Math.floor(score / SPEED_PER_SCORE) * SPEED_STEP;
      return faster < MIN_INTERVAL ? MIN_INTERVAL : faster;
    };

    game.turn = function (next) {
      if (!DIRS[next]) return false;
      if (game.status !== 'RUNNING' && game.status !== 'IDLE') return false;
      var current = game.pending || game.dir;
      if (next === current || next === OPPOSITE[current]) return false;
      if (game.pending) return false;
      game.pending = next;
      return true;
    };

    game.start = function (next) {
      if (game.status !== 'IDLE') return false;
      if (next && DIRS[next] && next !== OPPOSITE[game.dir]) game.dir = next;
      game.status = 'RUNNING';
      return true;
    };

    game.pause = function () {
      if (game.status !== 'RUNNING') return false;
      game.status = 'PAUSED';
      return true;
    };

    game.resume = function () {
      if (game.status !== 'PAUSED') return false;
      game.status = 'RUNNING';
      return true;
    };

    game.restart = function () {
      var length = startLength;
      var headX = Math.min(length - 1, cols - 1);
      snake.length = 0;
      for (var i = 0; i < length; i++) {
        snake.push({ x: headX - i, y: (rows - 1) >> 1 });
      }
      game.snake = snake;
      game.dir = 'right';
      game.pending = null;
      game.score = 0;
      game.eaten = 0;
      game.intervalMs = BASE_INTERVAL;
      game.status = 'IDLE';
      game.spawnFood();
      return true;
    };

    game.step = function () {
      if (game.status !== 'RUNNING') {
        return { moved: false, ate: false, died: false, won: false, status: game.status };
      }
      if (game.pending) {
        if (game.pending !== OPPOSITE[game.dir]) game.dir = game.pending;
        game.pending = null;
      }
      var vec = DIRS[game.dir];
      var head = snake[0];
      var nextX = head.x + vec.x;
      var nextY = head.y + vec.y;

      if (nextX < 0 || nextY < 0 || nextX >= cols || nextY >= rows) {
        game.status = 'OVER';
        return { moved: false, ate: false, died: true, won: false, status: 'OVER' };
      }
      var eats = !!game.food && game.food.x === nextX && game.food.y === nextY;
      // A non-eating step frees the tail cell, so moving into it is legal.
      var last = snake.length - 1;
      for (var i = 0; i < (eats ? snake.length : last); i++) {
        if (snake[i].x === nextX && snake[i].y === nextY) {
          game.status = 'OVER';
          return { moved: false, ate: false, died: true, won: false, status: 'OVER' };
        }
      }

      snake.unshift({ x: nextX, y: nextY });
      if (eats) {
        game.score += SCORE_PER_FOOD;
        game.eaten += 1;
        game.intervalMs = game.intervalFor(game.score);
        game.spawnFood();
        if (!game.food) {
          game.status = 'WIN';
          return { moved: true, ate: true, died: false, won: true, status: 'WIN' };
        }
      } else {
        snake.pop();
      }
      return { moved: true, ate: eats, died: false, won: false, status: game.status };
    };

    if (opts.food) {
      game.food = { x: opts.food.x, y: opts.food.y };
    } else {
      game.spawnFood();
    }
    return game;
  }

  return {
    constants: {
      COLS: COLS,
      ROWS: ROWS,
      START_LEN: START_LEN,
      BASE_INTERVAL: BASE_INTERVAL,
      SPEED_PER_SCORE: SPEED_PER_SCORE,
      SPEED_STEP: SPEED_STEP,
      MIN_INTERVAL: MIN_INTERVAL,
      SCORE_PER_FOOD: SCORE_PER_FOOD,
      DIRS: DIRS
    },
    createGame: createGame
  };
});
