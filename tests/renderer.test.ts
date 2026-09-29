import { describe, expect, it, vi } from 'vitest'
import { CanvasRenderer, DEFAULT_THEME } from '../src/renderer/CanvasRenderer'
import type { GameState } from '../src/engine/types'
import { createFakeCanvasContext } from './helpers'

function createState(overrides: Partial<GameState> = {}): GameState {
  return {
    status: 'running',
    snake: [
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ],
    food: { x: 5, y: 5 },
    score: 10,
    highScore: 30,
    difficulty: 'standard',
    boardSize: { rows: 10, cols: 10 },
    ...overrides,
  }
}

describe('CanvasRenderer', () => {
  it('缺少 2d 上下文时安全降级', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(null)
    const renderer = new CanvasRenderer(canvas)
    expect(renderer.supported).toBe(false)
    renderer.resize(320, 2)
    expect(() => renderer.render(createState())).not.toThrow()
  })

  it('按 devicePixelRatio 设置内部分辨率与 CSS 尺寸', () => {
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(createFakeCanvasContext().context)
    const renderer = new CanvasRenderer(canvas)

    renderer.resize(300, 2)
    expect(canvas.width).toBe(600)
    expect(canvas.height).toBe(600)
    expect(canvas.style.width).toBe('300px')
    expect(canvas.style.height).toBe('300px')
    expect(renderer.size).toBe(300)
  })

  it('绘制棋盘、食物与蛇身', () => {
    const canvas = document.createElement('canvas')
    const { context, calls } = createFakeCanvasContext()
    vi.spyOn(canvas, 'getContext').mockReturnValue(context)
    const renderer = new CanvasRenderer(canvas)
    renderer.resize(400, 1)

    renderer.render(createState())

    expect(calls).toContain('clearRect')
    expect(calls).toContain('fillRect')
    expect(calls).toContain('arc')
    expect(calls.filter((call) => call === 'arc').length).toBeGreaterThanOrEqual(3)
    expect(calls).toContain('setTransform')
  })

  it('无食物时仍然可以渲染', () => {
    const canvas = document.createElement('canvas')
    const { context } = createFakeCanvasContext()
    vi.spyOn(canvas, 'getContext').mockReturnValue(context)
    const renderer = new CanvasRenderer(canvas)
    renderer.resize(240, 1)

    expect(() => renderer.render(createState({ food: null, snake: [] }))).not.toThrow()
  })

  it('默认主题包含棋盘与蛇身配色', () => {
    expect(DEFAULT_THEME.board).toBeTypeOf('string')
    expect(DEFAULT_THEME.snakeHead).toBeTypeOf('string')
    expect(DEFAULT_THEME.food).toBeTypeOf('string')
  })
})
