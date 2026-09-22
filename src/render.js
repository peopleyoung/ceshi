/* Canvas 渲染薄壳：只读取 state 做绘制，不含任何游戏规则（规则唯一真值在 src/game.js） */
(function (root) {
  'use strict';

  // 视觉基线：PRD §4.1 仅约束"对比色、蛇头蛇身可区分、无图片素材"
  const PALETTE = {
    board: '#0f172a',
    grid: 'rgba(148, 163, 184, 0.12)',
    snakeBody: '#22c55e',
    snakeHead: '#bbf7d0',
    food: '#ef4444'
  };

  function mount(canvas, options) {
    const opts = options || {};
    const ctx = canvas.getContext('2d');
    const colors = Object.assign({}, PALETTE, opts.colors || {});

    function cellSize(state) {
      return canvas.width / state.cfg.cols;
    }

    function drawCell(state, cell, color, inset) {
      const size = cellSize(state);
      ctx.fillStyle = color;
      ctx.fillRect(
        cell.x * size + inset,
        cell.y * size + inset,
        size - inset * 2,
        size - inset * 2
      );
    }

    function draw(state) {
      const cols = state.cfg.cols;
      const rows = state.cfg.rows;
      const size = cellSize(state);

      ctx.fillStyle = colors.board;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < cols; x++) {
        ctx.moveTo(x * size + 0.5, 0);
        ctx.lineTo(x * size + 0.5, canvas.height);
      }
      for (let y = 1; y < rows; y++) {
        ctx.moveTo(0, y * size + 0.5);
        ctx.lineTo(canvas.width, y * size + 0.5);
      }
      ctx.stroke();

      if (state.food) {
        ctx.fillStyle = colors.food;
        ctx.beginPath();
        ctx.arc(
          state.food.x * size + size / 2,
          state.food.y * size + size / 2,
          size * 0.34,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      for (let i = state.snake.length - 1; i >= 1; i--) {
        drawCell(state, state.snake[i], colors.snakeBody, size * 0.08);
      }
      if (state.snake.length) {
        drawCell(state, state.snake[0], colors.snakeHead, size * 0.04);
      }
    }

    return { draw: draw, colors: colors };
  }

  root.SnakeRender = { mount: mount, PALETTE: PALETTE };
})(window);
