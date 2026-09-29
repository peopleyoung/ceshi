import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import type { AppController } from '../src/app'
import { STORAGE_KEYS } from '../src/engine/constants'
import type { Difficulty } from '../src/engine/types'
import { StorageService } from '../src/storage/StorageService'
import { createFakeCanvasContext } from './helpers'

const TICK_MS = 150

interface SetupOptions {
  highScores?: Partial<Record<Difficulty, number>>
  lastDifficulty?: Difficulty
}

let app: AppController | null = null

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`未找到元素: ${selector}`)
  }
  return element
}

function byTestId<T extends Element>(testId: string): T {
  return must<T>(`[data-testid="${testId}"]`)
}

function setup(options: SetupOptions = {}): AppController {
  const root = document.createElement('div')
  root.id = 'app'
  document.body.replaceChildren(root)
  window.localStorage.clear()

  for (const [difficulty, score] of Object.entries(options.highScores ?? {})) {
    window.localStorage.setItem(`${STORAGE_KEYS.highScorePrefix}${difficulty}`, String(score))
  }
  if (options.lastDifficulty) {
    window.localStorage.setItem(STORAGE_KEYS.lastDifficulty, options.lastDifficulty)
  }

  app = createApp({
    root,
    storage: new StorageService(window.localStorage),
    engineOptions: { random: () => 0, boardSize: { rows: 10, cols: 10 } },
  })
  return app
}

function startGame(): AppController {
  byTestId<HTMLButtonElement>('start-button').click()
  return app as AppController
}

function pressKey(key: string, extra: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...extra }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => createFakeCanvasContext().context,
  )
})

afterEach(() => {
  app?.destroy()
  app = null
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('首次进入', () => {
  it('展示游戏说明与开始入口，HUD 使用上次难度', () => {
    setup({ lastDifficulty: 'casual' })

    expect(byTestId<HTMLElement>('start-screen').hidden).toBe(false)
    expect(byTestId<HTMLElement>('status-modal').hidden).toBe(true)
    expect(byTestId('hud-difficulty').textContent).toBe('休闲')
    expect(byTestId('hud-score').textContent).toBe('0')
    expect(byTestId<HTMLButtonElement>('pause-button').disabled).toBe(true)
    expect(byTestId<HTMLButtonElement>('restart-button').disabled).toBe(true)
    expect(must('[data-testid="start-screen"]').textContent).toContain('开始游戏')
    expect(byTestId('canvas')).not.toBeNull()
    expect(byTestId('pad-up')).not.toBeNull()
  })

  it('未选择难度时使用默认难度标准', () => {
    setup()
    expect(byTestId('hud-difficulty').textContent).toBe('标准')
  })
})

describe('开始游戏', () => {
  it('按所选难度开始，隐藏开始界面并只启动一个计时器', () => {
    setup({ lastDifficulty: 'casual' })

    const radio = must<HTMLInputElement>('input[value="challenge"]')
    radio.checked = true
    radio.dispatchEvent(new Event('change', { bubbles: true }))
    expect(must('[data-selected="true"]').textContent).toContain('挑战')
    expect(document.querySelectorAll('[data-selected="false"]').length).toBe(2)
    byTestId<HTMLButtonElement>('start-button').click()

    expect(app?.engine.getState().status).toBe('running')
    expect(app?.engine.getState().difficulty).toBe('challenge')
    expect(byTestId('hud-difficulty').textContent).toBe('挑战')
    expect(byTestId<HTMLElement>('start-screen').hidden).toBe(true)
    expect(byTestId<HTMLElement>('status-modal').hidden).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    expect(window.localStorage.getItem(STORAGE_KEYS.lastDifficulty)).toBe('challenge')
  })

  it('键盘与屏幕方向键都能驱动蛇移动', () => {
    setup()
    startGame()

    pressKey('w')
    vi.advanceTimersByTime(TICK_MS)
    expect(app?.engine.getState().snake[0]).toEqual({ x: 5, y: 4 })

    byTestId<HTMLButtonElement>('pad-right').dispatchEvent(
      new Event('pointerdown', { cancelable: true, bubbles: true }),
    )
    vi.advanceTimersByTime(TICK_MS)
    expect(app?.engine.getState().snake[0]).toEqual({ x: 6, y: 4 })
  })
})

describe('得分与最高分', () => {
  it('吃到食物后 HUD 得分与最高分更新并写入本地存储', () => {
    setup()
    startGame()

    app?.engine.changeDirection('up')
    vi.advanceTimersByTime(TICK_MS * 5)
    app?.engine.changeDirection('left')
    vi.advanceTimersByTime(TICK_MS * 5)

    const state = app?.engine.getState()
    expect(state?.score).toBe(10)
    expect(state?.snake).toHaveLength(4)
    expect(byTestId('hud-score').textContent).toBe('10')
    expect(byTestId('hud-high-score').textContent).toBe('10')
    expect(window.localStorage.getItem(`${STORAGE_KEYS.highScorePrefix}standard`)).toBe('10')
  })

  it('刷新后恢复各难度最高分', () => {
    setup({ highScores: { challenge: 42 }, lastDifficulty: 'challenge' })

    expect(byTestId('hud-high-score').textContent).toBe('42')
    expect(byTestId('hud-difficulty').textContent).toBe('挑战')
  })
})

describe('暂停与自动暂停', () => {
  it('空格键与暂停按钮都能切换暂停和继续，且始终保持单一计时器', () => {
    setup()
    startGame()

    pressKey(' ', { code: 'Space' })
    expect(app?.engine.getState().status).toBe('paused')
    expect(vi.getTimerCount()).toBe(0)
    expect(byTestId<HTMLElement>('status-modal').hidden).toBe(false)
    expect(must<HTMLButtonElement>('[data-testid="modal-primary"]').textContent).toBe('继续游戏')

    byTestId<HTMLButtonElement>('modal-primary').click()
    expect(app?.engine.getState().status).toBe('running')
    expect(vi.getTimerCount()).toBe(1)

    byTestId<HTMLButtonElement>('pause-button').click()
    expect(app?.engine.getState().status).toBe('paused')
    expect(vi.getTimerCount()).toBe(0)

    byTestId<HTMLButtonElement>('pause-button').click()
    expect(app?.engine.getState().status).toBe('running')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('窗口失焦自动暂停，返回后不会自行移动，需手动继续', () => {
    setup()
    startGame()
    vi.advanceTimersByTime(TICK_MS * 2)
    const headWhenPaused = app?.engine.getState().snake[0]

    window.dispatchEvent(new Event('blur'))

    expect(app?.engine.getState().status).toBe('paused')
    expect(byTestId<HTMLElement>('status-modal').hidden).toBe(false)
    expect(must('#status-modal-message').textContent).toContain('自动暂停')

    vi.advanceTimersByTime(TICK_MS * 5)
    expect(app?.engine.getState().snake[0]).toEqual(headWhenPaused)

    byTestId<HTMLButtonElement>('modal-primary').click()
    expect(app?.engine.getState().status).toBe('running')
    vi.advanceTimersByTime(TICK_MS)
    expect(app?.engine.getState().snake[0]).not.toEqual(headWhenPaused)
  })
})

describe('游戏结束与重开', () => {
  it('撞墙后展示得分、最高分与重开入口，重开重置本局', () => {
    setup({ highScores: { standard: 42 } })
    startGame()

    app?.engine.changeDirection('up')
    vi.advanceTimersByTime(TICK_MS * 6)

    expect(app?.engine.getState().status).toBe('gameover')
    expect(vi.getTimerCount()).toBe(0)
    expect(byTestId<HTMLElement>('status-modal').hidden).toBe(false)
    expect(byTestId('modal-score').textContent).toBe('0')
    expect(byTestId('modal-high-score').textContent).toBe('42')
    expect(byTestId('modal-difficulty').textContent).toBe('标准')
    expect(must('#status-modal-title').textContent).toBe('游戏结束')
    expect(byTestId('live-region').textContent).toContain('游戏结束')

    byTestId<HTMLButtonElement>('modal-primary').click()
    const restarted = app?.engine.getState()
    expect(restarted?.status).toBe('running')
    expect(restarted?.score).toBe(0)
    expect(restarted?.snake).toHaveLength(3)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('可以通过弹层返回开始界面重新选择难度', () => {
    setup()
    startGame()
    app?.engine.changeDirection('up')
    vi.advanceTimersByTime(TICK_MS * 6)

    byTestId<HTMLButtonElement>('modal-secondary').click()
    expect(app?.engine.getState().status).toBe('idle')
    expect(byTestId<HTMLElement>('start-screen').hidden).toBe(false)
    expect(byTestId<HTMLElement>('status-modal').hidden).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('反复重开与暂停不会产生重复计时器', () => {
    setup()
    startGame()

    for (let index = 0; index < 3; index += 1) {
      byTestId<HTMLButtonElement>('restart-button').click()
      expect(vi.getTimerCount()).toBe(1)
    }

    byTestId<HTMLButtonElement>('pause-button').click()
    byTestId<HTMLButtonElement>('pause-button').click()
    byTestId<HTMLButtonElement>('restart-button').click()
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(TICK_MS)
    expect(app?.engine.getState().snake[0]).toEqual({ x: 6, y: 5 })
  })
})

describe('销毁', () => {
  it('destroy 后清理计时器与监听', () => {
    setup()
    startGame()
    expect(vi.getTimerCount()).toBe(1)

    app?.destroy()
    expect(vi.getTimerCount()).toBe(0)
    expect(must('#app').childElementCount).toBe(0)

    pressKey('w')
    vi.advanceTimersByTime(TICK_MS * 3)
    expect(app?.engine.getState().snake[0]).toEqual({ x: 5, y: 5 })
  })
})
