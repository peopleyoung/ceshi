import { DIFFICULTY_ORDER, DIFFICULTY_SETTINGS } from '../engine/constants'
import type { Difficulty } from '../engine/types'
import { createElement } from './dom'

export class StartScreen {
  readonly element: HTMLElement
  private readonly radios = new Map<Difficulty, HTMLInputElement>()
  private readonly options = new Map<Difficulty, HTMLElement>()
  private readonly startButton: HTMLButtonElement
  private startHandler: (() => void) | null = null
  private selected: Difficulty

  constructor(doc: Document, initialDifficulty: Difficulty) {
    this.selected = initialDifficulty

    const options = DIFFICULTY_ORDER.map((difficulty) => {
      const settings = DIFFICULTY_SETTINGS[difficulty]
      const input = createElement(doc, 'input', {
        className: 'difficulty__input',
        attrs: {
          type: 'radio',
          name: 'difficulty',
          value: difficulty,
          id: `difficulty-${difficulty}`,
        },
      })
      input.checked = difficulty === initialDifficulty
      input.addEventListener('change', () => {
        if (input.checked) {
          this.selected = difficulty
          this.syncSelection()
        }
      })
      this.radios.set(difficulty, input)

      const option = createElement(
        doc,
        'label',
        { className: 'difficulty__option', attrs: { for: `difficulty-${difficulty}` } },
        [
          input,
          createElement(doc, 'span', { className: 'difficulty__name', text: settings.label }),
          createElement(doc, 'span', { className: 'difficulty__hint', text: settings.summary }),
          createElement(doc, 'span', {
            className: 'difficulty__meta',
            text: `${settings.tickMs}ms/格`,
          }),
          createElement(doc, 'span', {
            className: 'difficulty__meta',
            text: `${settings.scorePerFood} 分/颗`,
          }),
        ],
      )
      this.options.set(difficulty, option)
      return option
    })
    this.syncSelection()

    const fieldset = createElement(
      doc,
      'fieldset',
      {
        className: 'difficulty',
        dataset: { testid: 'difficulty-group' },
      },
      [
        createElement(doc, 'legend', { className: 'difficulty__legend', text: '选择难度' }),
        createElement(doc, 'div', { className: 'difficulty__options' }, options),
      ],
    )

    this.startButton = createElement(doc, 'button', {
      className: 'button button--primary',
      text: '开始游戏',
      attrs: { type: 'button' },
      dataset: { testid: 'start-button' },
    })
    this.startButton.addEventListener('click', () => {
      this.startHandler?.()
    })

    this.element = createElement(
      doc,
      'div',
      {
        className: 'overlay overlay--start',
        dataset: { testid: 'start-screen' },
        attrs: { role: 'group', 'aria-label': '游戏开始' },
      },
      [
        createElement(doc, 'div', { className: 'panel panel--start' }, [
          createElement(doc, 'h2', { className: 'panel__title', text: '贪吃蛇' }),
          createElement(doc, 'p', {
            className: 'panel__subtitle',
            text: '吃掉金色果实让蛇变长，撞墙或撞到自己游戏结束。棋盘填满即通关。',
          }),
          createElement(
            doc,
            'ul',
            { className: 'rules' },
            [
              '方向键 或 W A S D 控制方向，手机可用屏幕方向键',
              '空格键 或 暂停按钮 切换暂停 / 继续',
              '吃食物加分并增长，难度越高单颗食物分越高',
              '页面切到后台会自动暂停，返回后手动继续',
            ].map((text) => createElement(doc, 'li', { className: 'rules__item', text })),
          ),
          fieldset,
          this.startButton,
        ]),
      ],
    )
  }

  onStart(handler: () => void): void {
    this.startHandler = handler
  }

  get difficulty(): Difficulty {
    return this.selected
  }

  /** 用属性标记选中项，避免依赖较新的 :has() 选择器 */
  private syncSelection(): void {
    for (const [difficulty, option] of this.options) {
      option.dataset.selected = String(difficulty === this.selected)
    }
  }

  setDifficulty(difficulty: Difficulty): void {
    this.selected = difficulty
    const input = this.radios.get(difficulty)
    if (input) {
      input.checked = true
    }
    this.syncSelection()
  }

  show(difficulty?: Difficulty): void {
    if (difficulty) {
      this.setDifficulty(difficulty)
    }
    this.element.hidden = false
  }

  hide(): void {
    this.element.hidden = true
  }

  focus(): void {
    this.startButton.focus()
  }

  destroy(): void {
    this.startHandler = null
    this.element.remove()
  }
}
