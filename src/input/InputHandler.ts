import type { Direction } from '../engine/types'

export interface InputHandlerOptions {
  onDirection?: (direction: Direction) => void
  onPauseToggle?: () => void
  onAutoPause?: () => void
  directionPad?: ParentNode | null
  document?: Document
  window?: Window
}

const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

const PAUSE_KEYS = new Set([' ', 'spacebar'])

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') {
    return false
  }
  const tag = element.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true
  }
  return element.isContentEditable === true
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') {
    return false
  }
  const tag = element.tagName.toLowerCase()
  if (tag === 'button' || tag === 'a' || tag === 'summary') {
    return true
  }
  return element.getAttribute?.('role') === 'button'
}

export class InputHandler {
  private readonly doc: Document
  private readonly win: Window
  private readonly options: InputHandlerOptions
  private readonly directionButtons: HTMLButtonElement[] = []
  private readonly cleanups: Array<() => void> = []
  private destroyed = false

  constructor(options: InputHandlerOptions = {}) {
    this.options = options
    this.doc = options.document ?? document
    this.win = options.window ?? window
    this.bindKeyboard()
    this.bindDirectionPad()
    this.bindAutoPause()
  }

  destroy(): void {
    this.destroyed = true
    while (this.cleanups.length > 0) {
      this.cleanups.pop()?.()
    }
    this.directionButtons.length = 0
  }

  private listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void
  private listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void
  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void
  private listen(
    target: Window | Document | HTMLElement,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options)
    this.cleanups.push(() => target.removeEventListener(type, handler, options))
  }

  private emitDirection(direction: Direction): void {
    if (!this.destroyed) {
      this.options.onDirection?.(direction)
    }
  }

  private bindKeyboard(): void {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      if (isEditableTarget(event.target)) {
        return
      }
      const key = event.key.toLowerCase()
      const direction = KEY_DIRECTIONS[key]
      if (direction) {
        event.preventDefault()
        this.emitDirection(direction)
        return
      }
      if (PAUSE_KEYS.has(key) || event.code === 'Space') {
        if (isInteractiveTarget(event.target)) {
          return
        }
        event.preventDefault()
        if (!this.destroyed) {
          this.options.onPauseToggle?.()
        }
      }
    }
    this.listen(this.doc, 'keydown', onKeyDown)
  }

  private bindDirectionPad(): void {
    const container = this.options.directionPad
    if (!container) {
      return
    }
    const buttons = container.querySelectorAll<HTMLButtonElement>('[data-direction]')
    for (const button of buttons) {
      const direction = button.dataset.direction as Direction | undefined
      if (!direction) {
        continue
      }
      this.directionButtons.push(button)
      const onPointerDown = (event: Event) => {
        event.preventDefault()
        button.dataset.pressed = 'true'
        this.emitDirection(direction)
      }
      const onPointerUp = () => {
        delete button.dataset.pressed
      }
      const onClick = (event: MouseEvent) => {
        // 键盘激活按钮不触发 pointerdown，这里补齐 Enter/Space 触发路径
        if (event.detail === 0) {
          this.emitDirection(direction)
        }
      }
      this.listen(button, 'pointerdown', onPointerDown)
      this.listen(button, 'pointerup', onPointerUp)
      this.listen(button, 'pointercancel', onPointerUp)
      this.listen(button, 'click', onClick)
    }
  }

  private bindAutoPause(): void {
    const onVisibilityChange = () => {
      if (this.doc.hidden) {
        this.options.onAutoPause?.()
      }
    }
    const onBlur = () => {
      this.options.onAutoPause?.()
    }
    this.listen(this.doc, 'visibilitychange', onVisibilityChange)
    this.listen(this.win, 'blur', onBlur)
  }
}

export const inputHandlerInternals = { isEditableTarget, isInteractiveTarget }
