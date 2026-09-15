import { gsap } from './scroll'
import { prefersReducedMotion } from './motion'

/**
 * семейство parallax-depth. data-depth - доля скорости страницы: 1 идёт вместе
 * с контентом, 0.64 отстаёт заметно. расхождение слоёв и есть глубина, поэтому
 * число берётся из макета сцены, а не подбирается на глаз
 */
export function initParallax(): void {
  if (prefersReducedMotion()) return

  document.querySelectorAll<HTMLElement>('[data-depth]').forEach((layer) => {
    const depth = Number(layer.dataset.depth)
    if (!Number.isFinite(depth) || depth >= 1) return

    const section = layer.closest('section') ?? layer.parentElement
    if (!section) return

    gsap.to(layer, {
      y: (1 - depth) * -260,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: 0.6,
      },
    })
  })
}
