import { ScrollTrigger } from '../lib/scroll'

/**
 * кнопка Index закреплена на экране и переезжает через тёмную секцию, а марена на индиго
 * не читается - на время пересечения ей выдаётся светлый набор. считаем не
 * intersectionRatio, а долю ЭКРАНА под тёмным полем: секция выше вьюпорта, и её
 * собственный ratio до порога никогда бы не дошёл
 */
export function initInversion(): void {
  const dark = document.querySelector('[data-scene="index"]')
  if (!dark) return

  const observer = new IntersectionObserver(
    ([entry]) => {
      const covered = entry.intersectionRect.height / window.innerHeight
      document.documentElement.classList.toggle('is-inverted', covered > 0.6)
    },
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  )

  observer.observe(dark)
}

/**
 * меридиан прочерчен по странице, поэтому цвет у него не общий на кадр, а свой у каждого
 * отрезка: над тёмным полем светлая марена, над сценой полудня линии нет вовсе - там
 * своя, под флаконом. отрезки считаются от высот секций и пересчитываются, когда страница
 * меняет длину: стол формулы, шрифты, поворот телефона
 */
export function initMeridian(): void {
  const line = document.querySelector<HTMLElement>('.meridian')
  if (!line) return
  const dark = Array.from(document.querySelectorAll<HTMLElement>('[data-scene="index"]'))
  const sweep = document.querySelector<HTMLElement>('[data-scene="sweep"]')
  const stage = sweep?.querySelector<HTMLElement>('.sweep__stage') ?? null

  const paint = (): void => {
    const origin = line.getBoundingClientRect().top
    const span = (el: HTMLElement): [number, number] => {
      const r = el.getBoundingClientRect()
      return [r.top - origin, r.bottom - origin]
    }
    const marks: Array<{ at: [number, number]; colour: string }> = dark.map((el) => ({
      at: span(el),
      colour: 'var(--hair-madder-lit)',
    }))
    /**
     * пока сцена полудня прилипает к окну, она закрывает собой всю свою секцию, и общая
     * линия уходит на всю её длину. без прилипания сцена стоит в потоке, и пропуск - только
     * её собственная коробка
     */
    if (sweep && stage && stage.offsetHeight > 0) {
      const sticky = getComputedStyle(stage).position === 'sticky'
      marks.push({ at: span(sticky ? sweep : stage), colour: 'transparent' })
    }
    marks.sort((a, b) => a.at[0] - b.at[0])

    const stops: string[] = []
    let at = 0
    for (const { at: [from, to], colour } of marks) {
      stops.push(`var(--hair-madder) ${at}px ${from}px`, `${colour} ${from}px ${to}px`)
      at = to
    }
    stops.push(`var(--hair-madder) ${at}px`)
    line.style.setProperty('--meridian-paint', `linear-gradient(to bottom, ${stops.join(', ')})`)
  }

  paint()
  ScrollTrigger.addEventListener('refresh', paint)
  new ResizeObserver(paint).observe(document.body)
  void document.fonts.ready.then(paint)
}
