import { FORMULAS } from '../data/formulas'
import { rgbUnit } from '../lib/color'
import { isCoarsePointer, prefersReducedMotion } from '../lib/motion'
import { sampleFrame } from '../lib/quality'
import { gsap, ScrollTrigger } from '../lib/scroll'
import { createDirector, LAYERS, mixPlace, POOL, SWAP, type ShotPose } from './director'
import { createCinemaStage, type Shot } from './stage'

/**
 * сквозная сцена целиком: холст, режиссёр и заставка. у каждой секции свои флаконы, и они
 * прибиты к своему месту в вёрстке - холст перерисовывается в том же кадре, в котором
 * страница сдвинулась, и флакон едет вместе с ней, а не догоняет. полдень остаётся
 * своей сценой со своим флаконом на плите
 */

export type Cinema = {
  /** программы собраны - заставку можно снимать */
  ready: Promise<void>
  /** на пустой бумаге чертится контур, по нему нарастает стекло; резолвится, когда флакон целиком */
  settle(): Promise<void>
  /** заставка ушла - флакон переезжает на страницу */
  release(): void
}

/** как быстро флакон догоняет руку: подъём и доворот, в долях за секунду */
const HAND_FOLLOW = 10

/**
 * запас холста над и под окном, в долях его высоты. столько телефон успевает пролистать за
 * кадр, который сцена рисует дольше, чем браузер двигает страницу. на мыши запаса нет:
 * там прокрутку ведёт lenis в том же кадре, и холст никогда не отстаёт
 */
const OVERSCAN = 0.12

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function initCinema(): Cinema | null {
  // движение выключено - сквозной сцены нет, страница остаётся прежней, со своим
  // единственным неподвижным кадром полудня
  if (prefersReducedMotion()) return null

  /**
   * холст лежит в странице, а не над окном. на телефоне страницу двигает браузер в своём
   * потоке, а кадр сцены приходит следом: холст, прибитый к окну, стоял на месте, пока
   * текст уже уехал, и флакон догонял свою секцию. в странице браузер уносит его вместе с
   * текстом сам, и скрипт только возвращает его к окну в том же кадре, в котором рисует.
   * по краям запас: пока кадр не пришёл, из-под края окна выезжает не пустота, а тот же кадр
   */
  const track = document.createElement('div')
  track.className = 'cinema-track is-intro'
  const over = isCoarsePointer() ? Math.round(OVERSCAN * window.innerHeight) : 0
  track.style.setProperty('--over', `${over}px`)
  const canvas = document.createElement('canvas')
  canvas.className = 'cinema'
  canvas.setAttribute('aria-hidden', 'true')
  track.append(canvas)
  document.body.append(track)
  // места под флакон раскрываются до первого замера, иначе сцена мерила бы страницу без них
  document.documentElement.classList.add('has-cinema')

  const stage = createCinemaStage(
    canvas,
    POOL.map(({ formula }) => {
      const f = FORMULAS[formula]
      return { recipe: f.tint, label: `${f.name} ${f.clock}` }
    }),
  )
  if (!stage) {
    track.remove()
    document.documentElement.classList.remove('has-cinema')
    return null
  }

  const view = (): { w: number; h: number } => ({
    w: document.documentElement.clientWidth,
    h: window.innerHeight,
  })
  const director = createDirector(view)
  const { hands } = director

  const intro = { reveal: 0, blend: 1 }
  let from: ShotPose | null = null
  let released = false
  let last: number[] = []

  const relayout = (): void => {
    stage.resize()
    // стоянка стола стала другой длины - всё, что ниже, съехало, и триггеры надо снять заново
    if (director.measure()) ScrollTrigger.refresh()
    last = []
  }
  ScrollTrigger.addEventListener('refresh', relayout)
  window.addEventListener('resize', relayout)
  void document.fonts.ready.then(relayout)
  new ResizeObserver(() => stage.resize()).observe(canvas)
  // кадр после потери контекста рисуется, даже если с тех пор ничего не сдвинулось
  stage.onRestore(() => (last = []))

  document.addEventListener('meridian:formula', (event) => {
    director.wear((event as CustomEvent<number>).detail)
  })

  const indexRows = Array.from(document.querySelectorAll<HTMLElement>('.index tbody tr'))
  const formulaRows = Array.from(document.querySelectorAll<HTMLElement>('.formula__row'))
  let pouring = -1
  indexRows.forEach((row, i) => {
    row.addEventListener('pointerenter', () => (hands.row = i))
    row.addEventListener('pointerleave', () => (hands.row = -1))
  })
  document.querySelectorAll<HTMLTableCellElement>('.ledger--prices tbody td').forEach((cell) => {
    // первая клетка строки - название, объёмы идут со второй
    cell.addEventListener('pointerenter', () => (hands.size = cell.cellIndex - 1))
    cell.addEventListener('pointerleave', () => (hands.size = -1))
  })

  /**
   * рука во флаконе: холст сквозной для мыши, поэтому попадание считает режиссёр по
   * коробке флакона. палец держит флакон, пока касается экрана, - так на телефоне его
   * можно тронуть так же, как курсором
   */
  const coarse = isCoarsePointer()
  const touch = (event: PointerEvent): void => {
    hands.x = event.clientX
    hands.y = event.clientY
  }
  window.addEventListener('pointermove', (event) => {
    if (!coarse || event.pointerType !== 'mouse') touch(event)
  }, { passive: true })
  window.addEventListener('pointerdown', touch, { passive: true })
  const letGo = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return
    hands.x = null
    hands.y = null
  }
  window.addEventListener('pointerup', letGo, { passive: true })
  window.addEventListener('pointercancel', letGo, { passive: true })
  document.documentElement.addEventListener('pointerleave', () => {
    hands.x = null
    hands.y = null
  })

  document.addEventListener('meridian:letter', () => {
    gsap
      .timeline()
      .to(hands, { press: 1, duration: 0.32, ease: 'power2.out' })
      .to(hands, { press: 0, duration: 0.42, ease: 'power3.in' })
  })

  /** подъём и доворот догоняют цель сами: наведение не должно дёргать флакон рывком */
  const lifts = new Array(stage.actors.length).fill(0)
  const yaws = new Array(stage.actors.length).fill(Number.NaN)
  let lit = -1

  /** true - кадр нарисован: по таким кадрам судят, тянет ли железо */
  const render = (shots: ShotPose[], sun: ReturnType<typeof director.frame>['sun'], dt: number): boolean => {
    const hand = 1 - Math.exp(-dt * HAND_FOLLOW)
    for (const shot of shots) {
      shot.actors.forEach((p, j) => {
        const i = shot.cast[j]
        lifts[i] += (p.lift - lifts[i]) * hand
        yaws[i] = Number.isNaN(yaws[i]) ? p.yaw : yaws[i] + (p.yaw - yaws[i]) * hand
      })
    }

    /**
     * кадр рисуется, только если в нём что-то сдвинулось. на холсте во всё окно пустой
     * кадр стоит почти ничего, но стекло с просветом и картой теней - не почти
     */
    const sign: number[] = [sun.az, sun.el, sun.intensity]
    for (const shot of shots) {
      sign.push(shot.place.x, shot.place.base, shot.place.k, shot.place.pitch, shot.shadow, shot.fence?.side ?? 0)
      shot.actors.forEach((a, j) => {
        const i = shot.cast[j]
        sign.push(
          i, a.reveal, a.dx, a.dz, a.size, lifts[i], yaws[i], a.explode, a.clarity, a.level,
          a.strata, a.dim, a.tint.base.h, a.tint.liquid.l, ...a.bands, ...a.lit,
        )
      })
    }
    const moved = sign.length !== last.length || sign.some((v, i) => Math.abs(v - last[i]) > 1e-3)
    if (!moved) return false
    last = sign

    const frame: Shot[] = shots.map((shot) => {
      let left = Infinity
      let right = -Infinity
      const actors = shot.actors.map((p, j) => {
        const i = shot.cast[j]
        const actor = stage.actors[i]
        actor.setReveal(p.reveal)
        actor.root.position.set(p.dx, lifts[i], p.dz)
        actor.root.scale.setScalar(p.size)
        actor.assembly.group.rotation.y = yaws[i]
        actor.setTint(p.tint)
        actor.write(p.label)
        actor.setExplode(p.explode)
        actor.setClarity(p.clarity)
        actor.setLevel(p.level)
        actor.setStrata(p.bands, LAYERS, p.strata, p.lit, p.dim)
        left = Math.min(left, p.dx - 0.3 * p.size)
        right = Math.max(right, p.dx + 0.3 * p.size)
        return actor
      })
      /**
       * пол под тенью: от крайнего флакона до крайнего и ещё на длину тени. на низком
       * солнце тень длиннее флакона раз в десять - пол обязан её вместить
       */
      const length = Math.min(11, 1.1 / Math.tan(Math.max(0.05, sun.el)))
      return {
        actors,
        // планы считаются от окна, а холст начинается выше него на запас
        place: { ...shot.place, base: shot.place.base + over },
        shade: {
          opacity: shot.shadow,
          reach: (right - left) / 2 + length + 0.4,
          centre: (left + right) / 2,
          fence: shot.fence,
        },
        backdrop: shot.backdrop,
      }
    })

    stage.render(frame, {
      az: sun.az,
      el: sun.el,
      color: rgbUnit(sun.color),
      intensity: sun.intensity,
      env: sun.env,
    })
    return true
  }

  /**
   * холст возвращается к окну в том же кадре, в котором нарисован. дальше его ведёт
   * браузер: вместе со страницей, а пока место флакона прилипло к окну - вместе с окном
   */
  let held = false
  let shift = Number.NaN
  const anchor = (toView: boolean): void => {
    if (toView !== held) {
      track.classList.toggle('is-held', toView)
      held = toView
    }
    const y = toView ? 0 : window.scrollY
    if (y === shift) return
    canvas.style.transform = `translate3d(0, ${y}px, 0)`
    shift = y
  }

  /**
   * сцены телефона: под флаконом одна строка за раз. уходящая гаснет и поднимается,
   * приходящая всплывает снизу. на смене они не встречаются: две строки друг сквозь друга
   * читались кашей, поэтому новая появляется, только когда старая ушла
   */
  const priceRows = Array.from(document.querySelectorAll<HTMLElement>('.acquisition__bench tbody tr'))
  const shown = new Map<HTMLElement, string>()
  const show = (rows: HTMLElement[], at: number): void => {
    rows.forEach((row, k) => {
      const d = k + 0.5 - at
      const on = 1 - smooth(0.5 - SWAP, 0.5, Math.abs(d))
      const key = Number.isNaN(at) ? '' : `${on.toFixed(3)} ${((1 - on) * Math.sign(d)).toFixed(3)}`
      if (shown.get(row) === key) return
      shown.set(row, key)
      if (!key) {
        row.style.removeProperty('--on')
        row.style.removeProperty('--shift')
        return
      }
      const [a, b] = key.split(' ')
      row.style.setProperty('--on', a)
      row.style.setProperty('--shift', b)
    })
  }

  const tick = (_time: number, deltaMs: number): void => {
    const dt = Math.min(0.1, deltaMs / 1000)

    if (!released) {
      const shot = director.intro(intro.reveal)
      if (shot) render([shot], director.frame(0).sun, dt)
      anchor(false)
      return
    }

    const { shots, sun } = director.frame(window.scrollY)
    // пробы в .auteur читают планы отсюда; в сборку это не попадает
    if (import.meta.env.DEV) Object.assign(window, { __shots: shots })
    if (from && intro.blend > 0) {
      // заставка ушла, а флакон ещё переезжает из её середины на своё место в первом кадре
      const hero = shots.find((s) => s.name === 'hero')
      if (hero) hero.place = mixPlace(hero.place, from.place, intro.blend)
    }
    if (render(shots, sun, dt)) sampleFrame(deltaMs)
    anchor(shots.some((s) => s.held))

    const stages = director.stages()
    show(formulaRows, stages.method)
    show(priceRows, stages.prices)

    // строка указателя отзывается, когда рука держит её флакон, - и наоборот
    const now = director.lit()
    if (now !== lit) {
      indexRows[lit]?.classList.remove('is-lit')
      indexRows[now]?.classList.add('is-lit')
      lit = now
    }
    const next = director.pouring()
    if (next !== pouring) {
      formulaRows[pouring]?.classList.remove('is-pouring')
      formulaRows[next]?.classList.add('is-pouring')
      pouring = next
    }
  }
  gsap.ticker.add(tick)

  /**
   * compileAsync собирает программы материалов, но не то, что three заводит на первом
   * настоящем кадре: карту теней с её размытием, буфер просвета, текстуру надписи. на
   * заставке это стоило двух секунд стоящего кадра ровно в начале черчения. поэтому
   * настоящий кадр черчения считается заранее, пока ещё виден текст, и тут же стирается
   */
  const ready = stage.warm().then(() => {
    const shot = director.intro(0.6)
    if (!shot) return
    render([shot], director.frame(0).sun, 0)
    stage.clear()
    last = []
  })

  return {
    ready,

    settle() {
      /**
       * всё уже собрано, и чертёж идёт без единого рывка: сначала перо обходит контур
       * целиком, и только потом по нему поднимается стекло
       */
      return new Promise<void>((resolve) => {
        gsap
          .timeline({ onComplete: resolve })
          .to(intro, { reveal: 0.55, duration: 1.5, ease: 'power1.inOut' })
          .to(intro, { reveal: 1, duration: 1.2, ease: 'power2.inOut' })
      })
    },

    release() {
      if (released) return
      from = director.intro(1)
      released = true
      intro.blend = 1
      gsap.to(intro, {
        blend: 0,
        duration: 1.25,
        ease: 'power3.inOut',
        onComplete: () => {
          from = null
        },
      })
      // заставка гаснет полсекунды, и всё это время флакон должен лежать поверх неё,
      // иначе он провалится под занавес и выйдет из-под него заново
      window.setTimeout(() => track.classList.remove('is-intro'), 560)
    },
  }
}
