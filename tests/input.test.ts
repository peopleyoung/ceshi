import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { InputHandler } from '../src/input/InputHandler'
import type { Direction } from '../src/engine/types'

interface Harness {
  handler: InputHandler
  directions: Direction[]
  pauses: number[]
  autoPauses: () => number
  pad: HTMLElement
}

let harness: Harness | null = null

function getButton(pad: HTMLElement, direction: Direction): HTMLButtonElement {
  const button = pad.querySelector<HTMLButtonElement>(`[data-direction="${direction}"]`)
  if (!button) {
    throw new Error(`未找到方向按钮: ${direction}`)
  }
  return button
}

function setup(): Harness {
  const directions: Direction[] = []
  const pauses: number[] = []
  let autoPauses = 0

  const pad = document.createElement('div')
  for (const direction of ['up', 'left', 'down', 'right']) {
    const button = document.createElement('button')
    button.dataset.direction = direction
    button.setAttribute('aria-label', `方向：${direction}`)
    pad.append(button)
  }
  document.body.append(pad)

  const handler = new InputHandler({
    directionPad: pad,
    onDirection: (direction) => directions.push(direction),
    onPauseToggle: () => pauses.push(1),
    onAutoPause: () => {
      autoPauses += 1
    },
  })

  harness = { handler, directions, pauses, autoPauses: () => autoPauses, pad }
  return harness
}

function pressKey(key: string, extra: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...extra })
  document.dispatchEvent(event)
  return event
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  harness?.handler.destroy()
  harness = null
  document.body.innerHTML = ''
})

describe('键盘输入', () => {
  it('方向键映射到四个方向并阻止页面滚动', () => {
    const { directions } = setup()
    const cases: Array<[string, Direction]> = [
      ['ArrowUp', 'up'],
      ['ArrowDown', 'down'],
      ['ArrowLeft', 'left'],
      ['ArrowRight', 'right'],
    ]
    for (const [key, direction] of cases) {
      const event = pressKey(key)
      expect(event.defaultPrevented).toBe(true)
      expect(directions.at(-1)).toBe(direction)
    }
    expect(directions).toHaveLength(cases.length)
  })

  it('WASD 与大小写均可控制方向', () => {
    const { directions } = setup()
    const cases: Array<[string, Direction]> = [
      ['w', 'up'],
      ['s', 'down'],
      ['a', 'left'],
      ['d', 'right'],
      ['W', 'up'],
      ['D', 'right'],
    ]
    for (const [key, direction] of cases) {
      const event = pressKey(key)
      expect(event.defaultPrevented).toBe(true)
      expect(directions.at(-1)).toBe(direction)
    }
  })

  it('空格触发暂停切换', () => {
    const { pauses } = setup()
    const first = pressKey(' ', { code: 'Space' })
    expect(first.defaultPrevented).toBe(true)
    const second = pressKey('Spacebar', { code: 'Space' })
    expect(second.defaultPrevented).toBe(true)
    expect(pauses).toHaveLength(2)
  })

  it('不拦截无关按键与组合键', () => {
    const { directions, pauses } = setup()
    const plain = pressKey('x')
    expect(plain.defaultPrevented).toBe(false)
    const withModifier = pressKey('a', { ctrlKey: true })
    expect(withModifier.defaultPrevented).toBe(false)
    expect(directions).toHaveLength(0)
    expect(pauses).toHaveLength(0)
  })

  it('输入框内不劫持键盘行为', () => {
    const { directions } = setup()
    const input = document.createElement('input')
    document.body.append(input)
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      cancelable: true,
      bubbles: true,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(directions).toHaveLength(0)
  })

  it('焦点在按钮上时空格交给按钮原生行为', () => {
    const { pauses, pad } = setup()
    const button = getButton(pad, 'up')
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      cancelable: true,
      bubbles: true,
    })
    button.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(pauses).toHaveLength(0)
  })
})

describe('屏幕方向按钮', () => {
  it('按下方向按钮触发方向并阻止页面滚动', () => {
    const { directions, pad } = setup()
    const button = getButton(pad, 'up')
    const event = new Event('pointerdown', { cancelable: true, bubbles: true })
    button.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(directions).toEqual(['up'])
    expect(button.dataset.pressed).toBe('true')

    button.dispatchEvent(new Event('pointerup'))
    expect(button.dataset.pressed).toBeUndefined()

    for (const direction of ['left', 'down', 'right'] as Direction[]) {
      getButton(pad, direction).dispatchEvent(new Event('pointerdown', { cancelable: true }))
      expect(directions.at(-1)).toBe(direction)
    }
  })

  it('键盘激活按钮只触发一次方向', () => {
    const { directions, pad } = setup()
    const button = getButton(pad, 'left')
    button.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }))
    expect(directions).toEqual(['left'])

    button.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }))
    expect(directions).toEqual(['left'])
  })
})

describe('自动暂停', () => {
  it('窗口失焦触发自动暂停', () => {
    const { autoPauses } = setup()
    window.dispatchEvent(new Event('blur'))
    expect(autoPauses()).toBe(1)
  })

  it('页面隐藏时触发自动暂停，重新可见不触发', () => {
    const { autoPauses } = setup()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(autoPauses()).toBe(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(autoPauses()).toBe(1)
  })
})

describe('销毁', () => {
  it('destroy 后不再响应键盘、按钮与失焦事件', () => {
    const { handler, directions, pauses, autoPauses, pad } = setup()
    handler.destroy()

    pressKey('ArrowUp')
    pressKey(' ', { code: 'Space' })
    getButton(pad, 'down').dispatchEvent(new Event('pointerdown', { cancelable: true }))
    window.dispatchEvent(new Event('blur'))

    expect(directions).toHaveLength(0)
    expect(pauses).toHaveLength(0)
    expect(autoPauses()).toBe(0)
  })
})
