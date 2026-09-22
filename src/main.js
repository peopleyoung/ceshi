/* 装配层：事件绑定、节拍循环、HUD/覆盖层、最高分持久化。规则一律委托给 SnakeGame */
(function () {
  'use strict';

  const G = window.SnakeGame;
  const STATES = G.STATES;
  const BEST_KEY = 'snake.bestScore';
  const CELL = 24;
  const SWIPE_THRESHOLD = 24;

  const canvas = document.getElementById('board');
  const els = {
    score: document.getElementById('score'),
    best: document.getElementById('best'),
    status: document.getElementById('status'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlayTitle'),
    overlayText: document.getElementById('overlayText'),
    primaryBtn: document.getElementById('primaryBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    restartBtn: document.getElementById('restartBtn')
  };

  // 棋盘尺寸可由 ?cols=&rows= 覆盖，仅为测试构造小棋盘复测满盘胜利（AC-10），默认严格 20x15
  function readSize(name, fallback) {
    const raw = Number(new URLSearchParams(window.location.search).get(name));
    if (!Number.isFinite(raw)) return fallback;
    return Math.min(40, Math.max(5, Math.floor(raw)));
  }

  function loadBest() {
    try {
      const stored = window.localStorage.getItem(BEST_KEY);
      const value = Number(stored);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (err) {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch (err) {
      // 隐私模式或存储受限：降级为仅同会话内存保留（AC-17 要求控制台无未捕获报错）
    }
  }

  const state = G.createGame({ cols: readSize('cols', 20), rows: readSize('rows', 15), bestScore: loadBest() });
  canvas.width = state.cfg.cols * CELL;
  canvas.height = state.cfg.rows * CELL;
  const view = window.SnakeRender.mount(canvas);

  const LABEL = {
    IDLE: '待开始',
    PLAYING: '进行中',
    PAUSED: '已暂停',
    GAME_OVER: '游戏结束',
    WON: '胜利'
  };

  let lastTs = 0;
  let carried = 0;
  const shown = { score: null, best: null, status: null };

  function syncHud() {
    if (shown.score !== state.score) {
      shown.score = state.score;
      els.score.textContent = String(state.score);
    }
    if (shown.best !== state.best) {
      shown.best = state.best;
      els.best.textContent = String(state.best);
    }
    if (shown.status !== state.status) {
      shown.status = state.status;
      els.status.textContent = LABEL[state.status];
      if (state.status === STATES.GAME_OVER || state.status === STATES.WON) saveBest(state.best);
    }
  }

  function syncOverlay() {
    const visible = state.status !== STATES.PLAYING;
    if (els.overlay.hidden === !visible) return;
    els.overlay.hidden = !visible;
    if (state.status === STATES.IDLE) {
      els.overlayTitle.textContent = '贪吃蛇';
      els.overlayText.textContent = '按任意方向键开始';
      els.primaryBtn.textContent = '开始游戏';
    } else if (state.status === STATES.PAUSED) {
      els.overlayTitle.textContent = '已暂停';
      els.overlayText.textContent = '按空格继续';
      els.primaryBtn.textContent = '继续';
    } else if (state.status === STATES.WON) {
      els.overlayTitle.textContent = '胜利！';
      els.overlayText.textContent = '本局分数 ' + state.score + ' · 最高分 ' + state.best;
      els.primaryBtn.textContent = '重新开始';
    } else if (state.status === STATES.GAME_OVER) {
      els.overlayTitle.textContent = '游戏结束';
      els.overlayText.textContent = '本局分数 ' + state.score + ' · 最高分 ' + state.best;
      els.primaryBtn.textContent = '重新开始';
    }
  }

  function begin(dir) {
    if (G.start(state, dir)) {
      carried = 0;
      lastTs = 0;
    }
  }

  function restart() {
    G.restart(state);
    carried = 0;
    lastTs = 0;
  }

  function togglePause() {
    G.togglePause(state);
    if (state.status === STATES.PLAYING) {
      carried = 0;
      lastTs = 0;
    }
  }

  function pressKey(dir) {
    if (state.status === STATES.IDLE) begin(dir);
    else G.turn(state, dir);
  }

  const KEY_DIR = {
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    w: 'UP',
    s: 'DOWN',
    a: 'LEFT',
    d: 'RIGHT',
    W: 'UP',
    S: 'DOWN',
    A: 'LEFT',
    D: 'RIGHT'
  };
  const SCROLL_KEYS = { ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true, ' ': true };

  document.addEventListener('keydown', function (event) {
    const onButton = event.target && event.target.tagName === 'BUTTON';
    if (onButton && (event.key === ' ' || event.key === 'Enter')) return;
    if (SCROLL_KEYS[event.key]) event.preventDefault();

    const dir = KEY_DIR[event.key];
    if (dir) {
      pressKey(dir);
      return;
    }
    if (event.key === ' ' || event.key === 'p' || event.key === 'P') {
      if (state.status !== STATES.IDLE && !G.isOver(state)) togglePause();
      return;
    }
    if (event.key === 'Enter' || event.key === 'r' || event.key === 'R') {
      if (G.isOver(state)) restart();
    }
  });

  els.primaryBtn.addEventListener('click', function () {
    if (state.status === STATES.IDLE) begin();
    else if (state.status === STATES.PAUSED) togglePause();
    else if (G.isOver(state)) restart();
  });

  els.pauseBtn.addEventListener('click', function () {
    if (state.status === STATES.PLAYING || state.status === STATES.PAUSED) togglePause();
  });

  els.restartBtn.addEventListener('click', function () {
    if (state.status === STATES.IDLE) begin();
    else restart();
  });

  let touchStart = null;
  canvas.addEventListener('touchstart', function (event) {
    if (event.touches.length === 1) {
      touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', function (event) {
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', function (event) {
    if (!touchStart) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - touchStart.x;
    const dy = point.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    event.preventDefault();
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP');
    pressKey(dir);
  });

  function frame(ts) {
    if (state.status === STATES.PLAYING) {
      if (!lastTs) lastTs = ts;
      carried += ts - lastTs;
      lastTs = ts;
      let budget = G.tickMs(state);
      while (carried >= budget) {
        carried -= budget;
        G.tick(state);
        budget = G.tickMs(state);
        if (state.status !== STATES.PLAYING) {
          carried = 0;
          break;
        }
      }
    } else {
      lastTs = 0;
    }
    view.draw(state);
    syncHud();
    syncOverlay();
    window.requestAnimationFrame(frame);
  }

  view.draw(state);
  syncHud();
  syncOverlay();
  window.requestAnimationFrame(frame);
})();
