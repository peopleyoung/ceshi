import {
  DEFAULT_BOARD_SIZE,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_SETTINGS,
  DIRECTION_VECTORS,
  INITIAL_SNAKE_LENGTH,
  MAX_QUEUED_DIRECTIONS,
  MIN_BOARD_SIZE,
  OPPOSITE_DIRECTION,
} from './constants'
import type {
  BoardLayout,
  BoardSize,
  Direction,
  Difficulty,
  GameConfig,
  GameState,
  GameStatus,
  Point,
} from './types'
import type { StorageService } from '../storage/StorageService'

export interface Scheduler {
  setInterval(handler: () => void, timeout: number): unknown
  clearInterval(handle: unknown): void
}

export const browserScheduler: Scheduler = {
  setInterval: (handler, timeout) => globalThis.setInterval(handler, timeout),
  clearInterval: (handle) => {
    globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>)
  },
}

export type StateListener = (state: GameState) => void

export interface GameEngineOptions {
  storage?: StorageService
  scheduler?: Scheduler
  random?: () => number
  difficulty?: Difficulty
  boardSize?: BoardSize
  /** 注入初始局面，供测试构造特定棋盘场景 */
  boardFactory?: (config: GameConfig) => BoardLayout
}

interface RoundSetup {
  snake: Point[]
  food: Point | null
  score: number
  direction: Direction
}

export function normalizeBoardSize(boardSize: BoardSize): BoardSize {
  const rows = Math.max(MIN_BOARD_SIZE, Math.floor(boardSize.rows))
  const cols = Math.max(MIN_BOARD_SIZE, Math.floor(boardSize.cols))
  return { rows, cols }
}

export function createStartSnake(boardSize: BoardSize): Point[] {
  const { rows, cols } = normalizeBoardSize(boardSize)
  const headX = Math.max(INITIAL_SNAKE_LENGTH - 1, Math.floor(cols / 2))
  const y = Math.floor(rows / 2)
  const snake: Point[] = []
  for (let index = 0; index < INITIAL_SNAKE_LENGTH; index += 1) {
    snake.push({ x: headX - index, y })
  }
  return snake
}

export function pickFoodCell(
  snake: readonly Point[],
  boardSize: BoardSize,
  random: () => number,
): Point | null {
  const total = boardSize.rows * boardSize.cols
  const occupied = new Set(snake.map((segment) => segment.y * boardSize.cols + segment.x))
  const empty: number[] = []
  for (let index = 0; index < total; index += 1) {
    if (!occupied.has(index)) {
      empty.push(index)
    }
  }
  if (empty.length === 0) {
    return null
  }
  const rawIndex = Math.floor(random() * empty.length)
  const safeIndex = Math.min(Math.max(rawIndex, 0), empty.length - 1)
  const cell = empty[safeIndex]
  return { x: cell % boardSize.cols, y: Math.floor(cell / boardSize.cols) }
}

export function isOutOfBounds(point: Point, boardSize: BoardSize): boolean {
  return point.x < 0 || point.y < 0 || point.x >= boardSize.cols || point.y >= boardSize.rows
}

export function containsPoint(points: readonly Point[], target: Point): boolean {
  return points.some((point) => point.x === target.x && point.y === target.y)
}

export function resolveDirection(current: Direction, queued: Direction | undefined): Direction {
  if (!queued || queued === current) {
    return current
  }
  if (queued === OPPOSITE_DIRECTION[current]) {
    return current
  }
  return queued
}

export class GameEngine {
  private readonly storage?: StorageService
  private readonly scheduler: Scheduler
  private readonly random: () => number
  private readonly boardFactory?: (config: GameConfig) => BoardLayout

  private difficulty: Difficulty
  private boardSize: BoardSize
  private status: GameStatus = 'idle'
  private snake: Point[] = []
  private food: Point | null = null
  private score = 0
  private highScore = 0
  private direction: Direction = 'right'
  private pendingDirections: Direction[] = []
  private tickHandle: unknown = null
  private listeners = new Set<StateListener>()
  private destroyed = false

  constructor(options: GameEngineOptions = {}) {
    this.storage = options.storage
    this.scheduler = options.scheduler ?? browserScheduler
    this.random = options.random ?? Math.random
    this.boardFactory = options.boardFactory
    this.difficulty = options.difficulty ?? DEFAULT_DIFFICULTY
    this.boardSize = normalizeBoardSize(options.boardSize ?? DEFAULT_BOARD_SIZE)
    this.highScore = this.storage?.getHighScore(this.difficulty) ?? 0
    this.loadRound(this.createRoundSetup())
    this.status = 'idle'
  }

  getState(): GameState {
    return {
      status: this.status,
      snake: this.snake.map((segment) => ({ ...segment })),
      food: this.food ? { ...this.food } : null,
      score: this.score,
      highScore: this.highScore,
      difficulty: this.difficulty,
      boardSize: { ...this.boardSize },
    }
  }

  getConfig(): GameConfig {
    return { difficulty: this.difficulty, boardSize: { ...this.boardSize } }
  }

  start(config?: Partial<GameConfig>): void {
    if (this.destroyed) {
      return
    }
    if (config?.difficulty && config.difficulty !== this.difficulty) {
      this.difficulty = config.difficulty
      this.highScore = this.storage?.getHighScore(this.difficulty) ?? 0
    }
    if (config?.boardSize) {
      this.boardSize = normalizeBoardSize(config.boardSize)
    }
    this.storage?.setLastDifficulty(this.difficulty)
    this.loadRound(this.createRoundSetup())
    this.status = 'running'
    this.scheduleTick()
    this.notify()
  }

  restart(): void {
    this.start()
  }

  reset(): void {
    if (this.destroyed) {
      return
    }
    this.clearTick()
    this.loadRound(this.createRoundSetup())
    this.status = 'idle'
    this.notify()
  }

  pause(): void {
    if (this.status !== 'running') {
      return
    }
    this.status = 'paused'
    this.clearTick()
    this.notify()
  }

  resume(): void {
    if (this.status !== 'paused') {
      return
    }
    this.status = 'running'
    this.scheduleTick()
    this.notify()
  }

  changeDirection(direction: Direction): void {
    if (this.status !== 'running') {
      return
    }
    const reference = this.pendingDirections.at(-1) ?? this.direction
    if (direction === reference || direction === OPPOSITE_DIRECTION[reference]) {
      return
    }
    if (this.pendingDirections.length >= MAX_QUEUED_DIRECTIONS) {
      return
    }
    this.pendingDirections.push(direction)
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  step(): void {
    if (this.status !== 'running') {
      return
    }
    const head = this.snake[0]
    this.direction = resolveDirection(this.direction, this.pendingDirections.shift())
    const delta = DIRECTION_VECTORS[this.direction]
    const nextHead: Point = { x: head.x + delta.x, y: head.y + delta.y }

    if (isOutOfBounds(nextHead, this.boardSize)) {
      this.finish('gameover')
      return
    }

    const eatsFood = this.food !== null && nextHead.x === this.food.x && nextHead.y === this.food.y
    // 蛇尾在本步会移走，因此不参与碰撞判定；进食时蛇尾保留，需要判定
    const collisionBody = eatsFood ? this.snake : this.snake.slice(0, -1)
    if (containsPoint(collisionBody, nextHead)) {
      this.finish('gameover')
      return
    }

    this.snake = eatsFood ? [nextHead, ...this.snake] : [nextHead, ...this.snake.slice(0, -1)]

    if (!eatsFood) {
      this.notify()
      return
    }

    this.score += DIFFICULTY_SETTINGS[this.difficulty].scorePerFood
    this.updateHighScore()

    if (this.snake.length >= this.boardSize.rows * this.boardSize.cols) {
      this.food = null
      this.finish('victory')
      return
    }

    this.food = pickFoodCell(this.snake, this.boardSize, this.random)
    this.notify()
  }

  destroy(): void {
    this.destroyed = true
    this.clearTick()
    this.listeners.clear()
  }

  private createRoundSetup(): RoundSetup {
    if (this.boardFactory) {
      const layout = this.boardFactory(this.getConfig())
      const direction = layout.direction ?? 'right'
      return {
        snake: layout.snake.map((segment) => ({ ...segment })),
        food: layout.food ? { ...layout.food } : null,
        score: layout.score ?? 0,
        direction,
      }
    }
    const snake = createStartSnake(this.boardSize)
    return {
      snake,
      food: pickFoodCell(snake, this.boardSize, this.random),
      score: 0,
      direction: 'right',
    }
  }

  private loadRound(setup: RoundSetup): void {
    this.snake = setup.snake
    this.food = setup.food
    this.score = setup.score
    this.direction = setup.direction
    this.pendingDirections = []
  }

  private scheduleTick(): void {
    this.clearTick()
    const { tickMs } = DIFFICULTY_SETTINGS[this.difficulty]
    this.tickHandle = this.scheduler.setInterval(() => {
      this.step()
    }, tickMs)
  }

  private clearTick(): void {
    if (this.tickHandle !== null) {
      this.scheduler.clearInterval(this.tickHandle)
      this.tickHandle = null
    }
  }

  private updateHighScore(): void {
    if (this.score <= this.highScore) {
      return
    }
    this.highScore = this.score
    this.storage?.setHighScore(this.difficulty, this.highScore)
  }

  private finish(status: Extract<GameStatus, 'gameover' | 'victory'>): void {
    this.status = status
    this.clearTick()
    this.updateHighScore()
    this.pendingDirections = []
    this.notify()
  }

  private notify(): void {
    if (this.listeners.size === 0) {
      return
    }
    const snapshot = this.getState()
    for (const listener of [...this.listeners]) {
      listener(snapshot)
    }
  }
}
