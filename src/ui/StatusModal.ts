import { difficultyLabel } from '../engine/constants'
import type { Difficulty } from '../engine/types'
import { createElement } from './dom'

export type StatusKind = 'paused' | 'gameover' | 'victory'

export interface StatusContent {
  kind: StatusKind
  score: number
  highScore: number
  difficulty: Difficulty
  autoPaused?: boolean
}

interface StatusCallbacks {
  onPrimary: () => void
  onSecondary: () => void
}

const FOCUSABLE_SELECTOR = 'button:not(:disabled), [href], input:not(:disabled)'

const PRESENTATION: Record<
  StatusKind,
  { title: string; message: string; primary: string; secondary: string | null }
> = {
  paused: {
    title: '已暂停',
    message: '游戏已暂停，继续后蛇会从当前位置接着移动。',
    primary: '继续游戏',
    secondary: '重新开始',
  },
  gameover: {
    title: '游戏结束',
    message: '蛇撞到了障碍，本局到此结束。',
    primary: '重新开始',
    secondary: '返回开始界面',
  },
  victory: {
    title: '恭喜通关',
    message: '棋盘已被完全填满，你达成了贪吃蛇的极限。',
    primary: '再玩一局',
    secondary: '返回开始界面',
  },
}

export class StatusModal {
  readonly element: HTMLElement
  private readonly title: HTMLElement
  private readonly message: HTMLElement
  private readonly scoreValue: HTMLElement
  private readonly highScoreValue: HTMLElement
  private readonly difficultyValue: HTMLElement
  private readonly primaryButton: HTMLButtonElement
  private readonly secondaryButton: HTMLButtonElement
  private callbacks: StatusCallbacks | null = null
  private restoreTarget: HTMLElement | null = null
  private kind: StatusKind | null = null

  constructor(doc: Document) {
    this.title = createElement(doc, 'h2', {
      className: 'panel__title',
      text: '已暂停',
      attrs: { id: 'status-modal-title' },
    })
    this.message = createElement(doc, 'p', {
      className: 'panel__subtitle',
      text: '',
      attrs: { id: 'status-modal-message' },
    })
    this.scoreValue = createElement(doc, 'dd', { text: '0', dataset: { testid: 'modal-score' } })
    this.highScoreValue = createElement(doc, 'dd', {
      text: '0',
      dataset: { testid: 'modal-high-score' },
    })
    this.difficultyValue = createElement(doc, 'dd', {
      text: '—',
      dataset: { testid: 'modal-difficulty' },
    })

    const stat = (label: string, value: HTMLElement) =>
      createElement(doc, 'div', { className: 'panel__stat' }, [
        createElement(doc, 'dt', { text: label }),
        value,
      ])

    this.primaryButton = createElement(doc, 'button', {
      className: 'button button--primary',
      text: '继续游戏',
      attrs: { type: 'button' },
      dataset: { testid: 'modal-primary' },
      listeners: {
        click: () => {
          this.callbacks?.onPrimary()
        },
      },
    })

    this.secondaryButton = createElement(doc, 'button', {
      className: 'button button--ghost',
      text: '重新开始',
      attrs: { type: 'button' },
      dataset: { testid: 'modal-secondary' },
      listeners: {
        click: () => {
          this.callbacks?.onSecondary()
        },
      },
    })

    this.element = createElement(
      doc,
      'div',
      {
        className: 'overlay overlay--status',
        dataset: { testid: 'status-modal' },
        attrs: {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'status-modal-title',
          'aria-describedby': 'status-modal-message',
        },
      },
      [
        createElement(doc, 'div', { className: 'panel panel--status' }, [
          this.title,
          this.message,
          createElement(doc, 'dl', { className: 'panel__stats' }, [
            stat('本局得分', this.scoreValue),
            stat('该难度最高分', this.highScoreValue),
            stat('难度', this.difficultyValue),
          ]),
          createElement(doc, 'div', { className: 'panel__actions' }, [
            this.primaryButton,
            this.secondaryButton,
          ]),
        ]),
      ],
    )
    this.element.hidden = true
  }

  get visible(): boolean {
    return !this.element.hidden
  }

  get currentKind(): StatusKind | null {
    return this.kind
  }

  onAction(callbacks: StatusCallbacks): void {
    this.callbacks = callbacks
  }

  show(content: StatusContent): void {
    const presentation = PRESENTATION[content.kind]
    this.kind = content.kind
    this.title.textContent = presentation.title
    this.message.textContent =
      content.kind === 'paused' && content.autoPaused
        ? '页面切到后台或窗口失焦，游戏已自动暂停。点击继续恢复。'
        : presentation.message
    this.scoreValue.textContent = String(content.score)
    this.highScoreValue.textContent = String(content.highScore)
    this.difficultyValue.textContent = difficultyLabel(content.difficulty)

    this.primaryButton.textContent = presentation.primary
    if (presentation.secondary) {
      this.secondaryButton.textContent = presentation.secondary
      this.secondaryButton.hidden = false
    } else {
      this.secondaryButton.hidden = true
    }

    if (this.element.hidden) {
      const doc = this.element.ownerDocument
      this.restoreTarget = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
      this.element.hidden = false
      doc.addEventListener('keydown', this.handleKeyDown)
    }
    this.primaryButton.focus()
  }

  hide(): void {
    if (this.element.hidden) {
      return
    }
    this.element.hidden = true
    this.kind = null
    const doc = this.element.ownerDocument
    doc.removeEventListener('keydown', this.handleKeyDown)
    if (this.restoreTarget?.isConnected) {
      this.restoreTarget.focus()
    }
    this.restoreTarget = null
  }

  destroy(): void {
    this.hide()
    this.callbacks = null
    this.element.remove()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.primaryButton.click()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    const focusables = Array.from(
      this.element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => !element.hidden)
    if (focusables.length === 0) {
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = this.element.ownerDocument.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }
}
