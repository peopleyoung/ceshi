/* Node-only assertions for the game core (no browser needed). Run: node test/snake.test.js */
'use strict';

var assert = require('assert');
var SnakeGame = require('../js/snake.js');
var C = SnakeGame.constants;

var passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log('PASS ' + label);
}

function head(game) {
  return game.snake[0];
}

function onSnake(game, x, y) {
  return game.snake.some(function (cell) { return cell.x === x && cell.y === y; });
}

function assertFoodValid(game) {
  assert.ok(game.food, 'food exists');
  assert.ok(game.food.x >= 0 && game.food.x < C.COLS, 'food inside columns');
  assert.ok(game.food.y >= 0 && game.food.y < C.ROWS, 'food inside rows');
  assert.ok(!onSnake(game, game.food.x, game.food.y), 'food is not on the snake');
}

// Head at headX with the body trailing to the left, i.e. travelling right.
function rightward(headX, y, len) {
  var cells = [];
  for (var i = 0; i < len; i++) cells.push({ x: headX - i, y: y });
  return cells;
}

// Head at headX with the body trailing to the right, i.e. travelling left.
function leftward(headX, y, len) {
  var cells = [];
  for (var i = 0; i < len; i++) cells.push({ x: headX + i, y: y });
  return cells;
}

function board(snake, dir, food) {
  return SnakeGame.createGame({ snake: snake, dir: dir, food: food });
}

function runningGame() {
  var game = board(rightward(5, 7, C.START_LEN), 'right', { x: 0, y: 0 });
  game.start();
  return game;
}

check('AC-01 initial IDLE state: 20x15 board, snake of 3 facing right, score 0', function () {
  var game = SnakeGame.createGame({});
  assert.strictEqual(game.status, 'IDLE');
  assert.strictEqual(C.COLS, 20);
  assert.strictEqual(C.ROWS, 15);
  assert.strictEqual(game.snake.length, C.START_LEN);
  assert.strictEqual(game.score, 0);
  assert.strictEqual(game.dir, 'right');
  assert.strictEqual(game.intervalMs, C.BASE_INTERVAL);
  var ys = game.snake.map(function (cell) { return cell.y; });
  assert.ok(ys.every(function (y) { return y === ys[0]; }), 'snake is horizontal');
  assert.ok(head(game).x > game.snake[1].x, 'head is the rightmost cell');
  assert.ok(game.snake.every(function (cell) { return cell.x >= 0 && cell.y >= 0; }), 'snake on the board');
  assertFoodValid(game);
});

check('AC-02 the first direction key starts the round and one tick advances 1 cell', function () {
  var game = board(rightward(5, 7, C.START_LEN), 'right', { x: 0, y: 0 });
  assert.strictEqual(game.start('right'), true);
  assert.strictEqual(game.status, 'RUNNING');
  var before = head(game).x;
  game.step();
  assert.strictEqual(head(game).x, before + 1);
});

check('AC-05 a turn lands on the next tick and only the first key of a tick counts', function () {
  var game = runningGame();
  assert.strictEqual(game.turn('up'), true);
  assert.strictEqual(game.turn('down'), false, 'a second key in the same tick is dropped');
  assert.strictEqual(head(game).y, 7, 'nothing moves before the tick');
  game.step();
  assert.strictEqual(game.dir, 'up');
  assert.strictEqual(head(game).y, 6);
  assert.strictEqual(game.pending, null, 'the queue drains each tick');
});

check('AC-06 a 180-degree reversal is refused, directly and via a queued turn', function () {
  var game = runningGame();
  assert.strictEqual(game.turn('left'), false);
  game.step();
  assert.strictEqual(game.dir, 'right');
  assert.strictEqual(game.turn('up'), true);
  assert.strictEqual(game.turn('down'), false, 'cannot reverse against the queued direction');
  game.step();
  assert.strictEqual(game.dir, 'up');
});

check('AC-08 eating grants +10 points, +1 length and a fresh non-overlapping food', function () {
  var game = board(rightward(5, 7, C.START_LEN), 'right', { x: 6, y: 7 });
  game.start();
  var res = game.step();
  assert.strictEqual(res.ate, true);
  assert.strictEqual(game.score, 10);
  assert.strictEqual(game.snake.length, C.START_LEN + 1);
  assertFoodValid(game);
});

check('AC-09 eating N foods gives length 3+N and score 10*N', function () {
  var game = runningGame();
  for (var n = 1; n <= 12; n++) {
    game.food = { x: head(game).x + 1, y: head(game).y };
    assert.strictEqual(game.step().ate, true, 'step ' + n + ' eats');
    assert.strictEqual(game.snake.length, C.START_LEN + n);
    assert.strictEqual(game.score, 10 * n);
  }
});

check('AC-10 filling all 300 cells of the 20x15 board reports WIN without throwing', function () {
  var path = [];
  for (var y = 0; y < C.ROWS; y++) {
    for (var i = 0; i < C.COLS; i++) {
      path.push({ x: y % 2 === 0 ? i : C.COLS - 1 - i, y: y });
    }
  }
  assert.strictEqual(path.length, C.COLS * C.ROWS);
  var body = path.slice(0, path.length - 1).reverse();
  var food = path[path.length - 1];
  var dx = food.x - body[0].x;
  var dy = food.y - body[0].y;
  var dir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
  var game = board(body, dir, food);
  game.start();
  var res = game.step();
  assert.strictEqual(res.won, true);
  assert.strictEqual(game.status, 'WIN');
  assert.strictEqual(game.snake.length, C.COLS * C.ROWS);
  assert.strictEqual(game.food, null, 'no free cell left for the next food');
});

check('AC-11 hitting any of the four walls ends the round', function () {
  var cases = [
    { name: 'right wall', snake: rightward(C.COLS - 1, 7, 3), dir: 'right' },
    { name: 'left wall', snake: leftward(0, 7, 3), dir: 'left' },
    { name: 'bottom wall', snake: [{ x: 5, y: C.ROWS - 1 }, { x: 5, y: C.ROWS - 2 }, { x: 5, y: C.ROWS - 3 }], dir: 'down' },
    { name: 'top wall', snake: [{ x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 }], dir: 'up' }
  ];
  cases.forEach(function (c) {
    var game = board(c.snake, c.dir, { x: 0, y: 14 });
    game.start();
    var res = game.step();
    assert.strictEqual(res.died, true, c.name);
    assert.strictEqual(game.status, 'OVER');
    assert.strictEqual(res.moved, false, c.name + ' leaves the snake in place');
  });
});

check('AC-12 a mid-body hit is fatal while the vacating tail cell is exempt', function () {
  // Same 5-cell hook; the head enters (6,4), which is the tail in one arrangement
  // and a mid-body cell in the other.
  var tailCase = [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }];
  var midCase = [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 7, y: 4 }];

  var survives = board(tailCase, 'right', { x: 0, y: 0 });
  survives.start();
  var alive = survives.step();
  assert.strictEqual(alive.died, false, 'moving into the cell the tail just freed is legal');
  assert.strictEqual(survives.status, 'RUNNING');
  assert.strictEqual(survives.snake.length, tailCase.length);

  var dies = board(midCase, 'right', { x: 0, y: 0 });
  dies.start();
  var fatal = dies.step();
  assert.strictEqual(fatal.died, true, 'the same cell occupied by a body segment is fatal');
  assert.strictEqual(dies.status, 'OVER');
});

check('AC-13 tempo speeds up by 10ms every 50 points and floors at 80ms', function () {
  var game = SnakeGame.createGame({});
  assert.strictEqual(game.intervalFor(0), 150);
  assert.strictEqual(game.intervalFor(40), 150);
  assert.strictEqual(game.intervalFor(50), 140);
  assert.strictEqual(game.intervalFor(100), 130);
  assert.strictEqual(game.intervalFor(350), 80);
  assert.strictEqual(game.intervalFor(10000), C.MIN_INTERVAL);

  var play = runningGame();
  for (var n = 1; n <= 5; n++) {
    play.food = { x: head(play).x + 1, y: head(play).y };
    play.step();
  }
  assert.strictEqual(play.score, 50);
  assert.strictEqual(play.intervalMs, 140, 'the live interval follows the score');
});

check('AC-15 pause holds every field untouched and resume continues the round', function () {
  var game = runningGame();
  game.food = { x: 2, y: 2 };
  game.turn('up');
  var snapshot = JSON.stringify(playState(game));
  assert.strictEqual(game.pause(), true);
  assert.strictEqual(game.step().moved, false, 'a tick while paused does nothing');
  assert.strictEqual(JSON.stringify(playState(game)), snapshot, 'every play field is untouched while paused');
  assert.strictEqual(game.turn('down'), false, 'no steering while paused');
  assert.strictEqual(game.resume(), true);
  var y = head(game).y;
  game.step();
  assert.strictEqual(head(game).y, y - 1, 'the queued turn still applies after resuming');
});

check('AC-03/AC-04 restart rebuilds the round while the caller keeps the high score', function () {
  var game = runningGame();
  game.food = { x: 6, y: 7 };
  game.step();
  assert.strictEqual(game.score, 10);
  game.food = { x: 0, y: 0 };
  for (var guard = 0; game.status === 'RUNNING' && guard < 40; guard++) game.step();
  assert.strictEqual(game.status, 'OVER');
  assert.strictEqual(game.restart(), true);
  assert.strictEqual(game.status, 'IDLE');
  assert.strictEqual(game.score, 0);
  assert.strictEqual(game.snake.length, C.START_LEN);
  assert.strictEqual(game.dir, 'right');
  assert.strictEqual(game.intervalMs, C.BASE_INTERVAL);
  assert.strictEqual(game.pending, null);
  assertFoodValid(game);
  assert.notStrictEqual(game.food.x, 6, 'the restarted round is independent of the last one');
  game.start('right');
  assert.strictEqual(game.step().moved, true);
});

check('AC-21 a keyboard-driven round runs end to end through the core only', function () {
  var game = runningGame();
  var ticks = 0;
  while (game.status === 'RUNNING' && ticks < 40) {
    game.step();
    ticks++;
  }
  assert.strictEqual(game.status, 'OVER');
  assert.ok(ticks > 0 && ticks <= C.COLS, 'the snake travelled the open board before the wall');
});

check('AC-20 the core has no browser or network dependency at all', function () {
  var src = require('fs').readFileSync(require.resolve('../js/snake.js'), 'utf8');
  var browserGlobals = src.match(/\b(document|window|localStorage|fetch|XMLHttpRequest)\b/g) || [];
  assert.deepStrictEqual(browserGlobals, [], 'core references no browser global');
  assert.strictEqual(typeof SnakeGame.createGame, 'function');
});

// Everything except status, which is the pause flag itself.
function playState(game) {
  return {
    snake: game.snake,
    dir: game.dir,
    pending: game.pending,
    food: game.food,
    score: game.score,
    intervalMs: game.intervalMs,
    eaten: game.eaten
  };
}

console.log('\n' + passed + ' checks passed across ' + Object.keys(require.cache).length + ' loaded modules');
