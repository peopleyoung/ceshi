import { DEFAULT_DIFFICULTY, DIFFICULTY_SETTINGS } from './engine/constants'
import { GameEngine } from './engine/GameEngine'
import type { GameEngineOptions } from './engine/GameEngine'
import type { BoardSize, GameState, GameStatus } from './engine/types'
import { InputHandler } from './input/InputHandler'
import { CanvasRenderer } from './renderer/CanvasRenderer'
import { StorageService } from './storage/StorageService'
import { createElement } from './ui/dom'
import { GameHUD } from './ui/GameHUD'
import { MobileControls } from './ui/MobileControls'
import { StartScreen } from './ui/StartScreen'
import { StatusModal } from './ui/StatusModal'
import './styles/main.css'

const FALLBACK_BOARD_SIZE = 480

export interface AppOptions {
  root: HTMLElement
  storage?: StorageService
  engineOptions?: GameEngineOptions
  boardSize?: BoardSize
}

export interface AppController {
  engine: GameEngine
  destroy(): void
}

export function createApp(options: AppOptions): AppController {
  const root = options.root
  const doc = root.ownerDocument
  const win = doc.defaultView ?? window
  const storage = options.storage ?? new StorageService()

  const engine = new GameEngine({
    storage,
    difficulty: storage.getLastDifficulty() ?? DEFAULT_DIFFICULTY,
    boardSize: options.boardSize,
    ...options.engineOptions,
  })

  const hud = new GameHUD(doc)
  const startScreen = new StartScreen(doc, engine.getConfig().difficulty)
  const statusModal = new StatusModal(doc)
  const mobileControls = new MobileControls(doc)

  const canvas = createElement(doc, 'canvas', {
    className: 'board__canvas',
    attrs: { 'aria-label': '贪吃蛇棋盘', role: 'img' },
    dataset: { testid: 'canvas' },
  })
  const boardFrame = createElement(
    doc,
    'div',
    { className: 'board', dataset: { testid: 'board' } },
    [canvas, startScreen.element, statusModal.element],
  )
  const liveRegion = createElement(doc, 'div', {
    className: 'visually-hidden',
    attrs: { role: 'status', 'aria-live': 'polite' },
    dataset: { testid: 'live-region' },
  })

  root.append(
    createElement(doc, 'header', { className: 'app__header' }, [
      createElement(doc, 'h1', { className: 'app__title', text: '贪吃蛇' }),
      createElement(doc, 'p', {
        className: 'app__subtitle',
        text: '经典街机玩法 · 三档难度 · 键盘与触屏均可操作',
      }),
    ]),
    hud.element,
    createElement(doc, 'main', { className: 'stage' }, [boardFrame]),
    mobileControls.element,
    createElement(doc, 'p', {
      className: 'app__hint',
      text: '方向键 / WASD 控制方向，空格暂停或继续；页面切到后台会自动暂停。',
    }),
    liveRegion,
  )

  const renderer = new CanvasRenderer(canvas)
  let autoPaused = false
  let previousStatus: GameStatus = engine.getState().status

  const announce = (message: string): void => {
    liveRegion.textContent = message
  }

  const fitBoard = (): void => {
    const measured = boardFrame.clientWidth
    const size = measured > 0 ? measured : FALLBACK_BOARD_SIZE
    renderer.resize(size, win.devicePixelRatio || 1)
    renderer.render(engine.getState())
  }

  const syncOverlays = (state: GameState): void => {
    if (state.status === 'idle') {
      statusModal.hide()
      startScreen.show(state.difficulty)
      return
    }
    startScreen.hide()
    if (state.status === 'running') {
      statusModal.hide()
      return
    }
    statusModal.show({
      kind: state.status,
      score: state.score,
      highScore: state.highScore,
      difficulty: state.difficulty,
      autoPaused,
    })
  }

  const describeStatus = (state: GameState): string => {
    const label = DIFFICULTY_SETTINGS[state.difficulty].label
    switch (state.status) {
      case 'running':
        return previousStatus === 'paused' ? `继续游戏，难度：${label}` : `游戏开始，难度：${label}`
      case 'paused':
        return autoPaused ? '页面切到后台，游戏已自动暂停' : '游戏已暂停'
      case 'gameover':
        return `游戏结束，本局得分 ${state.score}，该难度最高分 ${state.highScore}`
      case 'victory':
        return `恭喜通关，本局得分 ${state.score}`
      default:
        return '已返回开始界面'
    }
  }

  engine.onStateChange((state) => {
    if (state.status !== previousStatus) {
      announce(describeStatus(state))
      previousStatus = state.status
    }
    hud.update(state)
    syncOverlays(state)
    renderer.render(state)
  })

  startScreen.onStart(() => {
    autoPaused = false
    engine.start({ difficulty: startScreen.difficulty })
  })

  hud.onPauseToggle(() => {
    const state = engine.getState()
    if (state.status === 'running') {
      autoPaused = false
      engine.pause()
    } else if (state.status === 'paused') {
      engine.resume()
    }
  })

  hud.onRestart(() => {
    autoPaused = false
    engine.restart()
  })

  statusModal.onAction({
    onPrimary: () => {
      const state = engine.getState()
      if (state.status === 'paused') {
        autoPaused = false
        engine.resume()
      } else {
        autoPaused = false
        engine.restart()
      }
    },
    onSecondary: () => {
      const state = engine.getState()
      if (state.status === 'paused') {
        autoPaused = false
        engine.restart()
      } else {
        autoPaused = false
        engine.reset()
      }
    },
  })

  const inputHandler = new InputHandler({
    directionPad: mobileControls.element,
    document: doc,
    window: win,
    onDirection: (direction) => {
      engine.changeDirection(direction)
    },
    onPauseToggle: () => {
      const state = engine.getState()
      if (state.status === 'running') {
        autoPaused = false
        engine.pause()
      } else if (state.status === 'paused') {
        autoPaused = false
        engine.resume()
      }
    },
    onAutoPause: () => {
      if (engine.getState().status === 'running') {
        autoPaused = true
        engine.pause()
      }
    },
  })

  const resizeObserver =
    typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => fitBoard()) : null
  resizeObserver?.observe(boardFrame)
  win.addEventListener('resize', fitBoard)

  const initialState = engine.getState()
  hud.update(initialState)
  syncOverlays(initialState)
  fitBoard()
  if (initialState.status === 'idle') {
    startScreen.focus()
  }

  return {
    engine,
    destroy: () => {
      resizeObserver?.disconnect()
      win.removeEventListener('resize', fitBoard)
      inputHandler.destroy()
      statusModal.destroy()
      engine.destroy()
      root.replaceChildren()
    },
  }
}
