/* Node 原生断言：机械化回归规则类验收标准（PRD §5 环境受限项替代覆盖）
   运行：node tests/game.test.js   —— 无任何第三方依赖 */
'use strict';

const assert = require('assert');
const path = require('path');
const SnakeGame = require(path.join(__dirname, '..', 'src', 'game.js'));

const S = SnakeGame.STATES;
const D = SnakeGame.DIRECTIONS;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('ok   ' + name);
}

function makeState(over) {
  const s = SnakeGame.createGame(Object.assign({ cols: 10, rows: 8, rand: () => 0 }, over && over.config));
  s.status = S.PLAYING;
  if (over && over.snake) s.snake = over.snake.map(function (p) { return { x: p[0], y: p[1] }; });
  if (over && over.dir) s.dir = D[over.dir];
  if (over && over.food) s.food = { x: over.food[0], y: over.food[1] };
  if (over && over.score !== undefined) s.score = over.score;
  return s;
}

test('AC-01 IDLE 初始态：3 格、朝右、位于左上、分数 0、恰好 1 个食物且不与蛇重叠、蛇不移动', function () {
  const s = SnakeGame.createGame();
  assert.strictEqual(s.cfg.cols, 20);
  assert.strictEqual(s.cfg.rows, 15);
  assert.strictEqual(s.status, S.IDLE);
  assert.strictEqual(s.snake.length, 3);
  assert.deepStrictEqual(s.snake[0], { x: 2, y: 2 });
  assert.strictEqual(s.dir.name, 'RIGHT');
  assert.strictEqual(s.score, 0);
  assert.strictEqual(SnakeGame.foodCount(s), 1);
  assert.strictEqual(SnakeGame.emptyCells(s).length, 20 * 15 - 3);
  const before = JSON.stringify(s.snake);
  const ev = SnakeGame.tick(s);
  assert.strictEqual(ev.moved, false);
  assert.strictEqual(JSON.stringify(s.snake), before);
});

test('AC-02 IDLE 按方向键即进入 PLAYING，反向键不回退方向', function () {
  const s = SnakeGame.createGame();
  assert.strictEqual(SnakeGame.start(s, 'UP'), true);
  assert.strictEqual(s.status, S.PLAYING);
  assert.strictEqual(s.pendingDir.name, 'UP');
  const t = SnakeGame.createGame();
  SnakeGame.start(t, 'LEFT');
  assert.strictEqual(t.status, S.PLAYING);
  assert.strictEqual(t.pendingDir, null);
  assert.strictEqual(t.dir.name, 'RIGHT');
});

test('AC-02 撞墙结束后 start 无效，只能靠 restart 再玩', function () {
  const s = makeState({ snake: [[9, 1], [8, 1], [7, 1]], dir: 'RIGHT', food: [1, 6] });
  SnakeGame.tick(s);
  assert.strictEqual(s.status, S.GAME_OVER);
  assert.strictEqual(SnakeGame.start(s, 'UP'), false);
});

test('AC-05 转向在下一个节拍生效；同一节拍内两个合法方向仅第一个生效', function () {
  const s = makeState({ snake: [[2, 4], [1, 4], [0, 4]], dir: 'RIGHT', food: [9, 7] });
  assert.strictEqual(SnakeGame.turn(s, 'UP'), true);
  assert.strictEqual(s.snake[0].x, 2);
  assert.strictEqual(s.snake[0].y, 4);
  assert.strictEqual(SnakeGame.turn(s, 'DOWN'), false);
  SnakeGame.tick(s);
  assert.deepStrictEqual(s.snake[0], { x: 2, y: 3 });
});

test('AC-06 四组 180° 反向：不改向、不判负、按原方向继续前进', function () {
  const cases = [
    { dir: 'RIGHT', press: 'LEFT', keep: 'RIGHT' },
    { dir: 'LEFT', press: 'RIGHT', keep: 'LEFT' },
    { dir: 'UP', press: 'DOWN', keep: 'UP' },
    { dir: 'DOWN', press: 'UP', keep: 'DOWN' }
  ];
  for (const c of cases) {
    const head = c.dir === 'RIGHT' ? [3, 3] : c.dir === 'LEFT' ? [6, 3] : c.dir === 'UP' ? [4, 4] : [4, 2];
    const back = D[c.dir];
    const body = [head, [head[0] - back.x, head[1] - back.y], [head[0] - 2 * back.x, head[1] - 2 * back.y]];
    const s = makeState({ snake: body, dir: c.dir, food: [9, 7] });
    assert.strictEqual(SnakeGame.turn(s, c.press), false);
    const ev = SnakeGame.tick(s);
    assert.strictEqual(s.status, S.PLAYING, c.dir + ' 按 ' + c.press + ' 不应判负');
    assert.strictEqual(ev.moved, true);
    assert.strictEqual(s.dir.name, c.keep);
    assert.strictEqual(s.pendingDir, null);
  }
});

test('AC-08/09 吃 N 个食物：蛇长 = 3+N 且分数 = 10N，食物始终恰好 1 个且在蛇身之外', function () {
  const s = SnakeGame.createGame();
  SnakeGame.start(s);
  const N = 6;
  for (let i = 1; i <= N; i++) {
    const head = s.snake[0];
    s.dir = D.RIGHT;
    s.pendingDir = null;
    s.food = { x: head.x + 1, y: head.y };
    const ev = SnakeGame.tick(s);
    assert.strictEqual(ev.ate, true, '第 ' + i + ' 次应吃到食物');
    assert.strictEqual(s.snake.length, 3 + i);
    assert.strictEqual(s.score, 10 * i);
    assert.strictEqual(SnakeGame.foodCount(s), 1);
    const onSnake = s.snake.some(function (c) { return c.x === s.food.x && c.y === s.food.y; });
    assert.strictEqual(onSnake, false, '食物不得落在蛇身内');
  }
});

test('AC-11 上下左右四向撞墙均在下一节拍 GAME_OVER，分数定格且蛇停止移动', function () {
  const edges = [
    { dir: 'RIGHT', head: [9, 3] },
    { dir: 'LEFT', head: [0, 3] },
    { dir: 'UP', head: [4, 0] },
    { dir: 'DOWN', head: [4, 7] }
  ];
  for (const e of edges) {
    const back = D[e.dir];
    const s = makeState({
      snake: [e.head, [e.head[0] - back.x, e.head[1] - back.y], [e.head[0] - 2 * back.x, e.head[1] - 2 * back.y]],
      dir: e.dir,
      food: [1, 1],
      score: 70
    });
    const ev = SnakeGame.tick(s);
    assert.strictEqual(ev.died, true, e.dir + ' 应撞墙判负');
    assert.strictEqual(ev.cause, 'wall');
    assert.strictEqual(s.status, S.GAME_OVER);
    assert.strictEqual(s.score, 70);
    const before = JSON.stringify(s.snake);
    const again = SnakeGame.tick(s);
    assert.strictEqual(again.moved, false);
    assert.strictEqual(JSON.stringify(s.snake), before);
  }
});

test('AC-12 蛇长 ≥5 撞自身蛇身判负；撞本节拍刚移走的蛇尾格不判负', function () {
  const hitBody = makeState({
    snake: [[2, 1], [1, 1], [1, 2], [2, 2], [2, 0], [3, 0]],
    dir: 'UP',
    food: [9, 7]
  });
  assert.ok(hitBody.snake.length >= 5);
  const ev = SnakeGame.tick(hitBody);
  assert.strictEqual(ev.died, true);
  assert.strictEqual(ev.cause, 'self');
  assert.strictEqual(hitBody.status, S.GAME_OVER);

  const tailCell = makeState({
    snake: [[2, 1], [1, 1], [1, 2], [2, 2], [2, 0]],
    dir: 'UP',
    food: [9, 7]
  });
  const ev2 = SnakeGame.tick(tailCell);
  assert.strictEqual(ev2.died, false, '蛇尾本节拍移走，不得判负');
  assert.strictEqual(ev2.moved, true);
  assert.strictEqual(tailCell.status, S.PLAYING);
  assert.deepStrictEqual(tailCell.snake[0], { x: 2, y: 0 });
});

test('AC-10 蛇填满整个棋盘判胜利（不报错、不死循环、等同 GAME_OVER 停止）', function () {
  const s = SnakeGame.createGame({ cols: 3, rows: 3, rand: () => 0 });
  s.status = S.PLAYING;
  s.snake = [[2, 1], [2, 0], [1, 0], [0, 0], [0, 1], [1, 1], [1, 2], [0, 2]]
    .map(function (p) { return { x: p[0], y: p[1] }; });
  s.dir = D.DOWN;
  s.pendingDir = null;
  s.score = 70;
  s.food = { x: 2, y: 2 };
  const ev = SnakeGame.tick(s);
  assert.strictEqual(ev.ate, true);
  assert.strictEqual(s.status, S.WON);
  assert.strictEqual(SnakeGame.isOver(s), true);
  assert.strictEqual(s.snake.length, 9);
  assert.strictEqual(SnakeGame.foodCount(s), 0, '满盘后无空格可放食物');
  const again = SnakeGame.tick(s);
  assert.strictEqual(again.moved, false, '胜利后不得继续移动');
});

test('AC-03/04 重开：回到 PLAYING、蛇恢复 3 格、分数归 0、最高分保留', function () {
  const s = makeState({ snake: [[9, 3], [8, 3], [7, 3]], dir: 'RIGHT', food: [1, 1], score: 120 });
  SnakeGame.tick(s);
  assert.strictEqual(s.status, S.GAME_OVER);
  assert.strictEqual(s.best, 120);
  SnakeGame.restart(s);
  assert.strictEqual(s.status, S.PLAYING);
  assert.strictEqual(s.score, 0);
  assert.strictEqual(s.best, 120);
  assert.strictEqual(s.snake.length, 3);
  assert.strictEqual(SnakeGame.foodCount(s), 1);
  SnakeGame.restart(s);
  assert.strictEqual(s.best, 120, '同一局内再次重开最高分不清零');
});

test('AC-13 速度曲线：每 50 分节拍 -10ms，下限 80ms；未启用时全程 150ms', function () {
  const s = makeState({ snake: [[2, 2], [1, 2], [0, 2]], dir: 'RIGHT', food: [9, 7] });
  const expect = [[0, 150], [40, 150], [50, 140], [100, 130], [300, 90], [350, 80], [400, 80], [1000, 80]];
  for (const e of expect) {
    s.score = e[0];
    assert.strictEqual(SnakeGame.tickMs(s), e[1], 'score=' + e[0]);
  }
  const off = SnakeGame.createGame({ speedEnabled: false });
  off.score = 500;
  assert.strictEqual(SnakeGame.tickMs(off), 150);
});

test('AC-15 暂停/继续：暂停中蛇静止、方向键只登记一次有效转向，恢复后不改蛇长与分数', function () {
  const s = makeState({ snake: [[2, 2], [1, 2], [0, 2]], dir: 'RIGHT', food: [9, 7], score: 60 });
  assert.strictEqual(SnakeGame.pause(s), true);
  assert.strictEqual(s.status, S.PAUSED);
  const ev = SnakeGame.tick(s);
  assert.strictEqual(ev.moved, false);
  assert.strictEqual(SnakeGame.turn(s, 'UP'), true);
  assert.strictEqual(SnakeGame.turn(s, 'DOWN'), false, '暂停期间只登记一次转向');
  assert.strictEqual(SnakeGame.resume(s), true);
  assert.strictEqual(s.score, 60);
  assert.strictEqual(s.snake.length, 3);
  SnakeGame.tick(s);
  assert.deepStrictEqual(s.snake[0], { x: 2, y: 1 });
});

test('食物随机源可注入：rand=0 取首个空格，rand 接近 1 时索引不越界', function () {
  const a = SnakeGame.createGame({ cols: 5, rows: 4, rand: () => 0 });
  assert.deepStrictEqual(a.food, SnakeGame.emptyCells(a)[0]);
  const b = SnakeGame.createGame({ cols: 5, rows: 4, rand: () => 0.99999 });
  assert.ok(b.food.x >= 0 && b.food.x < 5 && b.food.y >= 0 && b.food.y < 4);
  const onSnake = b.snake.some(function (c) { return c.x === b.food.x && c.y === b.food.y; });
  assert.strictEqual(onSnake, false);
});

console.log('\n' + passed + ' 项断言组全部通过');
