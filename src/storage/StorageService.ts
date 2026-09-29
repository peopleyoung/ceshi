import { DIFFICULTY_ORDER, STORAGE_KEYS, isDifficulty } from '../engine/constants'
import type { Difficulty } from '../engine/types'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function resolveBrowserStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage as StorageLike | undefined
    if (!storage) {
      return null
    }
    const probeKey = `${STORAGE_KEYS.lastDifficulty}.probe`
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return storage
  } catch {
    return null
  }
}

export class StorageService {
  private readonly storage: StorageLike | null
  private readonly memory = new Map<string, string>()

  constructor(storage?: StorageLike | null) {
    this.storage = storage === undefined ? resolveBrowserStorage() : storage
  }

  get available(): boolean {
    return this.storage !== null
  }

  getHighScore(difficulty: Difficulty): number {
    const raw = this.read(`${STORAGE_KEYS.highScorePrefix}${difficulty}`)
    if (raw === null) {
      return 0
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) {
      return 0
    }
    return Math.floor(value)
  }

  setHighScore(difficulty: Difficulty, score: number): void {
    if (!Number.isFinite(score) || score < 0) {
      return
    }
    const normalized = Math.floor(score)
    if (normalized <= this.getHighScore(difficulty)) {
      return
    }
    this.write(`${STORAGE_KEYS.highScorePrefix}${difficulty}`, String(normalized))
  }

  getLastDifficulty(): Difficulty | null {
    const raw = this.read(STORAGE_KEYS.lastDifficulty)
    return isDifficulty(raw) ? raw : null
  }

  setLastDifficulty(difficulty: Difficulty): void {
    if (!DIFFICULTY_ORDER.includes(difficulty)) {
      return
    }
    this.write(STORAGE_KEYS.lastDifficulty, difficulty)
  }

  private read(key: string): string | null {
    if (this.storage) {
      try {
        const value = this.storage.getItem(key)
        if (value !== null) {
          return value
        }
      } catch {
        // 读取异常时退回内存副本
      }
    }
    return this.memory.get(key) ?? null
  }

  private write(key: string, value: string): void {
    this.memory.set(key, value)
    if (!this.storage) {
      return
    }
    try {
      this.storage.setItem(key, value)
    } catch {
      // 存储写入失败（隐私模式、配额）时保留内存副本，游戏继续可用
    }
  }
}
