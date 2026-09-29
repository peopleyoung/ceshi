import type { Scheduler } from '../src/engine/GameEngine'
import type { Point } from '../src/engine/types'
import type { StorageLike } from '../src/storage/StorageService'

export function requireFood(food: Point | null): Point {
  if (!food) {
    throw new Error('期望棋盘上存在食物，但当前没有')
  }
  return food
}

export class FakeScheduler implements Scheduler {
  private nextId = 1
  private readonly handlers = new Map<number, () => void>()
  private readonly timeouts = new Map<number, number>()

  setInterval(handler: () => void, timeout: number): unknown {
    const id = this.nextId
    this.nextId += 1
    this.handlers.set(id, handler)
    this.timeouts.set(id, timeout)
    return id
  }

  clearInterval(handle: unknown): void {
    this.handlers.delete(handle as number)
    this.timeouts.delete(handle as number)
  }

  get activeCount(): number {
    return this.handlers.size
  }

  get activeTimeout(): number | null {
    const first = this.timeouts.values().next()
    return first.done ? null : first.value
  }

  tick(times = 1): void {
    for (let index = 0; index < times; index += 1) {
      for (const handler of [...this.handlers.values()]) {
        handler()
      }
    }
  }
}

export class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>()

  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }

  removeItem(key: string): void {
    this.data.delete(key)
  }

  dump(): Record<string, string> {
    return Object.fromEntries(this.data.entries())
  }
}

export class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('storage denied')
  }

  setItem(): void {
    throw new Error('storage denied')
  }

  removeItem(): void {
    throw new Error('storage denied')
  }
}

export interface FakeCanvasContext {
  context: CanvasRenderingContext2D
  calls: string[]
}

export function createFakeCanvasContext(): FakeCanvasContext {
  const calls: string[] = []
  const context = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'canvas') {
          return null
        }
        return (..._args: unknown[]) => {
          calls.push(String(property))
        }
      },
      set() {
        return true
      },
    },
  )
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}
