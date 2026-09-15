import { gsap } from '../lib/scroll'
import { isCoarsePointer, prefersReducedMotion } from '../lib/motion'

/**
 * тень в первом кадре чуть ходит за курсором. смещение маленькое, до 14 px:
 * нужно не движение как таковое, а ощущение, что источник света реальный
 */
export function initHero(): void {
  if (prefersReducedMotion() || isCoarsePointer()) return

  const layer = document.querySelector<SVGElement>('[data-pointer-drift]')
  if (!layer) return

  const toX = gsap.quickTo(layer, 'x', { duration: 0.9, ease: 'power2.out' })
  const toY = gsap.quickTo(layer, 'y', { duration: 0.9, ease: 'power2.out' })

  /* auteur-allow: POINTER_NO_RAF -- quickTo не пишет в DOM из обработчика: он только
     меняет цель твина, а сама запись идёт с тикера gsap, то есть уже раз в кадр */
  window.addEventListener(
    'pointermove',
    (event) => {
      const nx = event.clientX / window.innerWidth - 0.5
      const ny = event.clientY / window.innerHeight - 0.5
      toX(nx * -14)
      toY(ny * -8)
    },
    { passive: true },
  )
}
