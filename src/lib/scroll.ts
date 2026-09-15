import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

// на телефоне адресная строка прячется и появляется при смене направления скролла,
// и каждый такой раз - это resize. ScrollTrigger на нём пересчитывает всё и гасит
// инерцию посреди жеста: палец отпущен, а страница мгновенно встаёт
ScrollTrigger.config({ ignoreMobileResize: true })

let lenis: Lenis | null = null

export function initScroll(): void {
  if (prefersReducedMotion()) {
    // при reduced motion инерция скролла - тоже движение, которого не просили
    document.documentElement.style.scrollBehavior = 'auto'
    return
  }

  lenis = new Lenis({ duration: 1.05, wheelMultiplier: 0.9 })

  // порядок обязателен: без этой пары lenis и ScrollTrigger живут в разных
  // системах координат и пин уезжает от контента на пару кадров
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis?.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)
}

/**
 * прокрутка на паузе, пока считается заставка. одного overflow на body мало: lenis двигает
 * страницу сам и про overflow не знает, а одного lenis.stop мало без него - без js и при
 * reduced motion страница листается нативно. поэтому оба
 */
export function holdScroll(): void {
  document.documentElement.classList.add('is-holding')
  lenis?.stop()
}

export function releaseScroll(): void {
  document.documentElement.classList.remove('is-holding')
  lenis?.start()
}

/** якорные ссылки должны попадать в цель и при включённом lenis, и без него */
export function bindAnchors(): void {
  document.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement | null)?.closest?.('a[href^="#"]')
    if (!(link instanceof HTMLAnchorElement)) return

    const id = link.getAttribute('href')
    if (!id || id === '#') return

    const target = document.querySelector(id)
    if (!target) return

    event.preventDefault()
    if (lenis) lenis.scrollTo(target as HTMLElement, { lock: true, duration: 1.1 })
    else target.scrollIntoView({ behavior: 'smooth' })

    // фокус переносим руками: preventDefault отменил и переход, и его побочный эффект
    ;(target as HTMLElement).setAttribute('tabindex', '-1')
    ;(target as HTMLElement).focus({ preventScroll: true })
  })
}

export { gsap, ScrollTrigger }
