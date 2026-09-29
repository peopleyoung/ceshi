import { describe, expect, it } from 'vitest'
import { DIFFICULTY_ORDER, DIFFICULTY_SETTINGS, STORAGE_KEYS } from '../src/engine/constants'
import {
  GameEngine,
  containsPoint,
  createStartSnake,
  normalizeBoardSize,
  pickFoodCell,
  resolveDirection,
} from '../src/engine/GameEngine'
import type { BoardLayout, BoardSize, Difficulty } from '../src/engine/types'
import { StorageService } from '../src/storage/StorageService'
import { FakeScheduler, MemoryStorage, requireFood } from './helpers'

const BOARD_10: BoardSize = { rows: 10, cols: 10 }

function straightLayout(overrides: Partial<BoardLayout> = {}): BoardLayout {
  return {
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
    food: { x: 9, y: 9 },
    direction: 'right',
    score: 0,
    ...overrides,
  }
}

interface EngineOptions {
  layout?: BoardLayout
  boardSize?: BoardSize
  difficulty?: Difficulty
  random?: () => number
  storage?: StorageService
}

function createEngine(options: EngineOptions = {}) {
  const scheduler = new FakeScheduler()
  const storage = options.storage ?? new StorageService(new MemoryStorage())
  const layout = options.layout
  const engine = new GameEngine({
    storage,
    scheduler,
    random: options.random ?? (() => 0),
    difficulty: options.difficulty,
    boardSize: options.boardSize ?? BOARD_10,
    boardFactory: layout ? () => layout : undefined,
  })
  return { engine, scheduler, storage }
}

describe('初始状态', () => {
  it('默认处于 idle，蛇长 3 且食物不在蛇身上', () => {
    const { engine } = createEngine()
    const state = engine.getState()
    expect(state.status).toBe('idle')
    expect(state.snake).toHaveLength(3)
    expect(state.score).toBe(0)
    expect(state.food).not.toBeNull()
    expect(containsPoint(state.snake, requireFood(state.food))).toBe(false)
    expect(state.boardSize).toEqual(BOARD_10)
  })

  it('创建起始蛇时不会越界', () => {
    for (const boardSize of [BOARD_10, { rows: 4, cols: 4 }, { rows: 20, cols: 20 }]) {
      const snake = createStartSnake(boardSize)
      expect(snake).toHaveLength(3)
      for (const segment of snake) {
        expect(segment.x).toBeGreaterThanOrEqual(0)
        expect(segment.x).toBeLessThan(boardSize.cols)
        expect(segment.y).toBeGreaterThanOrEqual(0)
        expect(segment.y).toBeLessThan(boardSize.rows)
      }
    }
  })

  it('过小的棋盘尺寸会被归一化到最小值', () => {
    expect(normalizeBoardSize({ rows: 1, cols: 0 })).toEqual({ rows: 4, cols: 4 })
  })
})

describe('移动', () => {
  it('每一步前进一格并保持长度（未进食）', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    scheduler.tick()
    const state = engine.getState()
    expect(state.status).toBe('running')
    expect(state.snake[0]).toEqual({ x: 6, y: 5 })
    expect(state.snake).toHaveLength(3)
    expect(state.snake.at(-1)).toEqual({ x: 4, y: 5 })
    expect(state.food).toEqual({ x: 9, y: 9 })
  })

  it.each(DIFFICULTY_ORDER)('难度 %s 使用配置中的速度且只有一个计时器', (difficulty) => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start({ difficulty })
    expect(scheduler.activeCount).toBe(1)
    expect(scheduler.activeTimeout).toBe(DIFFICULTY_SETTINGS[difficulty].tickMs)
  })
})

describe('方向控制', () => {
  it('禁止直接反向', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    engine.changeDirection('left')
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 6, y: 5 })
  })

  it('允许合法转向', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    engine.changeDirection('up')
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 4 })
  })

  it('同一周期快速连续输入按顺序逐周期生效', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    engine.changeDirection('up')
    engine.changeDirection('left')
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 4 })
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 4, y: 4 })
  })

  it('快速连续输入不能绕过反向限制', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    engine.changeDirection('down')
    engine.changeDirection('up')
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 6 })
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 7 })
  })

  it('重复同一方向被忽略，队列不会无限增长', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    for (let index = 0; index < 10; index += 1) {
      engine.changeDirection('up')
    }
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 4 })
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 3 })
  })

  it('暂停时忽略方向输入', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    engine.pause()
    engine.changeDirection('up')
    engine.resume()
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 6, y: 5 })
  })

  it('resolveDirection 只接受非反向的转向', () => {
    expect(resolveDirection('right', undefined)).toBe('right')
    expect(resolveDirection('right', 'right')).toBe('right')
    expect(resolveDirection('right', 'left')).toBe('right')
    expect(resolveDirection('right', 'up')).toBe('up')
  })
})

describe('食物与计分', () => {
  it('食物只会生成在空格，且按随机数取值', () => {
    expect(pickFoodCell([{ x: 0, y: 0 }], { rows: 2, cols: 2 }, () => 0)).toEqual({ x: 1, y: 0 })
    expect(pickFoodCell([{ x: 0, y: 0 }], { rows: 2, cols: 2 }, () => 0.5)).toEqual({
      x: 0,
      y: 1,
    })
    expect(pickFoodCell([{ x: 0, y: 0 }], { rows: 2, cols: 2 }, () => 0.999)).toEqual({
      x: 1,
      y: 1,
    })
  })

  it('棋盘填满时没有可生成的食物', () => {
    const full = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]
    expect(pickFoodCell(full, { rows: 2, cols: 2 }, () => 0.5)).toBeNull()
  })

  it('食物不会出现在蛇身上（多次随机取值）', () => {
    const snake = createStartSnake({ rows: 6, cols: 6 })
    for (let index = 0; index < 20; index += 1) {
      const food = pickFoodCell(snake, { rows: 6, cols: 6 }, () => index / 20)
      expect(food).not.toBeNull()
      expect(containsPoint(snake, requireFood(food))).toBe(false)
    }
  })

  it.each(DIFFICULTY_ORDER)('难度 %s 吃食物后增长一格并加分', (difficulty) => {
    const { engine, scheduler } = createEngine({
      layout: straightLayout({ food: { x: 6, y: 5 } }),
    })
    engine.start({ difficulty })
    scheduler.tick()
    const state = engine.getState()
    expect(state.snake).toHaveLength(4)
    expect(state.snake[0]).toEqual({ x: 6, y: 5 })
    expect(state.score).toBe(DIFFICULTY_SETTINGS[difficulty].scorePerFood)
    expect(state.food).not.toBeNull()
    expect(containsPoint(state.snake, requireFood(state.food))).toBe(false)
  })
})

describe('碰撞', () => {
  it('撞墙结束游戏并停止计时器', () => {
    const { engine, scheduler } = createEngine({
      boardSize: { rows: 5, cols: 5 },
      layout: {
        snake: [
          { x: 4, y: 1 },
          { x: 3, y: 1 },
          { x: 2, y: 1 },
        ],
        food: { x: 0, y: 0 },
        direction: 'right',
      },
    })
    engine.start()
    scheduler.tick()
    const state = engine.getState()
    expect(state.status).toBe('gameover')
    expect(scheduler.activeCount).toBe(0)
    expect(state.snake[0]).toEqual({ x: 4, y: 1 })
  })

  it('撞到自身结束游戏', () => {
    const { engine, scheduler } = createEngine({
      boardSize: { rows: 5, cols: 5 },
      layout: {
        snake: [
          { x: 2, y: 2 },
          { x: 1, y: 2 },
          { x: 1, y: 1 },
          { x: 2, y: 1 },
          { x: 3, y: 1 },
        ],
        food: { x: 4, y: 4 },
        direction: 'up',
      },
    })
    engine.start()
    scheduler.tick()
    expect(engine.getState().status).toBe('gameover')
    expect(scheduler.activeCount).toBe(0)
  })

  it('进入本步将移走的尾格不算碰撞', () => {
    const { engine, scheduler } = createEngine({
      boardSize: { rows: 5, cols: 5 },
      layout: {
        snake: [
          { x: 2, y: 2 },
          { x: 2, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
        ],
        food: { x: 4, y: 4 },
        direction: 'left',
      },
    })
    engine.start()
    scheduler.tick()
    const state = engine.getState()
    expect(state.status).toBe('running')
    expect(state.snake[0]).toEqual({ x: 1, y: 2 })
    expect(state.snake).toHaveLength(4)
    expect(state.snake.at(-1)).toEqual({ x: 1, y: 1 })
  })

  it('进食时尾格不移动，进入尾格判为碰撞', () => {
    const { engine, scheduler, storage } = createEngine({
      boardSize: { rows: 5, cols: 5 },
      layout: {
        snake: [
          { x: 2, y: 2 },
          { x: 2, y: 1 },
          { x: 1, y: 1 },
          { x: 1, y: 2 },
        ],
        food: { x: 1, y: 2 },
        direction: 'left',
      },
    })
    engine.start()
    scheduler.tick()
    const state = engine.getState()
    expect(state.status).toBe('gameover')
    expect(state.score).toBe(0)
    expect(storage.getHighScore('standard')).toBe(0)
  })
})

describe('胜利', () => {
  it('棋盘填满时进入 victory 并停止计时器', () => {
    const fullBoardSnake = [
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]
    const { engine, scheduler } = createEngine({
      boardSize: { rows: 4, cols: 4 },
      layout: {
        snake: fullBoardSnake,
        food: { x: 0, y: 3 },
        direction: 'left',
      },
    })
    engine.start({ difficulty: 'standard' })
    scheduler.tick()
    const state = engine.getState()
    expect(state.status).toBe('victory')
    expect(state.snake).toHaveLength(16)
    expect(state.food).toBeNull()
    expect(state.score).toBe(DIFFICULTY_SETTINGS.standard.scorePerFood)
    expect(scheduler.activeCount).toBe(0)
  })
})

describe('暂停 / 继续 / 重开', () => {
  it('暂停会停止计时器，继续只恢复一个计时器', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    expect(scheduler.activeCount).toBe(1)

    engine.pause()
    expect(engine.getState().status).toBe('paused')
    expect(scheduler.activeCount).toBe(0)
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 5 })

    engine.resume()
    expect(engine.getState().status).toBe('running')
    expect(scheduler.activeCount).toBe(1)
    scheduler.tick()
    expect(engine.getState().snake[0]).toEqual({ x: 6, y: 5 })
  })

  it('反复暂停、继续和重开不会产生重复计时器', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    for (let index = 0; index < 3; index += 1) {
      engine.pause()
      engine.resume()
      engine.restart()
      expect(scheduler.activeCount).toBe(1)
    }
  })

  it('重开重置分数与蛇身，但保留难度与最高分', () => {
    const storage = new StorageService(new MemoryStorage())
    const { engine, scheduler } = createEngine({
      layout: straightLayout({ food: { x: 6, y: 5 } }),
      storage,
    })
    engine.start({ difficulty: 'challenge' })
    scheduler.tick()
    expect(engine.getState().score).toBe(DIFFICULTY_SETTINGS.challenge.scorePerFood)

    engine.restart()
    const state = engine.getState()
    expect(state.status).toBe('running')
    expect(state.score).toBe(0)
    expect(state.snake).toHaveLength(3)
    expect(state.difficulty).toBe('challenge')
    expect(state.highScore).toBe(DIFFICULTY_SETTINGS.challenge.scorePerFood)
    expect(scheduler.activeCount).toBe(1)
  })

  it('reset 回到 idle 并生成新的预览棋盘', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    engine.start()
    engine.reset()
    const state = engine.getState()
    expect(state.status).toBe('idle')
    expect(state.score).toBe(0)
    expect(state.food).not.toBeNull()
    expect(scheduler.activeCount).toBe(0)
  })
})

describe('最高分', () => {
  it('读取已有最高分，并在超过时写回存储', () => {
    const memory = new MemoryStorage()
    memory.setItem(`${STORAGE_KEYS.highScorePrefix}standard`, '3')
    const storage = new StorageService(memory)
    const { engine, scheduler } = createEngine({
      layout: straightLayout({ food: { x: 6, y: 5 } }),
      storage,
    })
    expect(engine.getState().highScore).toBe(3)

    engine.start({ difficulty: 'standard' })
    scheduler.tick()
    const state = engine.getState()
    expect(state.score).toBe(DIFFICULTY_SETTINGS.standard.scorePerFood)
    expect(state.highScore).toBe(DIFFICULTY_SETTINGS.standard.scorePerFood)
    expect(memory.getItem(`${STORAGE_KEYS.highScorePrefix}standard`)).toBe(
      String(DIFFICULTY_SETTINGS.standard.scorePerFood),
    )
  })

  it('低于既有最高分时不会覆盖存储', () => {
    const memory = new MemoryStorage()
    memory.setItem(`${STORAGE_KEYS.highScorePrefix}standard`, '99')
    const storage = new StorageService(memory)
    const { engine, scheduler } = createEngine({
      layout: straightLayout({ food: { x: 6, y: 5 } }),
      storage,
    })
    engine.start({ difficulty: 'standard' })
    scheduler.tick()
    expect(engine.getState().highScore).toBe(99)
    expect(memory.getItem(`${STORAGE_KEYS.highScorePrefix}standard`)).toBe('99')
  })

  it('开始新难度时读取该难度的最高分', () => {
    const memory = new MemoryStorage()
    memory.setItem(`${STORAGE_KEYS.highScorePrefix}casual`, '7')
    memory.setItem(`${STORAGE_KEYS.highScorePrefix}challenge`, '21')
    const storage = new StorageService(memory)
    const { engine } = createEngine({ layout: straightLayout(), storage })

    engine.start({ difficulty: 'casual' })
    expect(engine.getState().highScore).toBe(7)
    engine.start({ difficulty: 'challenge' })
    expect(engine.getState().highScore).toBe(21)
    expect(storage.getLastDifficulty()).toBe('challenge')
  })
})

describe('生命周期', () => {
  it('destroy 清理计时器与订阅', () => {
    const { engine, scheduler } = createEngine({ layout: straightLayout() })
    const seen: string[] = []
    engine.onStateChange((state) => seen.push(state.status))
    engine.start()
    expect(seen).toEqual(['running'])

    engine.destroy()
    expect(scheduler.activeCount).toBe(0)
    engine.restart()
    expect(seen).toEqual(['running'])
  })

  it('onStateChange 返回的函数可以取消订阅', () => {
    const { engine } = createEngine({ layout: straightLayout() })
    let calls = 0
    const unsubscribe = engine.onStateChange(() => {
      calls += 1
    })
    engine.start()
    expect(calls).toBe(1)
    unsubscribe()
    engine.pause()
    expect(calls).toBe(1)
  })
})
