import { gsap, ScrollTrigger } from './scroll'
import { prefersReducedMotion } from './motion'

/**
 * семейство entrance-reveal. все четыре появления снимают одно и то же состояние,
 * но каждое своим движением: заголовок выезжает из-под маски, реквизиты всплывают,
 * строки формулы поднимаются, а заметка на полях ещё и наводится на резкость.
 * одинаковый fade-up на всём подряд - ровно то, чего тут быть не должно
 */
export function initReveals(): void {
  const reduced = prefersReducedMotion()

  revealHeadline(reduced)
  revealStagger(reduced)
  revealSingles(reduced)
  revealRows(reduced)
}

/**
 * появление привязано к самому элементу и к каждому его приходу в кадр. раньше это была
 * одна общая точка на группу и once: заголовки вообще проигрывались на загрузке, все сразу,
 * а список появлялся целиком от своей первой строки. кто останавливался на середине -
 * остального движения не видел никогда, оно случилось без него. batch собирает в каскад
 * только тех, кто въехал в кадр в один и тот же кадр отрисовки: свои соседи по экрану идут
 * волной, а дальние ждут своей очереди.
 *
 * и никакого once. ушло из кадра - вернулось в исходное, пришло обратно - играет
 * заново, хоть весь день
 */
function appear(
  items: HTMLElement[],
  rest: gsap.TweenVars,
  play: gsap.TweenVars,
  start: string,
): void {
  if (!items.length) return

  gsap.set(items, rest)
  const reset = (batch: Element[]): void => {
    gsap.set(batch, rest)
  }
  const run = (batch: Element[]): void => {
    gsap.to(batch, { ...play, overwrite: true })
  }

  ScrollTrigger.batch(items, {
    start,
    onEnter: run,
    onEnterBack: run,
    onLeave: reset,
    onLeaveBack: reset,
  })
}

function revealHeadline(reduced: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-reveal-lines]').forEach((heading) => {
    const lines = Array.from(heading.querySelectorAll<HTMLElement>('.line'))
    if (!lines.length) return

    // внутренний span нужен только маске; в разметке его нет, чтобы без js
    // заголовок оставался обычным заголовком
    const inners = lines.map((line) => {
      const inner = document.createElement('span')
      inner.style.display = 'block'
      inner.append(...Array.from(line.childNodes))
      line.append(inner)
      return inner
    })

    if (reduced) {
      appear(
        inners,
        { opacity: 0 },
        { opacity: 1, duration: 0.5, stagger: 0.07, ease: 'power2.out' },
        'top 88%',
      )
      return
    }

    // строки одного заголовка идут одной волной по своему заголовку, а не по
    // соседнему: batch собирается на каждый data-reveal-lines отдельно
    appear(
      inners,
      { yPercent: 108 },
      { yPercent: 0, duration: 0.9, stagger: 0.07, ease: 'power4.out' },
      'top 88%',
    )
  })
}

function revealStagger(reduced: boolean): void {
  document.querySelectorAll<HTMLElement>('[data-reveal-stagger]').forEach((group) => {
    appear(
      Array.from(group.children) as HTMLElement[],
      { opacity: 0, y: reduced ? 0 : 10 },
      { opacity: 1, y: 0, duration: 0.52, stagger: 0.045, ease: 'power2.out' },
      'top 94%',
    )
  })
}

function revealSingles(reduced: boolean): void {
  appear(
    Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]')),
    { opacity: 0, y: reduced ? 0 : 16 },
    { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out' },
    'top 86%',
  )
}

function revealRows(reduced: boolean): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal-row]'))
  if (!rows.length) return

  appear(
    rows,
    { opacity: 0, y: reduced ? 0 : 14 },
    { opacity: 1, y: 0, duration: 0.64, stagger: 0.04, ease: 'power3.out' },
    'top 90%',
  )

  if (reduced) return

  const notes = rows
    .map((row) => row.querySelector<HTMLElement>('.formula__note'))
    .filter((note): note is HTMLElement => Boolean(note))

  // заметка наводится на резкость своим ходом, на полкорпуса позже строки
  appear(
    notes,
    { opacity: 0, filter: 'blur(6px)' },
    {
      opacity: 1,
      filter: 'blur(0px)',
      duration: 0.7,
      stagger: 0.04,
      delay: 0.12,
      ease: 'power2.out',
    },
    'top 90%',
  )
}
