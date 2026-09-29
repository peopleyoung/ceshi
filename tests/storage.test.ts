import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '../src/engine/constants'
import { StorageService } from '../src/storage/StorageService'
import { MemoryStorage, ThrowingStorage } from './helpers'

describe('StorageService 正常读写', () => {
  it('默认最高分为 0，写入后可读取', () => {
    const service = new StorageService(new MemoryStorage())
    expect(service.getHighScore('casual')).toBe(0)
    service.setHighScore('casual', 12)
    expect(service.getHighScore('casual')).toBe(12)
    expect(service.getHighScore('standard')).toBe(0)
  })

  it('各难度的最高分互相独立', () => {
    const service = new StorageService(new MemoryStorage())
    service.setHighScore('casual', 5)
    service.setHighScore('standard', 10)
    service.setHighScore('challenge', 20)
    expect(service.getHighScore('casual')).toBe(5)
    expect(service.getHighScore('standard')).toBe(10)
    expect(service.getHighScore('challenge')).toBe(20)
  })

  it('最高分只升不降', () => {
    const service = new StorageService(new MemoryStorage())
    service.setHighScore('standard', 30)
    service.setHighScore('standard', 10)
    expect(service.getHighScore('standard')).toBe(30)
  })

  it('记录并读取最近使用的难度', () => {
    const service = new StorageService(new MemoryStorage())
    expect(service.getLastDifficulty()).toBeNull()
    service.setLastDifficulty('challenge')
    expect(service.getLastDifficulty()).toBe('challenge')
  })

  it('忽略非法分数', () => {
    const service = new StorageService(new MemoryStorage())
    service.setHighScore('standard', Number.NaN)
    service.setHighScore('standard', Number.POSITIVE_INFINITY)
    service.setHighScore('standard', -5)
    expect(service.getHighScore('standard')).toBe(0)
  })
})

describe('StorageService 数据损坏与不可用降级', () => {
  it('损坏的最高分按 0 处理', () => {
    const memory = new MemoryStorage()
    memory.setItem(`${STORAGE_KEYS.highScorePrefix}standard`, 'not-a-number')
    memory.setItem(`${STORAGE_KEYS.highScorePrefix}casual`, '-12')
    memory.setItem(`${STORAGE_KEYS.highScorePrefix}challenge`, '')
    const service = new StorageService(memory)
    expect(service.getHighScore('standard')).toBe(0)
    expect(service.getHighScore('casual')).toBe(0)
    expect(service.getHighScore('challenge')).toBe(0)
  })

  it('损坏的难度记录按未知处理', () => {
    const memory = new MemoryStorage()
    memory.setItem(STORAGE_KEYS.lastDifficulty, 'impossible')
    const service = new StorageService(memory)
    expect(service.getLastDifficulty()).toBeNull()
  })

  it('存储读写抛错时降级到内存，不影响继续游玩', () => {
    const service = new StorageService(new ThrowingStorage())
    expect(service.getHighScore('standard')).toBe(0)
    expect(service.getLastDifficulty()).toBeNull()
    service.setHighScore('standard', 25)
    service.setLastDifficulty('casual')
    expect(service.getHighScore('standard')).toBe(25)
    expect(service.getLastDifficulty()).toBe('casual')
  })

  it('传入 null 表示存储不可用，仍可正常读写', () => {
    const service = new StorageService(null)
    service.setHighScore('challenge', 8)
    service.setLastDifficulty('challenge')
    expect(service.getHighScore('challenge')).toBe(8)
    expect(service.getLastDifficulty()).toBe('challenge')
  })

  it('localStorage 访问抛错时自动降级', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('存储被禁用')
      },
    })
    try {
      const service = new StorageService()
      expect(service.getHighScore('standard')).toBe(0)
      service.setHighScore('standard', 15)
      expect(service.getHighScore('standard')).toBe(15)
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'localStorage', descriptor)
      }
    }
  })
})

describe('StorageService 浏览器持久化', () => {
  it('默认写入 localStorage 并可在新实例中恢复', () => {
    window.localStorage.clear()
    const service = new StorageService()
    service.setHighScore('challenge', 8)
    service.setLastDifficulty('casual')

    expect(window.localStorage.getItem(`${STORAGE_KEYS.highScorePrefix}challenge`)).toBe('8')
    expect(window.localStorage.getItem(STORAGE_KEYS.lastDifficulty)).toBe('casual')

    const reloaded = new StorageService()
    expect(reloaded.getHighScore('challenge')).toBe(8)
    expect(reloaded.getLastDifficulty()).toBe('casual')
    window.localStorage.clear()
  })
})
