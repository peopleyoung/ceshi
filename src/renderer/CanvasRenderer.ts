import { DIRECTION_VECTORS } from '../engine/constants'
import type { BoardSize, Direction, GameState, Point } from '../engine/types'

export interface RendererTheme {
  board: string
  boardAlt: string
  grid: string
  snakeBody: string
  snakeBodyAlt: string
  snakeHead: string
  snakeOutline: string
  food: string
  foodGlow: string
  eye: string
}

export const DEFAULT_THEME: RendererTheme = {
  board: '#0b1220',
  boardAlt: '#0e1728',
  grid: 'rgba(148, 163, 184, 0.10)',
  snakeBody: '#22d3a7',
  snakeBodyAlt: '#16b98f',
  snakeHead: '#7cf3cf',
  snakeOutline: 'rgba(6, 24, 20, 0.55)',
  food: '#fbbf24',
  foodGlow: 'rgba(251, 191, 36, 0.45)',
  eye: '#062018',
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function headDirection(snake: readonly Point[]): Direction {
  const head = snake[0]
  const neck = snake[1]
  if (!neck) {
    return 'right'
  }
  const dx = head.x - neck.x
  const dy = head.y - neck.y
  if (dx === 1) {
    return 'right'
  }
  if (dx === -1) {
    return 'left'
  }
  if (dy === 1) {
    return 'down'
  }
  if (dy === -1) {
    return 'up'
  }
  return 'right'
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly theme: RendererTheme
  private cssSize = 0
  private pixelRatio = 1

  constructor(canvas: HTMLCanvasElement, theme: RendererTheme = DEFAULT_THEME) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.theme = theme
  }

  get supported(): boolean {
    return this.ctx !== null
  }

  get size(): number {
    return this.cssSize
  }

  resize(cssSize: number, pixelRatio = this.resolvePixelRatio()): void {
    const size = Math.max(1, Math.round(cssSize))
    const ratio = Math.max(1, pixelRatio)
    this.cssSize = size
    this.pixelRatio = ratio
    this.canvas.style.width = `${size}px`
    this.canvas.style.height = `${size}px`
    this.canvas.width = Math.round(size * ratio)
    this.canvas.height = Math.round(size * ratio)
  }

  render(state: GameState): void {
    const ctx = this.ctx
    if (!ctx || this.cssSize === 0) {
      return
    }
    const ratio = this.resolvePixelRatio()
    if (ratio !== this.pixelRatio) {
      this.resize(this.cssSize, ratio)
    }

    const { rows, cols } = state.boardSize
    const cell = this.cssSize / Math.max(rows, cols)
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
    ctx.clearRect(0, 0, this.cssSize, this.cssSize)
    this.drawBoard(ctx, state.boardSize, cell)
    if (state.food) {
      this.drawFood(ctx, state.food, cell)
    }
    this.drawSnake(ctx, state.snake, cell)
  }

  private resolvePixelRatio(): number {
    return this.canvas.ownerDocument?.defaultView?.devicePixelRatio ?? this.pixelRatio
  }

  private drawBoard(ctx: CanvasRenderingContext2D, boardSize: BoardSize, cell: number): void {
    const size = this.cssSize
    ctx.fillStyle = this.theme.board
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = this.theme.boardAlt
    for (let row = 0; row < boardSize.rows; row += 1) {
      for (let col = 0; col < boardSize.cols; col += 1) {
        if ((row + col) % 2 === 1) {
          ctx.fillRect(col * cell, row * cell, cell, cell)
        }
      }
    }

    ctx.strokeStyle = this.theme.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let col = 1; col < boardSize.cols; col += 1) {
      const x = Math.round(col * cell) + 0.5
      ctx.moveTo(x, 0)
      ctx.lineTo(x, size)
    }
    for (let row = 1; row < boardSize.rows; row += 1) {
      const y = Math.round(row * cell) + 0.5
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
    }
    ctx.stroke()
  }

  private drawFood(ctx: CanvasRenderingContext2D, food: Point, cell: number): void {
    const centerX = (food.x + 0.5) * cell
    const centerY = (food.y + 0.5) * cell
    const radius = Math.max(2, cell * 0.32)

    ctx.save()
    ctx.shadowColor = this.theme.foodGlow
    ctx.shadowBlur = Math.max(4, cell * 0.6)
    ctx.fillStyle = this.theme.food
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.beginPath()
    ctx.arc(centerX - radius * 0.3, centerY - radius * 0.35, radius * 0.28, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawSnake(ctx: CanvasRenderingContext2D, snake: readonly Point[], cell: number): void {
    if (snake.length === 0) {
      return
    }
    const inset = Math.max(0.6, cell * 0.08)
    const segmentSize = cell - inset * 2
    const radius = Math.max(2, cell * 0.28)

    for (let index = snake.length - 1; index >= 1; index -= 1) {
      const segment = snake[index]
      ctx.fillStyle = index % 2 === 0 ? this.theme.snakeBody : this.theme.snakeBodyAlt
      roundedRect(
        ctx,
        segment.x * cell + inset,
        segment.y * cell + inset,
        segmentSize,
        segmentSize,
        radius,
      )
      ctx.fill()
    }

    const head = snake[0]
    ctx.fillStyle = this.theme.snakeHead
    ctx.strokeStyle = this.theme.snakeOutline
    ctx.lineWidth = Math.max(1, cell * 0.06)
    roundedRect(ctx, head.x * cell + inset, head.y * cell + inset, segmentSize, segmentSize, radius)
    ctx.fill()
    ctx.stroke()

    this.drawEyes(ctx, head, cell, headDirection(snake))
  }

  private drawEyes(
    ctx: CanvasRenderingContext2D,
    head: Point,
    cell: number,
    direction: Direction,
  ): void {
    const centerX = (head.x + 0.5) * cell
    const centerY = (head.y + 0.5) * cell
    const vector = DIRECTION_VECTORS[direction]
    const perpendicular = { x: -vector.y, y: vector.x }
    const eyeOffset = cell * 0.2
    const forwardOffset = cell * 0.16
    const eyeRadius = Math.max(1, cell * 0.09)

    ctx.fillStyle = this.theme.eye
    for (const sign of [-1, 1]) {
      const x = centerX + vector.x * forwardOffset + perpendicular.x * eyeOffset * sign
      const y = centerY + vector.y * forwardOffset + perpendicular.y * eyeOffset * sign
      ctx.beginPath()
      ctx.arc(x, y, eyeRadius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
