const NS = 'http://www.w3.org/2000/svg'

/** линейный конгруэнтный генератор: полосы должны быть неровными, но одинаковыми на всех загрузках */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/**
 * свет сквозь полуприкрытые ставни. ровный шаг полос сразу читается как
 * repeating-linear-gradient, поэтому и высота полосы, и её плотность гуляют:
 * настоящие ставни рассохлись
 */
export function initShutter(): void {
  const svg = document.querySelector<SVGSVGElement>('[data-shutter]')
  if (!svg) return

  const random = seeded(20160804)
  const group = document.createElementNS(NS, 'g')
  group.setAttribute('transform', 'skewY(-7) translate(0 90)')

  let y = -260
  while (y < 1500) {
    const lit = 26 + random() * 22
    const shade = 30 + random() * 30

    const band = document.createElementNS(NS, 'rect')
    band.setAttribute('x', '-120')
    band.setAttribute('y', String(y + lit))
    band.setAttribute('width', '880')
    band.setAttribute('height', String(shade))
    band.setAttribute('opacity', (0.2 + random() * 0.16).toFixed(3))
    group.append(band)

    y += lit + shade
  }

  const fade = document.createElementNS(NS, 'linearGradient')
  fade.setAttribute('id', 'shutter-fade')
  fade.setAttribute('x1', '0')
  fade.setAttribute('y1', '0')
  fade.setAttribute('x2', '0')
  fade.setAttribute('y2', '1')
  ;[
    ['0', '0'],
    ['0.16', '1'],
    ['0.84', '1'],
    ['1', '0'],
  ].forEach(([offset, stop]) => {
    const el = document.createElementNS(NS, 'stop')
    el.setAttribute('offset', offset)
    el.setAttribute('stop-color', '#fff')
    el.setAttribute('stop-opacity', stop)
    fade.append(el)
  })

  const edge = fade.cloneNode(true) as SVGLinearGradientElement
  edge.setAttribute('id', 'shutter-edge')
  edge.setAttribute('x2', '1')
  edge.setAttribute('y2', '0')
  ;(Array.from(edge.children) as SVGStopElement[])[1].setAttribute('offset', '0.08')
  ;(Array.from(edge.children) as SVGStopElement[])[2].setAttribute('offset', '0.62')

  const maskOf = (id: string, gradient: string): SVGMaskElement => {
    const mask = document.createElementNS(NS, 'mask')
    mask.setAttribute('id', id)
    const rect = document.createElementNS(NS, 'rect')
    rect.setAttribute('x', '-120')
    rect.setAttribute('y', '0')
    rect.setAttribute('width', '880')
    rect.setAttribute('height', '1400')
    rect.setAttribute('fill', `url(#${gradient})`)
    mask.append(rect)
    return mask
  }

  const defs = document.createElementNS(NS, 'defs')
  defs.append(fade, edge, maskOf('shutter-mask', 'shutter-fade'), maskOf('shutter-edge-mask', 'shutter-edge'))
  group.setAttribute('mask', 'url(#shutter-mask)')

  // два прохода вместо одного: маска в svg перемножается по яркости, и вертикальное
  // затухание с горизонтальным в одном прямоугольнике не совместить
  const outer = document.createElementNS(NS, 'g')
  outer.setAttribute('mask', 'url(#shutter-edge-mask)')
  outer.append(group)

  svg.append(defs, outer)
  svg.classList.add('is-drawn')
}
