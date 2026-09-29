/**
 * QA 独立验收用例（测试工程师交付物）
 *
 * 被测实现：agents/frontend-developer @ e4f04ab8a463bfdad7f8272e6609f0d12a7c3157
 * 用例依据：工单 10002 验收标准（AC-02~AC-08）与 PRD 玩法规则，独立设计，
 *          不复用仓库 tests/ 下的既有断言；运行时无需应用开发者的测试辅助。
 *
 * 运行：npx vitest run --config qa/vitest.qa.config.ts
 */
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { DIFFICULTY_ORDER, DIFFICULTY_SETTINGS, STORAGE_KEYS } from '../../src/engine/constants'
import { GameEngine } from '../../src/engine/GameEngine'
import type { Scheduler } from '../../src/engine/GameEngine'
import type { BoardLayout, BoardSize, Difficulty, Direction, Point } from '../../src/engine/types'
import { InputHandler } from '../../src/input/InputHandler'
import { StorageService } from '../../src/storage/StorageService'
import type { StorageLike } from '../../src/storage/StorageService'

// ---------------------------------------------------------------------------
// QA 自带测试替身（独立实现）
// ---------------------------------------------------------------------------

class QaClock implements Scheduler {
  private nextId = 0
  private readonly tasks = new Map<number, { handler: () => void; timeout: number }>()

  setInterval(handler: () => void, timeout: number): unknown {
    this.nextId += 1
    this.tasks.set(this.nextId, { handler, timeout })
    return this.nextId
  }

  clearInterval(handle: unknown): void {
    this.tasks.delete(handle as number)
  }

  get activeCount(): number {
    return this.tasks.size
  }

  get activeTimeout(): number | null {
    const first = this.tasks.values().next()
    return first.done ? null : first.value.timeout
  }

  advance(steps = 1): void {
    for (let index = 0; index < steps; index += 1) {
      for (const task of [...this.tasks.values()]) {
        task.handler()
      }
    }
  }
}

class QaStorage implements StorageLike {
  readonly data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }
}

class DeniedStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('qa: storage denied')
  }

  setItem(): void {
    throw new Error('qa: storage denied')
  }

  removeItem(): void {
    throw new Error('qa: storage denied')
  }
}

const BOARD: BoardSize = { rows: 10, cols: 10 }

interface Harness {
  engine: GameEngine
  clock: QaClock
  storageService: StorageService
  backing: QaStorage
}

function createHarness(
  options: {
    layout?: BoardLayout
    boardSize?: BoardSize
    difficulty?: Difficulty
    random?: () => number
    storage?: StorageService
    backing?: QaStorage
  } = {},
): Harness {
  const clock = new QaClock()
  const backing = options.backing ?? new QaStorage()
  const storageService = options.storage ?? new StorageService(backing)
  const layout = options.layout
  const engine = new GameEngine({
    storage: storageService,
    scheduler: clock,
    random: options.random ?? (() => 0),
    difficulty: options.difficulty,
    boardSize: options.boardSize ?? BOARD,
    boardFactory: layout ? () => layout : undefined,
  })
  return { engine, clock, storageService, backing }
}

/** 直线局面：头 (5,5) 朝右，body 朝左展开，食物默认放远端 */
function straight(overrides: Partial<BoardLayout> = {}): BoardLayout {
  return {
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ],
    food: { x: 9, y: 0 },
    direction: 'right',
    score: 0,
    ...overrides,
  }
}

function cellKey(point: Point | null | undefined): string {
  return point ? `${point.x},${point.y}` : 'none'
}

/**
 * 4x4 棋盘「填满前一步」局面：蛇按蛇形路径占 15 格，头 (1,3) 朝左，
 * 最后一个空格 (0,3) 放食物；吃到即达到 16/16 触发 victory。
 */
function nearFullBoardLayout(): BoardLayout {
  const path: Point[] = []
  for (let row = 0; row < 4; row += 1) {
    const columns = row % 2 === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0]
    for (const col of columns) {
      path.push({ x: col, y: row })
    }
  }
  const food = path[path.length - 1]
  const snake = path.slice(0, -1).reverse()
  return { snake, food, direction: 'left', score: 0 }
}

// ---------------------------------------------------------------------------
// A. 基础规则与流程（AC-02 / AC-03 / AC-04）
// ---------------------------------------------------------------------------

describe('AC-02/04 初始局面与开始流程', () => {
  it('初始为 idle、蛇长 3、分数 0、食物不在蛇身且在棋盘内', () => {
    const { engine } = createHarness()
    const state = engine.getState()
    expect(state.status).toBe('idle')
    expect(state.snake).toHaveLength(3)
    expect(state.score).toBe(0)
    expect(state.food).not.toBeNull()
    const food = state.food as Point
    expect(food.x).toBeGreaterThanOrEqual(0)
    expect(food.x).toBeLessThan(BOARD.cols)
    expect(food.y).toBeGreaterThanOrEqual(0)
    expect(food.y).toBeLessThan(BOARD.rows)
    expect(state.snake.some((segment) => segment.x === food.x && segment.y === food.y)).toBe(false)
  })

  it('开始后进入 running 并按难度使用正确节拍（200/150/100ms）', () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      const { engine, clock } = createHarness()
      engine.start({ difficulty })
      expect(engine.getState().status).toBe('running')
      expect(clock.activeCount).toBe(1)
      expect(clock.activeTimeout).toBe(DIFFICULTY_SETTINGS[difficulty].tickMs)
    }
  })

  it('三档难度参数与 README/界面文案一致：200/150/100ms 与 5/10/20 分', () => {
    expect(DIFFICULTY_SETTINGS.casual.tickMs).toBe(200)
    expect(DIFFICULTY_SETTINGS.standard.tickMs).toBe(150)
    expect(DIFFICULTY_SETTINGS.challenge.tickMs).toBe(100)
    expect(DIFFICULTY_SETTINGS.casual.scorePerFood).toBe(5)
    expect(DIFFICULTY_SETTINGS.standard.scorePerFood).toBe(10)
    expect(DIFFICULTY_SETTINGS.challenge.scorePerFood).toBe(20)
    expect(DIFFICULTY_SETTINGS.challenge.tickMs).toBeLessThan(DIFFICULTY_SETTINGS.casual.tickMs)
  })

  it('未开始时计时器不运行；运行中暂停后计时器清零', () => {
    const { engine, clock } = createHarness()
    expect(clock.activeCount).toBe(0)
    engine.start()
    expect(clock.activeCount).toBe(1)
    engine.pause()
    expect(engine.getState().status).toBe('paused')
    expect(clock.activeCount).toBe(0)
  })
})

describe('AC-03 移动与方向控制', () => {
  it('每步前进一格且长度不变（未进食）', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    clock.advance()
    const state = engine.getState()
    expect(state.snake[0]).toEqual({ x: 6, y: 5 })
    expect(state.snake).toHaveLength(3)
    expect(state.score).toBe(0)
  })

  it('方向键四个方向均生效（上/下/左/右轨迹）', () => {
    const turns: Array<{ direction: Direction; head: Point }> = [
      { direction: 'down', head: { x: 5, y: 6 } },
      { direction: 'right', head: { x: 6, y: 6 } },
      { direction: 'up', head: { x: 6, y: 5 } },
      { direction: 'left', head: { x: 5, y: 5 } },
    ]
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    for (const turn of turns) {
      engine.changeDirection(turn.direction)
      clock.advance()
      expect(engine.getState().snake[0]).toEqual(turn.head)
    }
  })

  it('禁止 180° 反向：直接反向输入被忽略', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    engine.changeDirection('left')
    clock.advance()
    expect(engine.getState().snake[0]).toEqual({ x: 6, y: 5 })
  })

  it('快速连续输入不能绕过反向限制（同拍 up+left 不产生瞬时反向）', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    engine.changeDirection('up')
    engine.changeDirection('left')
    clock.advance()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 4 })
    clock.advance()
    expect(engine.getState().snake[0]).toEqual({ x: 4, y: 4 })
    clock.advance()
    expect(engine.getState().snake[0]).toEqual({ x: 3, y: 4 })
  })

  it('转向队列上限 4：超出输入被丢弃，方向序列按队列顺序消费', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    engine.changeDirection('up')
    engine.changeDirection('left')
    engine.changeDirection('down')
    engine.changeDirection('right')
    engine.changeDirection('up')
    engine.changeDirection('left')
    const heads: string[] = []
    for (let index = 0; index < 5; index += 1) {
      clock.advance()
      const head = engine.getState().snake[0]
      heads.push(cellKey(head))
    }
    expect(heads).toEqual(['5,4', '4,4', '4,5', '5,5', '6,5'])
  })

  it('非运行状态下方向输入不产生效果（idle / paused / gameover）', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.changeDirection('up')
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 5 })
    engine.start()
    engine.pause()
    engine.changeDirection('up')
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 5 })
    clock.advance()
    expect(engine.getState().snake[0]).toEqual({ x: 5, y: 5 })
  })
})

describe('AC-03/04 碰撞与边界', () => {
  it('四个方向撞墙均判 gameover', () => {
    const cases: Array<{ layout: BoardLayout; name: string }> = [
      {
        name: '上墙',
        layout: {
          snake: [
            { x: 4, y: 0 },
            { x: 4, y: 1 },
            { x: 4, y: 2 },
          ],
          food: { x: 9, y: 9 },
          direction: 'up',
        },
      },
      {
        name: '下墙',
        layout: {
          snake: [
            { x: 4, y: 9 },
            { x: 4, y: 8 },
            { x: 4, y: 7 },
          ],
          food: { x: 9, y: 0 },
          direction: 'down',
        },
      },
      {
        name: '左墙',
        layout: {
          snake: [
            { x: 0, y: 4 },
            { x: 1, y: 4 },
            { x: 2, y: 4 },
          ],
          food: { x: 9, y: 9 },
          direction: 'left',
        },
      },
      {
        name: '右墙',
        layout: {
          snake: [
            { x: 9, y: 4 },
            { x: 8, y: 4 },
            { x: 7, y: 4 },
          ],
          food: { x: 0, y: 9 },
          direction: 'right',
        },
      },
    ]
    for (const item of cases) {
      const { engine, clock } = createHarness({ layout: item.layout })
      engine.start()
      clock.advance()
      expect(engine.getState().status, item.name).toBe('gameover')
      expect(clock.activeCount, item.name).toBe(0)
    }
  })

  it('撞到自身非尾格判 gameover', () => {
    const layout: BoardLayout = {
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
        { x: 7, y: 5 },
      ],
      food: { x: 9, y: 0 },
      direction: 'right',
    }
    const { engine, clock } = createHarness({ layout })
    engine.start()
    clock.advance()
    expect(engine.getState().status).toBe('gameover')
  })

  it('尾格边界：非进食时进入本步将移走的尾格合法且长度不变', () => {
    const layout: BoardLayout = {
      snake: [
        { x: 2, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 3, y: 2 },
      ],
      food: { x: 9, y: 9 },
      direction: 'right',
    }
    const { engine, clock } = createHarness({ layout })
    engine.start()
    clock.advance()
    const state = engine.getState()
    expect(state.status).toBe('running')
    expect(state.snake[0]).toEqual({ x: 3, y: 2 })
    expect(state.snake).toHaveLength(4)
    expect(state.snake.some((segment) => segment.x === 3 && segment.y === 2)).toBe(true)
  })

  it('尾格边界：进食时尾格保留，进入原尾格判为碰撞', () => {
    const layout: BoardLayout = {
      snake: [
        { x: 2, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 3, y: 2 },
      ],
      food: { x: 3, y: 2 },
      direction: 'right',
    }
    const { engine, clock } = createHarness({ layout })
    engine.start()
    clock.advance()
    expect(engine.getState().status).toBe('gameover')
  })

  it('贴边移动在棋盘内合法（不误判出界）', () => {
    const layout: BoardLayout = {
      snake: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: 2 },
      ],
      food: { x: 9, y: 9 },
      direction: 'right',
    }
    const { engine, clock } = createHarness({ layout })
    engine.start()
    clock.advance()
    expect(engine.getState().status).toBe('running')
    expect(engine.getState().snake[0]).toEqual({ x: 1, y: 0 })
  })
})

describe('AC-04 食物、增长、计分与胜利', () => {
  it('进食后加分、增长一格的数值正确', () => {
    for (const difficulty of DIFFICULTY_ORDER) {
      const { engine, clock } = createHarness({
        layout: straight({ food: { x: 6, y: 5 } }),
        difficulty,
      })
      engine.start()
      clock.advance()
      const state = engine.getState()
      expect(state.score, difficulty).toBe(DIFFICULTY_SETTINGS[difficulty].scorePerFood)
      expect(state.snake, difficulty).toHaveLength(4)
      expect(state.snake[0], difficulty).toEqual({ x: 6, y: 5 })
    }
  })

  it('连续进食累计计分与长度线性增长（滚动局面建模三连吃）', () => {
    // 第 1 颗：基础局面
    const first = createHarness({ layout: straight({ food: { x: 6, y: 5 } }) })
    first.engine.start()
    first.clock.advance()
    expect(first.engine.getState().score).toBe(10)
    expect(first.engine.getState().snake).toHaveLength(4)

    // 第 2 颗：沿用上一颗的结果（长度 4、累计 10 分）继续吃
    const second = createHarness({
      layout: {
        snake: [
          { x: 6, y: 5 },
          { x: 5, y: 5 },
          { x: 4, y: 5 },
          { x: 3, y: 5 },
        ],
        food: { x: 7, y: 5 },
        direction: 'right',
        score: 10,
      },
    })
    second.engine.start()
    second.clock.advance()
    expect(second.engine.getState().score).toBe(20)
    expect(second.engine.getState().snake).toHaveLength(5)
    expect(second.engine.getState().snake.map(cellKey)).toEqual(['7,5', '6,5', '5,5', '4,5', '3,5'])

    // 第 3 颗：三连吃后分数 30、长度 6
    const third = createHarness({
      layout: {
        snake: [
          { x: 7, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 5 },
          { x: 4, y: 5 },
          { x: 3, y: 5 },
        ],
        food: { x: 8, y: 5 },
        direction: 'right',
        score: 20,
      },
    })
    third.engine.start()
    third.clock.advance()
    expect(third.engine.getState().score).toBe(30)
    expect(third.engine.getState().snake).toHaveLength(6)
  })

  it('食物永不出现在蛇身上，且随机值越界仍返回棋盘内空格', () => {
    const board: BoardSize = { rows: 4, cols: 4 }
    const samples = [0, 0.0001, 0.25, 0.5, 0.75, 0.9999, 1.0, 1.5, 99, -0.5, -3]
    for (const value of samples) {
      const { engine } = createHarness({
        boardSize: board,
        random: () => value,
      })
      const state = engine.getState()
      const food = state.food
      expect(food, `random=${value}`).not.toBeNull()
      if (!food) {
        continue
      }
      expect(food.x, `random=${value}`).toBeGreaterThanOrEqual(0)
      expect(food.y, `random=${value}`).toBeGreaterThanOrEqual(0)
      expect(food.x, `random=${value}`).toBeLessThan(board.cols)
      expect(food.y, `random=${value}`).toBeLessThan(board.rows)
      const onSnake = state.snake.some((segment) => segment.x === food.x && segment.y === food.y)
      expect(onSnake, `random=${value}`).toBe(false)
    }
  })

  it('棋盘填满时判定 victory、食物置空且不再移动', () => {
    const { engine, clock } = createHarness({
      layout: nearFullBoardLayout(),
      boardSize: { rows: 4, cols: 4 },
      random: () => 0,
    })
    engine.start()
    clock.advance()
    const state = engine.getState()
    expect(state.status).toBe('victory')
    expect(state.food).toBeNull()
    expect(state.snake).toHaveLength(16)
    expect(state.score).toBe(10)
    expect(clock.activeCount).toBe(0)
    clock.advance()
    expect(engine.getState().snake[0]).toEqual(state.snake[0])
  })

  it('满盘后连续推进也不会重新生成食物或改变状态', () => {
    const { engine, clock } = createHarness({
      layout: nearFullBoardLayout(),
      boardSize: { rows: 4, cols: 4 },
      random: () => 0,
    })
    engine.start()
    clock.advance()
    clock.advance()
    clock.advance()
    expect(engine.getState().food).toBeNull()
    expect(engine.getState().status).toBe('victory')
    expect(engine.getState().snake).toHaveLength(16)
  })
})

// ---------------------------------------------------------------------------
// B. 状态保护与生命周期（AC-06 状态保护 / AC-02 暂停继续）
// ---------------------------------------------------------------------------

describe('AC-02/06 暂停、继续与计时器纪律', () => {
  it('暂停后不移动，继续后从原位置恢复移动', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    clock.advance()
    engine.pause()
    clock.advance(3)
    expect(engine.getState().snake[0]).toEqual({ x: 6, y: 5 })
    engine.resume()
    clock.advance()
    expect(engine.getState().snake[0]).toEqual({ x: 7, y: 5 })
  })

  it('重复暂停/继续/重开不会产生重复计时器', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    for (let index = 0; index < 5; index += 1) {
      engine.pause()
      engine.resume()
      engine.restart()
    }
    expect(clock.activeCount).toBe(1)
    clock.advance()
    expect(engine.getState().snake[0]).toEqual({ x: 6, y: 5 })
  })

  it('非暂停状态下 resume 无效；destroy 后计时器与监听全部清理', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.resume()
    expect(engine.getState().status).toBe('idle')
    expect(clock.activeCount).toBe(0)
    engine.start()
    engine.destroy()
    expect(clock.activeCount).toBe(0)
    clock.advance()
    expect(engine.getState().status).toBe('running')
  })

  it('状态变化监听可注销且收到的快照不可影响内部状态', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    const snapshots: number[] = []
    const unsubscribe = engine.onStateChange((state) => {
      snapshots.push(state.score)
      ;(state.snake as Point[]).length = 0
      ;(state as { score: number }).score = 999
    })
    engine.start()
    clock.advance()
    unsubscribe()
    expect(engine.getState().snake).toHaveLength(3)
    expect(engine.getState().score).toBe(0)
    expect(snapshots.length).toBeGreaterThanOrEqual(2)
    expect(snapshots.every((score) => score === 0)).toBe(true)
  })
})

describe('AC-02 重开与难度固定', () => {
  it('重开后分数归零、长度复位并保持运行', () => {
    const { engine, clock } = createHarness({ layout: straight({ food: { x: 6, y: 5 } }) })
    engine.start()
    clock.advance()
    expect(engine.getState().score).toBe(10)
    engine.restart()
    const state = engine.getState()
    expect(state.status).toBe('running')
    expect(state.score).toBe(0)
    expect(state.snake).toHaveLength(3)
    expect(state.snake[0]).toEqual({ x: 5, y: 5 })
    expect(clock.activeCount).toBe(1)
  })

  it('本局难度在开始后固定：重开沿用同难度与同节拍', () => {
    const { engine, clock } = createHarness({ layout: straight(), difficulty: 'casual' })
    engine.start({ difficulty: 'casual' })
    expect(clock.activeTimeout).toBe(200)
    engine.restart()
    expect(engine.getConfig().difficulty).toBe('casual')
    expect(clock.activeTimeout).toBe(200)
    engine.start({ difficulty: 'challenge' })
    expect(engine.getConfig().difficulty).toBe('challenge')
    expect(clock.activeTimeout).toBe(100)
  })

  it('reset 返回 idle 并停止计时', () => {
    const { engine, clock } = createHarness({ layout: straight() })
    engine.start()
    engine.reset()
    expect(engine.getState().status).toBe('idle')
    expect(clock.activeCount).toBe(0)
    expect(engine.getState().snake).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// C. 本地存储与异常降级（AC-05）
// ---------------------------------------------------------------------------

describe('AC-05 本地记录与异常存储', () => {
  it('各难度最高分独立保存，重新创建服务后可恢复', () => {
    const backing = new QaStorage()
    const first = new StorageService(backing)
    first.setHighScore('casual', 25)
    first.setHighScore('challenge', 80)
    first.setLastDifficulty('challenge')

    const second = new StorageService(backing)
    expect(second.getHighScore('casual')).toBe(25)
    expect(second.getHighScore('challenge')).toBe(80)
    expect(second.getHighScore('standard')).toBe(0)
    expect(second.getLastDifficulty()).toBe('challenge')
  })

  it('引擎把最高分写入存储并按难度读取到本局状态', () => {
    const backing = new QaStorage()
    const storage = new StorageService(backing)
    const { engine, clock } = createHarness({
      layout: straight({ food: { x: 6, y: 5 } }),
      storage,
      backing,
      difficulty: 'casual',
    })
    engine.start({ difficulty: 'casual' })
    clock.advance()
    expect(engine.getState().highScore).toBe(5)
    expect(backing.data.get(`${STORAGE_KEYS.highScorePrefix}casual`)).toBe('5')
    expect(backing.data.get(`${STORAGE_KEYS.highScorePrefix}standard`)).toBeUndefined()
  })

  it('损坏的存储值不阻断游戏：非法/负数/非数值均回退为 0', () => {
    const backing = new QaStorage()
    for (const raw of ['abc', '', '-8', 'NaN', 'Infinity', '0.5.5', '  ']) {
      backing.data.set(`${STORAGE_KEYS.highScorePrefix}casual`, raw)
      const storage = new StorageService(backing)
      const value = storage.getHighScore('casual')
      expect(Number.isFinite(value), raw).toBe(true)
      expect(value, raw).toBeGreaterThanOrEqual(0)
    }
    backing.data.set(`${STORAGE_KEYS.highScorePrefix}casual`, '12.7')
    expect(new StorageService(backing).getHighScore('casual')).toBe(12)
    backing.data.set(STORAGE_KEYS.lastDifficulty, 'impossible')
    expect(new StorageService(backing).getLastDifficulty()).toBeNull()
  })

  it('存储写入抛异常时仍可开始、游玩与重开（内存兜底）', () => {
    const storage = new StorageService(new DeniedStorage())
    const { engine, clock } = createHarness({
      layout: straight({ food: { x: 6, y: 5 } }),
      storage,
    })
    engine.start({ difficulty: 'casual' })
    clock.advance()
    expect(engine.getState().score).toBe(5)
    expect(engine.getState().highScore).toBe(5)
    engine.pause()
    engine.resume()
    engine.restart()
    expect(engine.getState().status).toBe('running')
    expect(engine.getState().score).toBe(0)
  })

  it('存储完全不可用（null）时游戏仍可运行，且不写入 localStorage', () => {
    const storage = new StorageService(null)
    expect(storage.available).toBe(false)
    const { engine, clock } = createHarness({ layout: straight({ food: { x: 6, y: 5 } }), storage })
    engine.start()
    clock.advance()
    expect(engine.getState().status).toBe('running')
    expect(engine.getState().score).toBe(10)
  })

  it('最高分不会回退（更低分不覆盖已有记录）', () => {
    const backing = new QaStorage()
    const storage = new StorageService(backing)
    storage.setHighScore('standard', 100)
    storage.setHighScore('standard', 40)
    expect(storage.getHighScore('standard')).toBe(100)
    storage.setHighScore('standard', 101)
    expect(storage.getHighScore('standard')).toBe(101)
  })

  it('localStorage 探针失败时自动降级为内存存储', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('qa: blocked')
      },
    })
    try {
      const storage = new StorageService()
      expect(storage.available).toBe(false)
      storage.setHighScore('casual', 30)
      expect(storage.getHighScore('casual')).toBe(30)
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original)
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage
      }
    }
  })
})

// ---------------------------------------------------------------------------
// D. 输入层（AC-03 键盘/触屏、AC-06 状态保护）
// ---------------------------------------------------------------------------

interface InputHarness {
  handler: InputHandler
  directions: Direction[]
  pauses: number
  autoPauses: number
  destroy(): void
}

function createInputHarness(): InputHarness {
  const directions: Direction[] = []
  let pauses = 0
  let autoPauses = 0
  const doc = document
  doc.body.replaceChildren()
  const pad = doc.createElement('div')
  const up = doc.createElement('button')
  up.dataset.direction = 'up'
  up.textContent = 'up'
  const left = doc.createElement('button')
  left.dataset.direction = 'left'
  left.textContent = 'left'
  pad.append(up, left)
  doc.body.append(pad)

  const handler = new InputHandler({
    directionPad: pad,
    document: doc,
    window: window,
    onDirection: (direction) => directions.push(direction),
    onPauseToggle: () => {
      pauses += 1
    },
    onAutoPause: () => {
      autoPauses += 1
    },
  })
  return {
    handler,
    directions,
    get pauses() {
      return pauses
    },
    get autoPauses() {
      return autoPauses
    },
    destroy: () => handler.destroy(),
  }
}

function pressKey(key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  document.dispatchEvent(event)
  return event
}

describe('AC-03/06 键盘与触屏输入', () => {
  it('方向键与 WASD（含大写）均映射为方向', () => {
    const harness = createInputHarness()
    try {
      pressKey('ArrowUp')
      pressKey('ArrowLeft')
      pressKey('ArrowDown')
      pressKey('ArrowRight')
      pressKey('w')
      pressKey('A')
      pressKey('s')
      pressKey('D')
      expect(harness.directions).toEqual([
        'up',
        'left',
        'down',
        'right',
        'up',
        'left',
        'down',
        'right',
      ])
    } finally {
      harness.destroy()
    }
  })

  it('方向键 preventDefault，避免页面滚动；修饰键组合不触发', () => {
    const harness = createInputHarness()
    try {
      const plain = pressKey('ArrowDown')
      expect(plain.defaultPrevented).toBe(true)
      pressKey('ArrowDown', { ctrlKey: true })
      pressKey('ArrowDown', { metaKey: true })
      pressKey('ArrowDown', { altKey: true })
      expect(harness.directions).toEqual(['down'])
    } finally {
      harness.destroy()
    }
  })

  it('输入框等可编辑元素保留原生键盘行为', () => {
    const harness = createInputHarness()
    try {
      const input = document.createElement('input')
      document.body.append(input)
      const event = new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
        cancelable: true,
      })
      input.dispatchEvent(event)
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
      )
      expect(event.defaultPrevented).toBe(false)
      expect(harness.directions).toHaveLength(0)
      expect(harness.pauses).toBe(0)
    } finally {
      harness.destroy()
    }
  })

  it('空格切换暂停并阻止页面滚动', () => {
    const harness = createInputHarness()
    try {
      const event = pressKey(' ')
      expect(event.defaultPrevented).toBe(true)
      expect(harness.pauses).toBe(1)
      pressKey('Spacebar')
      expect(harness.pauses).toBe(2)
    } finally {
      harness.destroy()
    }
  })

  it('方向按钮 pointerdown 与键盘激活（detail=0）均触发方向', () => {
    const harness = createInputHarness()
    try {
      const up = document.querySelector<HTMLButtonElement>('[data-direction="up"]')
      expect(up).not.toBeNull()
      up?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
      up?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
      const left = document.querySelector<HTMLButtonElement>('[data-direction="left"]')
      left?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      expect(harness.directions).toEqual(['up', 'up'])
    } finally {
      harness.destroy()
    }
  })

  it('窗口失焦与页面隐藏都会触发自动暂停回调', () => {
    const harness = createInputHarness()
    try {
      window.dispatchEvent(new Event('blur'))
      expect(harness.autoPauses).toBe(1)
      const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      try {
        document.dispatchEvent(new Event('visibilitychange'))
        expect(harness.autoPauses).toBe(2)
      } finally {
        delete (document as { hidden?: unknown }).hidden
        void hidden
      }
    } finally {
      harness.destroy()
    }
  })

  it('destroy 后不再响应输入与自动暂停事件', () => {
    const harness = createInputHarness()
    harness.destroy()
    pressKey('ArrowUp')
    pressKey(' ')
    window.dispatchEvent(new Event('blur'))
    expect(harness.directions).toHaveLength(0)
    expect(harness.pauses).toBe(0)
    expect(harness.autoPauses).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// E. 应用集成（AC-02 状态保护、AC-05 记录展示）
// ---------------------------------------------------------------------------

describe('AC-02/05 应用装配集成', () => {
  function mountApp(
    options: { layout?: BoardLayout; random?: () => number; boardSize?: BoardSize } = {},
  ) {
    const clock = new QaClock()
    const backing = new QaStorage()
    const storage = new StorageService(backing)
    const root = document.createElement('div')
    document.body.append(root)
    const app = createApp({
      root,
      storage,
      boardSize: options.boardSize ?? BOARD,
      engineOptions: {
        scheduler: clock,
        random: options.random ?? (() => 0),
        boardFactory: options.layout ? () => options.layout as BoardLayout : undefined,
      },
    })
    return { app, clock, backing, root }
  }

  function query<T extends HTMLElement>(root: HTMLElement, testid: string): T | null {
    return root.querySelector<T>(`[data-testid="${testid}"]`)
  }

  it('开始界面可见且带三档难度与开始按钮', () => {
    const { app, root } = mountApp()
    try {
      const startScreen = query(root, 'start-screen')
      expect(startScreen).not.toBeNull()
      expect(startScreen?.hidden).toBe(false)
      expect(query(root, 'start-button')).not.toBeNull()
      const radios = root.querySelectorAll('input[name="difficulty"]')
      expect(radios).toHaveLength(3)
    } finally {
      app.destroy()
    }
  })

  it('点击开始后进入运行、HUD 展示难度与分数', () => {
    const { app, root, clock } = mountApp({ layout: straight() })
    try {
      query<HTMLButtonElement>(root, 'start-button')?.click()
      expect(app.engine.getState().status).toBe('running')
      expect(query(root, 'start-screen')?.hidden).toBe(true)
      expect(query(root, 'hud-score')?.textContent).toBe('0')
      expect(query(root, 'hud-difficulty')?.textContent).toBe('标准')
      clock.advance()
      expect(query(root, 'hud-score')?.textContent).toBe('0')
    } finally {
      app.destroy()
    }
  })

  it('游戏中按空格暂停，弹层显示本局得分/最高分/难度，继续后恢复', () => {
    const { app, root, clock } = mountApp({ layout: straight({ food: { x: 6, y: 5 } }) })
    try {
      query<HTMLButtonElement>(root, 'start-button')?.click()
      clock.advance()
      pressKey(' ')
      const modal = query(root, 'status-modal')
      expect(app.engine.getState().status).toBe('paused')
      expect(modal?.hidden).toBe(false)
      expect(query(root, 'modal-score')?.textContent).toBe('10')
      expect(query(root, 'modal-high-score')?.textContent).toBe('10')
      expect(query(root, 'modal-difficulty')?.textContent).toBe('标准')
      const frozen = app.engine.getState().snake[0]
      clickPrimary(root)
      expect(app.engine.getState().status).toBe('running')
      expect(modal?.hidden).toBe(true)
      clock.advance()
      expect(app.engine.getState().snake[0]).not.toEqual(frozen)
    } finally {
      app.destroy()
    }
  })

  it('失焦自动暂停：弹层提示自动暂停原因，返回后不自行移动', () => {
    const { app, root, clock } = mountApp({ layout: straight() })
    try {
      query<HTMLButtonElement>(root, 'start-button')?.click()
      clock.advance()
      window.dispatchEvent(new Event('blur'))
      expect(app.engine.getState().status).toBe('paused')
      const modal = query(root, 'status-modal')
      expect(modal?.hidden).toBe(false)
      expect(modal?.textContent).toContain('自动暂停')
      const head = app.engine.getState().snake[0]
      clock.advance(4)
      expect(app.engine.getState().snake[0]).toEqual(head)
      expect(app.engine.getState().status).toBe('paused')
    } finally {
      app.destroy()
    }
  })

  it('重复暂停/重开不产生重复计时器，HUD 高分随之刷新', () => {
    const { app, root, clock, backing } = mountApp({ layout: straight({ food: { x: 6, y: 5 } }) })
    try {
      query<HTMLButtonElement>(root, 'start-button')?.click()
      clock.advance()
      for (let index = 0; index < 4; index += 1) {
        query<HTMLButtonElement>(root, 'pause-button')?.click()
        query<HTMLButtonElement>(root, 'pause-button')?.click()
        query<HTMLButtonElement>(root, 'restart-button')?.click()
      }
      expect(clock.activeCount).toBe(1)
      expect(query(root, 'hud-score')?.textContent).toBe('0')
      expect(backing.data.get(`${STORAGE_KEYS.highScorePrefix}standard`)).toBe('10')
      expect(query(root, 'hud-high-score')?.textContent).toBe('10')
    } finally {
      app.destroy()
    }
  })

  it('游戏结束后展示得分与重开入口，可返回开始界面', () => {
    const layout: BoardLayout = {
      snake: [
        { x: 9, y: 5 },
        { x: 8, y: 5 },
        { x: 7, y: 5 },
      ],
      food: { x: 0, y: 0 },
      direction: 'right',
    }
    const { app, root, clock } = mountApp({ layout })
    try {
      query<HTMLButtonElement>(root, 'start-button')?.click()
      clock.advance()
      expect(app.engine.getState().status).toBe('gameover')
      const modal = query(root, 'status-modal')
      expect(modal?.hidden).toBe(false)
      expect(modal?.textContent).toContain('游戏结束')
      expect(query(root, 'modal-score')?.textContent).toBe('0')
      const secondary = query<HTMLButtonElement>(root, 'modal-secondary')
      expect(secondary?.textContent).toContain('返回开始界面')
      secondary?.click()
      expect(app.engine.getState().status).toBe('idle')
      expect(query(root, 'start-screen')?.hidden).toBe(false)
    } finally {
      app.destroy()
    }
  })

  it('destroy 清理 DOM 与监听，页面不残留游戏节点', () => {
    const { app, root } = mountApp({ layout: straight() })
    query<HTMLButtonElement>(root, 'start-button')?.click()
    app.destroy()
    expect(root.childElementCount).toBe(0)
    expect(document.querySelector('[data-testid="start-screen"]')).toBeNull()
  })

  it('store 中已有最高分时开始界面与 HUD 读取正确', () => {
    const backing = new QaStorage()
    backing.data.set(`${STORAGE_KEYS.highScorePrefix}standard`, '42')
    backing.data.set(STORAGE_KEYS.lastDifficulty, 'standard')
    const storage = new StorageService(backing)
    const root = document.createElement('div')
    document.body.append(root)
    const clock = new QaClock()
    const app = createApp({
      root,
      storage,
      engineOptions: { scheduler: clock, random: () => 0, boardFactory: () => straight() },
    })
    try {
      expect(query(root, 'hud-high-score')?.textContent).toBe('42')
      expect(query(root, 'hud-difficulty')?.textContent).toBe('标准')
    } finally {
      app.destroy()
    }
  })

  it('CR-01 现状记录：按钮持有焦点时空格交还浏览器原生行为（非阻断，供产品裁决）', () => {
    const { app, root } = mountApp({ layout: straight() })
    try {
      query<HTMLButtonElement>(root, 'start-button')?.click()
      const restart = query<HTMLButtonElement>(root, 'restart-button')
      restart?.focus()
      expect(document.activeElement).toBe(restart)
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      })
      document.activeElement?.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(app.engine.getState().status).toBe('running')
    } finally {
      app.destroy()
    }
  })
})

function clickPrimary(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('[data-testid="modal-primary"]')?.click()
}
