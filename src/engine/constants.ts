import type { BoardSize, Direction, Difficulty, Point } from './types'

export interface DifficultySettings {
  readonly label: string
  readonly summary: string
  readonly tickMs: number
  readonly scorePerFood: number
}

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['casual', 'standard', 'challenge']

export const DIFFICULTY_SETTINGS: Readonly<Record<Difficulty, DifficultySettings>> = {
  casual: {
    label: '休闲',
    summary: '节奏舒缓',
    tickMs: 200,
    scorePerFood: 5,
  },
  standard: {
    label: '标准',
    summary: '速度均衡',
    tickMs: 150,
    scorePerFood: 10,
  },
  challenge: {
    label: '挑战',
    summary: '节奏紧凑',
    tickMs: 100,
    scorePerFood: 20,
  },
}

export const DEFAULT_DIFFICULTY: Difficulty = 'standard'

export const DEFAULT_BOARD_SIZE: BoardSize = { rows: 20, cols: 20 }

export const MIN_BOARD_SIZE = 4

export const INITIAL_SNAKE_LENGTH = 3

export const MAX_QUEUED_DIRECTIONS = 4

export const DIRECTION_VECTORS: Readonly<Record<Direction, Point>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const OPPOSITE_DIRECTION: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

export const STORAGE_KEYS = {
  highScorePrefix: 'web-snake.high-score.',
  lastDifficulty: 'web-snake.last-difficulty',
} as const

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTY_ORDER as readonly string[]).includes(value)
}

export function difficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_SETTINGS[difficulty].label
}
