export interface ElementInit {
  className?: string
  text?: string
  attrs?: Readonly<Record<string, string>>
  dataset?: Readonly<Record<string, string>>
  listeners?: Readonly<Partial<Record<string, EventListener>>>
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  init: ElementInit = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  if (init.className) {
    node.className = init.className
  }
  if (init.text !== undefined) {
    node.textContent = init.text
  }
  for (const [name, value] of Object.entries(init.attrs ?? {})) {
    node.setAttribute(name, value)
  }
  for (const [name, value] of Object.entries(init.dataset ?? {})) {
    node.dataset[name] = value
  }
  for (const [type, listener] of Object.entries(init.listeners ?? {})) {
    if (listener) {
      node.addEventListener(type, listener)
    }
  }
  for (const child of children) {
    node.append(child)
  }
  return node
}

export function createSvgIcon(doc: Document, path: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(namespace, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  const shape = doc.createElementNS(namespace, 'path')
  shape.setAttribute('d', path)
  shape.setAttribute('fill', 'currentColor')
  svg.append(shape)
  return svg
}

export const ICON_PATHS = {
  play: 'M8 5.14v13.72L19 12 8 5.14Z',
  pause: 'M7 5h4v14H7V5Zm6 0h4v14h-4V5Z',
  restart: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z',
  arrowUp: 'M12 5 5 14h5v5h4v-5h5L12 5Z',
  arrowDown: 'M12 19l7-9h-5V5h-4v5H5l7 9Z',
  arrowLeft: 'M5 12l9-7v5h5v4h-5v5l-9-7Z',
  arrowRight: 'M19 12l-9 7v-5H5v-4h5V5l9 7Z',
} as const
