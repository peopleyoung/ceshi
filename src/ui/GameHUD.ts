import { difficultyLabel } from '../engine/constants'
import type { GameState } from '../engine/types'
import { ICON_PATHS, createElement, createSvgIcon } from './dom'

export class GameHUD {
  readonly element: HTMLElement
  readonly pauseButton: HTMLButtonElement
  readonly restartButton: HTMLButtonElement
  private readonly difficultyValue: HTMLElement
  private readonly scoreValue: HTMLElement
  private readonly highScoreValue: HTMLElement
  private readonly pauseLabel: HTMLElement
  private readonly pauseIcon: SVGSVGElement
  private pauseHandler: (() => void) | null = null
  private restartHandler: (() => void) | null = null

  constructor(doc: Document) {
    this.difficultyValue = createElement(doc, 'strong', {
      className: 'hud__value',
      text: '—',
      dataset: { testid: 'hud-difficulty' },
    })
    this.scoreValue = createElement(doc, 'strong', {
      className: 'hud__value hud__value--score',
      text: '0',
      dataset: { testid: 'hud-score' },
    })
    this.highScoreValue = createElement(doc, 'strong', {
      className: 'hud__value',
      text: '0',
      dataset: { testid: 'hud-high-score' },
    })

    const item = (label: string, value: HTMLElement) =>
      createElement(doc, 'div', { className: 'hud__item' }, [
        createElement(doc, 'span', { className: 'hud__label', text: label }),
        value,
      ])

    this.pauseIcon = createSvgIcon(doc, ICON_PATHS.pause, '0 0 24 24')
    this.pauseLabel = createElement(doc, 'span', { text: '暂停' })
    this.pauseButton = createElement(
      doc,
      'button',
      {
        className: 'button button--ghost',
        attrs: { type: 'button' },
        dataset: { testid: 'pause-button' },
      },
      [this.pauseIcon, this.pauseLabel],
    )
    this.pauseButton.addEventListener('click', () => {
      this.pauseHandler?.()
    })

    this.restartButton = createElement(
      doc,
      'button',
      {
        className: 'button button--ghost',
        attrs: { type: 'button' },
        dataset: { testid: 'restart-button' },
      },
      [
        createSvgIcon(doc, ICON_PATHS.restart, '0 0 24 24'),
        createElement(doc, 'span', { text: '重新开始' }),
      ],
    )
    this.restartButton.addEventListener('click', () => {
      this.restartHandler?.()
    })

    this.element = createElement(
      doc,
      'section',
      { className: 'hud', attrs: { 'aria-label': '游戏状态' } },
      [
        createElement(doc, 'div', { className: 'hud__stats' }, [
          item('难度', this.difficultyValue),
          item('本局得分', this.scoreValue),
          item('最高分', this.highScoreValue),
        ]),
        createElement(doc, 'div', { className: 'hud__actions' }, [
          this.pauseButton,
          this.restartButton,
        ]),
      ],
    )
  }

  onPauseToggle(handler: () => void): void {
    this.pauseHandler = handler
  }

  onRestart(handler: () => void): void {
    this.restartHandler = handler
  }

  update(state: GameState): void {
    this.difficultyValue.textContent = difficultyLabel(state.difficulty)
    this.scoreValue.textContent = String(state.score)
    this.highScoreValue.textContent = String(state.highScore)

    const isRunning = state.status === 'running'
    const isPaused = state.status === 'paused'
    const label = isPaused ? '继续' : '暂停'
    if (this.pauseLabel.textContent !== label) {
      this.pauseLabel.textContent = label
    }
    const iconPath = isPaused ? ICON_PATHS.play : ICON_PATHS.pause
    this.pauseIcon.firstElementChild?.setAttribute('d', iconPath)
    this.pauseButton.setAttribute('aria-label', `${label}游戏`)
    this.pauseButton.disabled = !isRunning && !isPaused
    this.restartButton.disabled = state.status === 'idle'
  }
}
