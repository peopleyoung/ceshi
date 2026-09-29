#!/usr/bin/env node
/**
 * QA 浏览器冒烟与验收脚本（测试工程师交付物）
 *
 * 被测对象：`npm run build` 产出并静态托管的 dist/（对应实现 SHA e4f04ab）
 * 验证方式：完全黑盒——仅通过 DOM 状态与 Canvas 像素判定，不读取应用内部状态
 * 覆盖：开始/移动/暂停/继续/失焦自动暂停/结束/重开/吃食物计分与持久化/难度速度差异/
 *      响应式视口 360-768-1440/控制台错误/页面滚动
 *
 * 运行：
 *   cd qa && npm install && npx playwright install firefox
 *   node e2e/smoke.mjs --out <evidence-dir>
 *   （--dist 缺省指向仓库根 dist/，从任意目录运行均可）
 */
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium, firefox } from 'playwright'

const args = process.argv.slice(2)
function argValue(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = resolve(argValue('dist', resolve(SCRIPT_DIR, '..', '..', 'dist')))
const OUT_DIR = resolve(argValue('out', 'qa-e2e-output'))
const SHOT_DIR = join(OUT_DIR, 'screenshots')
const PORT = Number(argValue('port', '4399'))
const BASE = `http://127.0.0.1:${PORT}/`

const BOARD_COLS = 20
const BOARD_ROWS = 20
const PALETTE = {
  head: [124, 243, 207],
  body: [34, 211, 167],
  bodyAlt: [22, 185, 143],
  food: [251, 191, 36],
}
const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}
const DIRECTION_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
}

function startStaticServer(rootDir) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', BASE)
      let pathname = decodeURIComponent(url.pathname)
      if (pathname.endsWith('/')) pathname += 'index.html'
      const target = resolve(join(rootDir, pathname))
      if (!target.startsWith(rootDir + sep) && target !== rootDir) {
        response.writeHead(403).end('forbidden')
        return
      }
      const body = await readFile(target)
      response.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      })
      response.end(body)
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
    }
  })
  return new Promise((resolveServer) => {
    server.listen(PORT, '127.0.0.1', () => resolveServer(server))
  })
}

// ---------------------------------------------------------------------------
// 页面观测（DOM + Canvas 像素）
// ---------------------------------------------------------------------------

async function observeBoard(page) {
  return page.evaluate(
    ({ cols, rows, palette }) => {
      const canvas = document.querySelector('[data-testid="canvas"]')
      if (!canvas || typeof canvas.getContext !== 'function') {
        return { error: 'canvas-missing' }
      }
      const context = canvas.getContext('2d')
      const { width, height } = canvas
      // 单次整幅读回 + JS 采样：Firefox 下单像素 getImageData 每格调用开销高，整幅读回等价且快一个量级
      let pixels
      try {
        pixels = context.getImageData(0, 0, width, height).data
      } catch (error) {
        return { error: `canvas-readback-failed: ${String(error)}` }
      }
      const at = (x, y) => {
        const index = (y * width + x) * 4
        return [pixels[index], pixels[index + 1], pixels[index + 2]]
      }
      const cellW = width / cols
      const cellH = height / rows
      const tolerance = 16
      const matches = (rgb, target) =>
        Math.abs(rgb[0] - target[0]) <= tolerance &&
        Math.abs(rgb[1] - target[1]) <= tolerance &&
        Math.abs(rgb[2] - target[2]) <= tolerance

      const classify = (cellX, cellY) => {
        let head = 0
        let body = 0
        let food = 0
        for (const sx of [0.32, 0.5, 0.68]) {
          for (const sy of [0.32, 0.5, 0.68]) {
            const px = Math.min(width - 1, Math.max(0, Math.round((cellX + sx) * cellW)))
            const py = Math.min(height - 1, Math.max(0, Math.round((cellY + sy) * cellH)))
            const rgb = at(px, py)
            if (matches(rgb, palette.head)) head += 1
            else if (matches(rgb, palette.body) || matches(rgb, palette.bodyAlt)) {
              body += 1
            } else if (matches(rgb, palette.food)) food += 1
          }
        }
        if (head >= 4) return 'head'
        if (food >= 4) return 'food'
        if (body >= 4) return 'body'
        return null
      }

      let headCell = null
      let foodCell = null
      const snake = []
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const kind = classify(col, row)
          if (kind === 'head') {
            snake.push({ x: col, y: row })
            if (!headCell) headCell = { x: col, y: row }
          } else if (kind === 'body') {
            snake.push({ x: col, y: row })
          } else if (kind === 'food' && !foodCell) {
            foodCell = { x: col, y: row }
          }
        }
      }
      const rect = canvas.getBoundingClientRect()
      return {
        head: headCell,
        food: foodCell,
        snake,
        snakeCells: snake.length,
        canvasWidth: width,
        canvasHeight: height,
        cssWidth: Math.round(rect.width),
        dpr: globalThis.devicePixelRatio,
      }
    },
    { cols: BOARD_COLS, rows: BOARD_ROWS, palette: PALETTE },
  )
}

async function canvasDigest(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas"]')
    if (!canvas) return 'no-canvas'
    const context = canvas.getContext('2d')
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let hash = 0
    for (let index = 0; index < data.length; index += 401) {
      hash = (hash * 33 + data[index]) % 2147483647
    }
    return `${canvas.width}x${canvas.height}:${hash}`
  })
}

async function readUi(page) {
  return page.evaluate(() => {
    const text = (selector) => {
      const node = document.querySelector(selector)
      return node ? (node.textContent ?? '').trim() : null
    }
    const hidden = (selector) => {
      const node = document.querySelector(selector)
      return node ? node.hidden : null
    }
    const startButton = document.querySelector('[data-testid="start-button"]')
    const dpad = document.querySelector('[data-testid="dpad"]')
    const startRect = startButton ? startButton.getBoundingClientRect() : null
    const board = document.querySelector('[data-testid="board"]')
    const boardRect = board ? board.getBoundingClientRect() : null
    return {
      startVisible: hidden('[data-testid="start-screen"]') === false,
      modalVisible: hidden('[data-testid="status-modal"]') === false,
      modalTitle: text('#status-modal-title'),
      modalMessage: text('#status-modal-message'),
      modalScore: text('[data-testid="modal-score"]'),
      modalHighScore: text('[data-testid="modal-high-score"]'),
      modalPrimary: text('[data-testid="modal-primary"]'),
      modalSecondary: text('[data-testid="modal-secondary"]'),
      hudDifficulty: text('[data-testid="hud-difficulty"]'),
      hudScore: text('[data-testid="hud-score"]'),
      hudHighScore: text('[data-testid="hud-high-score"]'),
      pauseLabel: text('[data-testid="pause-button"]'),
      activeTestId: (() => {
        const active = document.activeElement
        return active?.getAttribute?.('data-testid') ?? active?.tagName ?? null
      })(),
      checkedDifficulty: (() => {
        const checked = document.querySelector('input[name="difficulty"]:checked')
        return checked ? checked.value : null
      })(),
      difficultyOptions: document.querySelectorAll('input[name="difficulty"]').length,
      dpadVisible: dpad ? getComputedStyle(dpad).display !== 'none' : false,
      padButtons: Array.from(document.querySelectorAll('[data-direction]')).map((button) => {
        const rect = button.getBoundingClientRect()
        return {
          direction: button.dataset.direction,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      }),
      startButtonWidth: startRect ? Math.round(startRect.width) : 0,
      boardRect: boardRect
        ? {
            left: Math.round(boardRect.left),
            right: Math.round(boardRect.right),
            width: Math.round(boardRect.width),
          }
        : null,
      scrollY: globalThis.scrollY,
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: globalThis.innerWidth,
    }
  })
}

async function waitFor(
  page,
  predicate,
  { timeout = 5000, interval = 60, label = 'condition' } = {},
) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await predicate()
    if (result) return result
    await page.waitForTimeout(interval)
  }
  throw new Error(`等待超时：${label}`)
}

/** 观察移动轨迹：持续采样蛇头，返回单格移动序列（含采样时间） */
async function watchMovement(page, durationMs) {
  const moves = []
  let last = (await observeBoard(page)).head
  const deadline = Date.now() + durationMs
  while (Date.now() < deadline) {
    const current = (await observeBoard(page)).head
    if (current && last && (current.x !== last.x || current.y !== last.y)) {
      moves.push({ from: last, to: current, at: Date.now() })
    }
    if (current) last = current
    await page.waitForTimeout(20)
  }
  return moves
}

/** 由移动序列求相邻移动的时间间隔（整格节拍近似值） */
function moveIntervals(moves) {
  const intervals = []
  for (let index = 1; index < moves.length; index += 1) {
    intervals.push(moves[index].at - moves[index - 1].at)
  }
  return intervals
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle]
}

function directionOf(step) {
  const dx = step.to.x - step.from.x
  const dy = step.to.y - step.from.y
  for (const [name, vector] of Object.entries(DIRECTION_VECTORS)) {
    if (vector.x === dx && vector.y === dy) return name
  }
  return null
}

/** 等待出现指定方向的单格移动 */
async function waitForDirection(page, direction, timeout = 2000) {
  const vector = DIRECTION_VECTORS[direction]
  let last = (await observeBoard(page)).head
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const current = (await observeBoard(page)).head
    if (current && last && current.x === last.x + vector.x && current.y === last.y + vector.y) {
      return { ok: true, from: last, to: current }
    }
    if (current) last = current
    await page.waitForTimeout(20)
  }
  return { ok: false, from: last }
}

/** 黑盒贪吃：依据像素定位食物与蛇身，BFS 寻路逐格导航，得分变化后立即结束 */
async function chaseFood(page, { maxMoves = 80 } = {}) {
  let current = 'right'
  const scoreAtStart = Number((await readUi(page)).hudScore ?? '0')
  for (let move = 0; move < maxMoves; move += 1) {
    const board = await observeBoard(page)
    if (!board.head || !board.food || board.snake.length === 0) {
      return {
        ok: false,
        reason: `观测失败 head=${JSON.stringify(board.head)} food=${JSON.stringify(board.food)}`,
      }
    }
    const ui = await readUi(page)
    if (ui.modalVisible) {
      return { ok: false, reason: `对局中断（${ui.modalTitle}）` }
    }
    if (Number(ui.hudScore ?? '0') > scoreAtStart) {
      return { ok: true, moves: move }
    }
    const path = planPath(board)
    const choice = path?.[0] ?? survivalMove(board, current)
    if (!choice) {
      return { ok: false, reason: `无安全方向可选（head=${JSON.stringify(board.head)}）` }
    }
    await page.keyboard.press(DIRECTION_KEYS[choice])
    const step = await waitForDirection(page, choice, 1800)
    if (step.ok) {
      current = choice
    } else {
      const uiAfter = await readUi(page)
      if (uiAfter.modalVisible) {
        return { ok: false, reason: `对局中断（${uiAfter.modalTitle}）` }
      }
      const after = (await observeBoard(page)).head
      for (const [name, vector] of Object.entries(DIRECTION_VECTORS)) {
        if (after && board.head.x + vector.x === after.x && board.head.y + vector.y === after.y) {
          current = name
        }
      }
    }
  }
  return { ok: false, reason: `移动预算 ${maxMoves} 步内未吃到食物` }
}

const cellKey = (cell) => `${cell.x},${cell.y}`

const inBounds = (cell) => cell.x >= 0 && cell.y >= 0 && cell.x < BOARD_COLS && cell.y < BOARD_ROWS

function bodyObstacles(snake) {
  return new Set(snake.map((cell) => cellKey(cell)))
}

/** BFS 从蛇头到食物，蛇身（保守含蛇尾）作为障碍；返回方向序列或 null */
function planPath(board) {
  const goal = cellKey(board.food)
  const start = cellKey(board.head)
  const obstacles = bodyObstacles(board.snake)
  const cameFrom = new Map([[start, null]])
  const queue = [board.head]
  while (queue.length > 0) {
    const cell = queue.shift()
    for (const [name, vector] of Object.entries(DIRECTION_VECTORS)) {
      const next = { x: cell.x + vector.x, y: cell.y + vector.y }
      if (!inBounds(next)) continue
      const key = cellKey(next)
      if (cameFrom.has(key)) continue
      if (key !== goal && obstacles.has(key)) continue
      cameFrom.set(key, { from: cellKey(cell), direction: name })
      if (key === goal) {
        const path = []
        let cursor = key
        while (cursor !== start) {
          const info = cameFrom.get(cursor)
          path.unshift(info.direction)
          cursor = info.from
        }
        return path
      }
      queue.push(next)
    }
  }
  return null
}

/** 无路径时的保命走法：选可行方向中可活动区域最大者 */
function survivalMove(board, current) {
  const obstacles = bodyObstacles(board.snake)
  const startCell = { x: board.head.x, y: board.head.y }
  let best = null
  for (const [name, vector] of Object.entries(DIRECTION_VECTORS)) {
    if (name === OPPOSITE[current]) continue
    const next = { x: startCell.x + vector.x, y: startCell.y + vector.y }
    if (!inBounds(next) || obstacles.has(cellKey(next))) continue
    const free = floodFill(next, obstacles)
    if (!best || free > best.free) best = { direction: name, free }
  }
  return best ? best.direction : null
}

function floodFill(start, obstacles) {
  const seen = new Set([cellKey(start)])
  const queue = [start]
  let count = 0
  while (queue.length > 0) {
    const cell = queue.shift()
    count += 1
    for (const vector of Object.values(DIRECTION_VECTORS)) {
      const next = { x: cell.x + vector.x, y: cell.y + vector.y }
      if (!inBounds(next)) continue
      const key = cellKey(next)
      if (seen.has(key) || obstacles.has(key)) continue
      seen.add(key)
      queue.push(next)
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// 场景
// ---------------------------------------------------------------------------

class CheckList {
  constructor(browserName, viewport) {
    this.browserName = browserName
    this.viewport = viewport
    this.items = []
  }

  add(id, name, ok, detail) {
    this.items.push({ id, name, ok: Boolean(ok), detail: detail ?? '' })
    return Boolean(ok)
  }
}

async function runScenario(browserName, viewport) {
  const checks = new CheckList(browserName, viewport)
  const browserType = browserName === 'chromium' ? chromium : firefox
  const browser = await browserType.launch({ headless: true })
  checks.browserVersion = browser.version()
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: viewport.width <= 400 ? 2 : 1,
    hasTouch: viewport.width <= 400,
  })
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  const shot = async (name) => {
    await page.screenshot({ path: join(SHOT_DIR, `${browserName}-${viewport.width}-${name}.png`) })
  }

  try {
    await page.goto(BASE, { waitUntil: 'load' })
    await page.waitForSelector('[data-testid="start-button"]')

    // 1) 首屏
    let ui = await readUi(page)
    checks.add(
      'S1',
      '首屏展示开始界面与三档难度',
      ui.startVisible && ui.difficultyOptions === 3,
      JSON.stringify({ start: ui.startVisible, options: ui.difficultyOptions }),
    )
    checks.add(
      'S2',
      '开始按钮获得初始焦点（键盘可达）',
      ui.activeTestId === 'start-button',
      String(ui.activeTestId),
    )

    // 2) 画布尺寸与 DPR
    const board0 = await observeBoard(page)
    const expectedWidth = Math.round(board0.cssWidth * (board0.dpr ?? 1))
    checks.add(
      'S3',
      'Canvas 内部像素=CSS 尺寸×DPR（高像素密度清晰）',
      Math.abs(board0.canvasWidth - expectedWidth) <= 2 && board0.cssWidth > 100,
      `css=${board0.cssWidth} dpr=${board0.dpr} canvas=${board0.canvasWidth}`,
    )
    checks.add(
      'S4',
      '棋盘不超出视口宽度',
      ui.boardRect !== null &&
        ui.boardRect.right <= ui.viewportWidth + 1 &&
        ui.boardRect.left >= -1,
      JSON.stringify(ui.boardRect),
    )

    // 3) 触屏方向键显隐与尺寸
    const expectDpad = viewport.width <= 767
    checks.add(
      'S5',
      '方向键显隐与 ≤767px 断点一致',
      ui.dpadVisible === expectDpad,
      `visible=${ui.dpadVisible} expect=${expectDpad}`,
    )
    checks.add(
      'S6',
      '触屏方向按钮命中区域 ≥40px（窄屏）',
      !expectDpad || ui.padButtons.every((button) => button.width >= 40 && button.height >= 40),
      JSON.stringify(ui.padButtons),
    )
    await shot('start')

    // 4) 开始游戏（选休闲档，200ms/格便于黑盒控制）
    await page.click('#difficulty-casual')
    await page.click('[data-testid="start-button"]')
    ui = await readUi(page)
    checks.add(
      'S7',
      '开始后进入运行态且 HUD 显示难度/分数',
      !ui.startVisible && ui.hudDifficulty === '休闲' && ui.hudScore === '0',
      JSON.stringify({ start: ui.startVisible, diff: ui.hudDifficulty, score: ui.hudScore }),
    )
    const opening = await observeBoard(page)
    checks.add(
      'S8',
      '开局渲染蛇与食物（像素可见）',
      Boolean(opening.head && opening.food) && opening.snakeCells >= 3,
      JSON.stringify({ head: opening.head, food: opening.food, cells: opening.snakeCells }),
    )
    await shot('running')

    // 5) 方向键 ↑ 移动
    await page.keyboard.press('ArrowUp')
    const upStep = await waitForDirection(page, 'up')
    checks.add(
      'S9',
      '方向键 ↑ 使蛇头向上移动一格',
      upStep.ok,
      JSON.stringify({ from: upStep.from }),
    )

    // 6) WASD 转向
    await page.keyboard.press('d')
    const rightStep = await waitForDirection(page, 'right')
    checks.add(
      'S10',
      'WASD（d）转向向右生效',
      rightStep.ok,
      JSON.stringify({ from: rightStep.from }),
    )

    // 7) 反向输入被拒绝：按 ← 后 600ms 内不得出现向左移动
    await page.keyboard.press('a')
    const reverseWatch = await watchMovement(page, 600)
    const anyLeft = reverseWatch.some((step) => directionOf(step) === 'left')
    checks.add(
      'S11',
      '反向输入（左）被拒绝，未出现非法左移',
      !anyLeft && reverseWatch.length > 0,
      JSON.stringify(reverseWatch.map(directionOf)),
    )

    // 8) 空格暂停 / 继续
    const beforePause = await canvasDigest(page)
    await page.keyboard.press('Space')
    await waitFor(page, async () => (await readUi(page)).modalVisible, { label: '暂停弹层' })
    ui = await readUi(page)
    checks.add(
      'S12',
      '空格暂停并弹出暂停弹层',
      ui.modalTitle === '已暂停' && ui.modalPrimary === '继续游戏',
      JSON.stringify({ title: ui.modalTitle, primary: ui.modalPrimary }),
    )
    await page.waitForTimeout(700)
    const pausedDigest = await canvasDigest(page)
    checks.add(
      'S13',
      '暂停期间画面不再变化',
      pausedDigest === beforePause,
      `${beforePause} -> ${pausedDigest}`,
    )
    await shot('paused')
    await page.click('[data-testid="modal-primary"]')
    const resumed = await waitFor(
      page,
      async () => {
        const state = await readUi(page)
        if (state.modalVisible) return null
        const digest = await canvasDigest(page)
        return digest !== pausedDigest ? digest : null
      },
      { timeout: 3000, label: '继续后恢复移动' },
    )
    checks.add('S14', '点击继续后弹层关闭且蛇恢复移动', Boolean(resumed), '')

    // 9) 失焦自动暂停
    let autoPauseMode = 'tab-switch'
    const secondPage = await context.newPage()
    await secondPage.goto('about:blank')
    await secondPage.bringToFront()
    await page.waitForTimeout(500)
    let autoPausedUi = await readUi(page)
    if (!autoPausedUi.modalVisible) {
      autoPauseMode = 'synthetic-blur'
      await page.evaluate(() => {
        globalThis.dispatchEvent(new Event('blur'))
      })
      await page.waitForTimeout(400)
      autoPausedUi = await readUi(page)
    }
    checks.add(
      'S15',
      `失焦自动暂停（${autoPauseMode}）且弹层说明原因`,
      autoPausedUi.modalVisible && (autoPausedUi.modalMessage ?? '').includes('自动暂停'),
      JSON.stringify({ mode: autoPauseMode, msg: autoPausedUi.modalMessage }),
    )
    const pausedHead = autoPausedUi.modalVisible ? (await observeBoard(page)).head : null
    await secondPage.close()
    await page.bringToFront()
    await page.waitForTimeout(800)
    const returned = await observeBoard(page)
    const returnedUi = await readUi(page)
    checks.add(
      'S16',
      '返回页面后不自行移动（仍处暂停）',
      Boolean(
        pausedHead &&
        returned.head &&
        returned.head.x === pausedHead.x &&
        returned.head.y === pausedHead.y &&
        returnedUi.modalVisible,
      ),
      JSON.stringify({
        paused: pausedHead,
        afterReturn: returned.head,
        modal: returnedUi.modalTitle,
      }),
    )
    await shot('autopause')

    // 10) HUD 按钮暂停/继续
    // 小屏（≤767px）弹层按设计覆盖整屏，会遮挡 HUD 按钮；此时经弹层按钮继续，再用 HUD 按钮暂停
    ui = await readUi(page)
    checks.add(
      'S17',
      '暂停时 HUD 按钮文案切换为「继续」',
      (ui.pauseLabel ?? '').includes('继续'),
      String(ui.pauseLabel),
    )
    const pauseButtonCovered = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="pause-button"]')
      if (!button) return null
      const rect = button.getBoundingClientRect()
      const target = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      )
      return !(target === button || button.contains(target))
    })
    let hudMode
    if (pauseButtonCovered === false) {
      await page.click('[data-testid="pause-button"]')
      await waitFor(
        page,
        async () => {
          const state = await readUi(page)
          return !state.modalVisible && (state.pauseLabel ?? '').includes('暂停') ? state : null
        },
        { timeout: 3000, label: 'HUD 继续' },
      )
      hudMode = 'HUD 按钮直接继续（弹层未遮挡 HUD）'
    } else {
      await page.click('[data-testid="modal-primary"]')
      await waitFor(page, async () => !(await readUi(page)).modalVisible, {
        timeout: 3000,
        label: '弹层继续',
      })
      await page.click('[data-testid="pause-button"]')
      await waitFor(page, async () => (await readUi(page)).modalVisible, {
        timeout: 3000,
        label: 'HUD 暂停',
      })
      await page.click('[data-testid="modal-primary"]')
      await waitFor(page, async () => !(await readUi(page)).modalVisible, {
        timeout: 3000,
        label: '再次继续',
      })
      hudMode = '小屏弹层按设计全屏遮挡 HUD：经弹层「继续游戏」恢复，HUD 按钮可暂停'
    }
    const runningAfterHud = await readUi(page)
    checks.add(
      'S18',
      '可见按钮可暂停/继续（HUD 按钮或弹层按钮，含小屏全屏弹层路径）',
      !runningAfterHud.modalVisible && (runningAfterHud.pauseLabel ?? '').includes('暂停'),
      hudMode,
    )

    // 11) 继续前进直至撞墙结束
    const gameOver = await waitFor(
      page,
      async () => {
        const state = await readUi(page)
        if (state.modalVisible && state.modalTitle === '游戏结束') return state
        if (state.modalVisible) await page.click('[data-testid="modal-primary"]')
        return null
      },
      { timeout: 15000, interval: 150, label: '撞墙结束' },
    )
    checks.add(
      'S19',
      '持续前进撞墙后弹出「游戏结束」',
      gameOver.modalTitle === '游戏结束',
      String(gameOver.modalTitle),
    )
    checks.add(
      'S20',
      '结束弹层展示得分/最高分/难度与重开入口',
      gameOver.modalScore !== null &&
        gameOver.modalHighScore !== null &&
        (gameOver.modalPrimary ?? '').includes('重新开始') &&
        (gameOver.modalSecondary ?? '').includes('返回开始界面'),
      JSON.stringify({
        score: gameOver.modalScore,
        high: gameOver.modalHighScore,
        primary: gameOver.modalPrimary,
        secondary: gameOver.modalSecondary,
      }),
    )
    await shot('gameover')

    // 12) 重开
    await page.click('[data-testid="modal-primary"]')
    const restarted = await waitFor(
      page,
      async () => {
        const state = await readUi(page)
        return !state.modalVisible && state.hudScore === '0' ? state : null
      },
      { timeout: 3000, label: '重开' },
    )
    checks.add(
      'S21',
      '重开后回到运行态且分数归零',
      restarted.hudScore === '0',
      JSON.stringify({ score: restarted.hudScore }),
    )

    // 13) 真实吃食物：计分 +5、蛇身增长、最高分写入
    let eatResult = { ok: false, reason: '未执行' }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const scoreBefore = Number((await readUi(page)).hudScore ?? '0')
      const chase = await chaseFood(page)
      const afterUi = await readUi(page)
      const scoreAfter = Number(afterUi.hudScore ?? '0')
      if (scoreAfter > scoreBefore) {
        eatResult = {
          ok: true,
          scoreBefore,
          scoreAfter,
          bodyCells: (await observeBoard(page)).snakeCells,
          attempts: attempt + 1,
        }
        break
      }
      eatResult = {
        ok: false,
        reason: chase.reason,
        scoreBefore,
        scoreAfter,
        attempts: attempt + 1,
      }
      const modalUi = await readUi(page)
      if (modalUi.modalVisible) {
        await page.click('[data-testid="modal-primary"]')
        await waitFor(page, async () => !(await readUi(page)).modalVisible, {
          timeout: 3000,
          label: '重开后再尝试',
        })
      }
    }
    checks.add(
      'S22',
      '真实吃到食物：休闲档 +5 分且蛇身增长',
      eatResult.ok &&
        eatResult.scoreAfter - eatResult.scoreBefore === 5 &&
        (eatResult.bodyCells ?? 0) >= 4,
      JSON.stringify(eatResult),
    )
    const highAfterEat = Number((await readUi(page)).hudHighScore ?? '0')
    checks.add(
      'S23',
      'HUD 最高分随本局得分更新',
      highAfterEat > 0 && highAfterEat >= (eatResult.scoreAfter ?? 0),
      `high=${highAfterEat} score=${eatResult.scoreAfter}`,
    )

    // 14) 刷新后恢复最高分与难度选择
    const expectedHigh = String(highAfterEat)
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[data-testid="start-button"]')
    ui = await readUi(page)
    checks.add(
      'S24',
      '刷新后最高分从本地存储恢复',
      ui.hudHighScore === expectedHigh,
      `expect=${expectedHigh} actual=${ui.hudHighScore}`,
    )
    checks.add(
      'S25',
      '刷新后恢复上次选择的难度',
      ui.checkedDifficulty === 'casual',
      String(ui.checkedDifficulty),
    )

    // 15) 难度速度差异（仅在 1440 视口执行以控制耗时）
    if (viewport.width === 1440) {
      const measureTick = async (difficulty) => {
        await page.reload({ waitUntil: 'load' })
        await page.waitForSelector('[data-testid="start-button"]')
        await page.click(`#difficulty-${difficulty}`)
        await page.click('[data-testid="start-button"]')
        await waitFor(page, async () => !(await readUi(page)).startVisible, {
          timeout: 3000,
          label: '开始游戏',
        })
        const intervals = moveIntervals(await watchMovement(page, 1600))
        const state = await readUi(page)
        if (state.modalVisible) {
          await page.click('[data-testid="modal-primary"]')
          await waitFor(page, async () => !(await readUi(page)).modalVisible, {
            timeout: 3000,
            label: '结束后恢复',
          })
        }
        return median(intervals)
      }
      const casualTick = await measureTick('casual')
      const challengeTick = await measureTick('challenge')
      checks.add(
        'S26',
        '挑战档明显快于休闲档（实测单格移动间隔）',
        casualTick !== null &&
          challengeTick !== null &&
          casualTick / challengeTick >= 1.4 &&
          casualTick >= 150 &&
          challengeTick >= 70,
        `casual=${casualTick}ms challenge=${challengeTick}ms ratio=${
          casualTick && challengeTick ? (casualTick / challengeTick).toFixed(2) : 'n/a'
        }`,
      )
    }

    // 16) 页面滚动与异常
    await page.evaluate(() => globalThis.scrollTo(0, 0))
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(300)
    const finalUi = await readUi(page)
    checks.add(
      'S27',
      '方向键操作不引起页面滚动',
      finalUi.scrollY === 0,
      `scrollY=${finalUi.scrollY}`,
    )
    checks.add(
      'S28',
      '页面无水平溢出',
      finalUi.documentScrollWidth <= finalUi.viewportWidth + 1,
      `scrollWidth=${finalUi.documentScrollWidth} viewport=${finalUi.viewportWidth}`,
    )
    checks.add(
      'S29',
      '运行全程无 console.error',
      consoleErrors.length === 0,
      JSON.stringify(consoleErrors.slice(0, 3)),
    )
    checks.add(
      'S30',
      '运行全程无未处理异常',
      pageErrors.length === 0,
      JSON.stringify(pageErrors.slice(0, 3)),
    )
  } catch (error) {
    checks.add('S99', '场景执行未中断', false, String(error?.message ?? error))
    try {
      await shot('failure')
    } catch {
      // 截图失败不阻塞结果输出
    }
  } finally {
    await context.close()
    await browser.close()
  }
  return checks
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true })
  const server = await startStaticServer(DIST_DIR)
  const results = []
  const onlyBrowsers = argValue('browsers', 'chromium,firefox')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const onlyWidths = argValue('widths', '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
  const matrix = [
    { browser: 'chromium', viewport: { width: 360, height: 640 } },
    { browser: 'chromium', viewport: { width: 768, height: 1024 } },
    { browser: 'chromium', viewport: { width: 1440, height: 900 } },
    { browser: 'firefox', viewport: { width: 360, height: 640 } },
    { browser: 'firefox', viewport: { width: 1440, height: 900 } },
  ].filter(
    (entry) =>
      onlyBrowsers.includes(entry.browser) &&
      (onlyWidths.length === 0 || onlyWidths.includes(entry.viewport.width)),
  )
  try {
    for (const entry of matrix) {
      process.stdout.write(
        `\n=== ${entry.browser} @ ${entry.viewport.width}x${entry.viewport.height} ===\n`,
      )
      const checks = await runScenario(entry.browser, entry.viewport)
      const failed = checks.items.filter((item) => !item.ok)
      for (const item of checks.items) {
        process.stdout.write(
          `  ${item.ok ? 'PASS' : 'FAIL'} ${item.id} ${item.name}${item.detail ? ` | ${item.detail}` : ''}\n`,
        )
      }
      results.push({
        browser: entry.browser,
        browserVersion: checks.browserVersion ?? null,
        viewport: entry.viewport,
        total: checks.items.length,
        passed: checks.items.length - failed.length,
        failed: failed.length,
        checks: checks.items,
      })
    }
  } finally {
    server.close()
  }

  let playwrightVersion = 'unknown'
  try {
    const qaPackage = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    )
    playwrightVersion = qaPackage.devDependencies?.playwright ?? 'unknown'
  } catch {
    // 版本读取失败不影响冒烟结果
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    target: 'dist/ build of agents/frontend-developer @ e4f04ab8a463bfdad7f8272e6609f0d12a7c3157',
    environment: {
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      playwright: playwrightVersion,
      distDir: DIST_DIR,
    },
    totalChecks: results.reduce((sum, entry) => sum + entry.total, 0),
    failedChecks: results.reduce((sum, entry) => sum + entry.failed, 0),
    runs: results,
  }
  await writeFile(join(OUT_DIR, 'browser-smoke.json'), `${JSON.stringify(summary, null, 2)}\n`)
  process.stdout.write(
    `\nTOTAL ${summary.totalChecks - summary.failedChecks}/${summary.totalChecks} checks passed across ${results.length} runs\n`,
  )
  process.stdout.write(`JSON: ${join(OUT_DIR, 'browser-smoke.json')}\n`)
}

await main()
