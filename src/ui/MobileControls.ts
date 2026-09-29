import type { Direction } from '../engine/types'
import { ICON_PATHS, createElement, createSvgIcon } from './dom'

interface PadButton {
  direction: Direction
  label: string
  icon: string
}

const PAD_BUTTONS: readonly PadButton[] = [
  { direction: 'up', label: '向上移动', icon: ICON_PATHS.arrowUp },
  { direction: 'left', label: '向左移动', icon: ICON_PATHS.arrowLeft },
  { direction: 'down', label: '向下移动', icon: ICON_PATHS.arrowDown },
  { direction: 'right', label: '向右移动', icon: ICON_PATHS.arrowRight },
]

export class MobileControls {
  readonly element: HTMLElement

  constructor(doc: Document) {
    const buttons = PAD_BUTTONS.map(({ direction, label, icon }) =>
      createElement(
        doc,
        'button',
        {
          className: `dpad__button dpad__button--${direction}`,
          attrs: { type: 'button', 'aria-label': label, 'data-direction': direction },
          dataset: { testid: `pad-${direction}` },
        },
        [createSvgIcon(doc, icon, '0 0 24 24')],
      ),
    )

    this.element = createElement(
      doc,
      'section',
      {
        className: 'dpad',
        attrs: { 'aria-label': '方向控制' },
        dataset: { testid: 'dpad' },
      },
      [
        createElement(doc, 'div', { className: 'dpad__grid' }, buttons),
        createElement(doc, 'p', {
          className: 'dpad__hint',
          text: '触屏方向键：也可直接使用键盘方向键或 WASD',
        }),
      ],
    )
  }
}
