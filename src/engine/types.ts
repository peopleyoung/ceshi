export type Difficulty = 'casual' | 'standard' | 'challenge'

export type Direction = 'up' | 'down' | 'left' | 'right'

export type GameStatus = 'idle' | 'running' | 'paused' | 'gameover' | 'victory'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface BoardSize {
  readonly rows: number
  readonly cols: number
}

export interface GameConfig {
  readonly difficulty: Difficulty
  readonly boardSize: BoardSize
}

export interface GameState {
  readonly status: GameStatus
  readonly snake: readonly Point[]
  readonly food: Point | null
  readonly score: number
  readonly highScore: number
  readonly difficulty: Difficulty
  readonly boardSize: BoardSize
}

export interface BoardLayout {
  readonly snake: readonly Point[]
  readonly food: Point | null
  readonly score?: number
  readonly direction?: Direction
}
