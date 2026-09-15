import { prefersReducedMotion } from './motion'
import { holdScroll, releaseScroll, ScrollTrigger } from './scroll'

/**
 * заставка на время сборки. ждать по сети тут нечего: изображений в проекте нет вовсе, а
 * весь флакон - код. ждать приходится работу - два шрифта, полторы сотни профилей геометрии
 * и сборку шейдеров просвета, которая на слабой видеокарте занимает секунды и занимает их в
 * главном потоке. без заставки эта секунда приходится на первое движение колеса, и сайт
 * начинается с рывка.
 *
 * заодно она держит прокрутку: пока считается, листать нечего
 */

/** раньше этого заставка не уходит - иначе на быстрой машине она мигает */
const FLOOR_MS = 620

/** доли, на которые встаёт линия: сначала шрифты, потом сцена */
const STEPS = [0.42, 1]

export function initPreloader(scene: Promise<void>, reveal: () => void): void {
  const fonts = document.fonts ? document.fonts.ready.then(() => undefined) : Promise.resolve()
  const root = document.querySelector<HTMLElement>('[data-preloader]')

  if (!root) {
    // шрифты меняют высоту заголовков, а от высот зависят все точки пина
    void fonts.then(() => {
      reveal()
      ScrollTrigger.refresh()
    })
    return
  }

  const bar = root.querySelector<HTMLElement>('[data-preloader-bar]')
  const started = performance.now()
  const reduced = prefersReducedMotion()

  holdScroll()

  const step = (i: number): void => {
    if (bar) bar.style.transform = `scaleX(${STEPS[i]})`
  }
  void fonts.then(() => step(0))

  // сцена может не собраться вовсе - без WebGL её просто нет, и это не повод
  // держать заставку на экране
  void Promise.all([fonts, scene.catch(() => undefined)]).then(() => {
    step(1)
    const wait = Math.max(0, FLOOR_MS - (performance.now() - started))

    window.setTimeout(() => {
      /**
       * появления заводятся здесь, а не на старте страницы. заведи их раньше - и первый
       * экран отыграет своё появление за занавесом, пока его никто не видит. а тут
       * заголовок начинает выезжать в тот же момент, когда занавес начинает уходить, и
       * зритель застаёт движение целиком
       */
      reveal()
      ScrollTrigger.refresh()

      root.classList.add('is-done')
      releaseScroll()

      const close = (): void => {
        root.remove()
        // пин отсчитывается от верха документа, а заставка держала его в нуле
        ScrollTrigger.refresh()
      }
      if (reduced) close()
      else root.addEventListener('transitionend', close, { once: true })
    }, wait)
  })
}
