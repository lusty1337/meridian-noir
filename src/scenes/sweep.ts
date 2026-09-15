import { gsap, ScrollTrigger } from '../lib/scroll'
import { prefersReducedMotion } from '../lib/motion'
import { airAt, daylight, formatClock, sunAt } from '../lib/solar'
import { css, mixOklch, rgbUnit, type Oklch } from '../lib/color'
import { FORMULAS, type Formula } from '../data/formulas'
import { mixRecipe } from '../model/tint'
import { createFlaconStage, type FlaconStage } from './flacon-stage'

/**
 * сжатие площадки: во столько раз круг на плите ниже своей ширины. одно число на всю сцену.
 * по нему построен эллипс обода, по нему же уходит от базы тень, и по нему наклонена
 * трёхмерная камера - иначе рисунок и модель показывают две разные площадки. это синус
 * наклона, а тень умножается на тангенс: у неё длина отложена в высотах гномона, а высота
 * гномона на экране уже укорочена косинусом того же угла
 */
const PLATE_TILT = 0.3

/** сколько прокрутки остаётся до восхода и после заката - чтобы день не начинался в упор */
const EDGE_HOURS = 0.35

/** сколько длится переключение формулы, секунды */
const SWAP_SECONDS = 1.6

/**
 * когда текст дня стоит под сценой, а не сбоку. тот же запрос лежит в scenes.css -
 * разойдутся, и сцена будет считать место под текстом, которого там нет
 */
const STACKED = '(max-width: 900px) and (orientation: portrait)'

/** воздух между сценой и текстом дня */
const HUD_GAP = 18

/** на сколько пикселей тень и пунктир гаснут перед кромкой, за которой текст */
const FADE = 26

/**
 * высота солнца, на которую нормируется дуга по кадру. одно число на все пять площадок, а
 * не полдень каждой. нормируй каждую своей кульминацией - и январская Охара шла бы по такой
 * же дуге, как августовский Марсель, хотя солнце там вдвое ниже. 76° - чуть выше самой
 * высокой из пяти, реюньонской, и ровно в этой пропорции нарисованы глифы в указателе
 */
const ARC_PEAK = 76

/**
 * высота, выше которой свет уже дневной. тёплый цвет у горизонта - это длина пути луча
 * через воздух, и от широты она не зависит: на сорока градусах над горизонтом закатного в
 * свете нет нигде, ни в Марселе, ни в Уюни. по полуденной высоте площадки это считать
 * нельзя - в Уюни зимний полдень в 46° выходил бы вечером
 */
const DAY_ALTITUDE = 42

/**
 * три состояния поля - рассвет, полдень, закат. между ними смешивается всё:
 * небо, плита, цвет тени и цвет солнца. светлота рассвета и заката не опущена ниже
 * 0.645 намеренно: по этому небу идёт текст HUD, и на более тёмном он теряет контраст
 */
type Field = {
  skyTop: Oklch
  skyLow: Oklch
  plateFar: Oklch
  plateNear: Oklch
  shade: Oklch
  sun: Oklch
}

const DAWN: Field = {
  skyTop: { l: 0.645, c: 0.072, h: 258 },
  skyLow: { l: 0.835, c: 0.042, h: 250 },
  plateFar: { l: 0.705, c: 0.034, h: 250 },
  plateNear: { l: 0.605, c: 0.03, h: 252 },
  shade: { l: 0.315, c: 0.05, h: 255 },
  sun: { l: 0.88, c: 0.07, h: 62 },
}

const NOON: Field = {
  skyTop: { l: 0.885, c: 0.024, h: 232 },
  skyLow: { l: 0.975, c: 0.006, h: 230 },
  plateFar: { l: 0.945, c: 0.01, h: 230 },
  plateNear: { l: 0.868, c: 0.014, h: 230 },
  shade: { l: 0.285, c: 0.058, h: 250 },
  sun: { l: 0.99, c: 0.008, h: 95 },
}

const DUSK: Field = {
  skyTop: { l: 0.645, c: 0.085, h: 38 },
  skyLow: { l: 0.87, c: 0.068, h: 62 },
  plateFar: { l: 0.76, c: 0.058, h: 55 },
  plateNear: { l: 0.64, c: 0.048, h: 45 },
  shade: { l: 0.345, c: 0.055, h: 285 },
  sun: { l: 0.845, c: 0.14, h: 45 },
}

const INK: Oklch = { l: 0.19, c: 0.045, h: 250 }
const MADDER: Oklch = { l: 0.5, c: 0.19, h: 26 }

/**
 * день одной площадки. всё, что нужно, чтобы нарисовать её небо. широта и склонение
 * приходят из формулы, остальное считается из них. держим посчитанным, потому что за один
 * кадр перехода это спрашивают под три сотни раз
 */
type Day = {
  lat: number
  dec: number
  rise: number
  set: number
  /** азимут на восходе, приведённый к кадру - им нормируется горизонтальный ход */
  azSpan: number
}

/**
 * азимут, приведённый к кадру. зритель стоит с той стороны гномона, куда падает полуденная
 * тень: в северном полушарии это север, в южном - юг. без пересчёта три площадки из пяти
 * показывали бы циферблат с изнанки: полуденная тень уходила бы за горизонт, а часовые лучи
 * сминались в узкий веер вдоль его линии.
 *
 * поворот на 180°, а не отражение. отражение поставило бы тень на место, но
 * оставило бы восток слева, как в северном кадре, - а зритель, обойдя гномон,
 * поменял местами обе стороны сразу. отсюда и то, ради чего всё это: в южном
 * полушарии часы на циферблате идут против часовой стрелки, и здесь они идут
 * против неё сами, из одной честной перемены знака
 */
function bearing(azimuth: number, lat: number): number {
  if (lat >= 0) return azimuth
  const turned = azimuth + 180
  return turned > 180 ? turned - 360 : turned
}

/**
 * что сцена показывает прямо сейчас. на переходе это не одна из пяти формул, а точка между
 * двумя: широта, склонение, минута среза и края воздуха взяты долями. отсюда солнце встаёт
 * выше или ниже, день делается длиннее или короче, красный луч уезжает на другую минуту - и
 * всё это одним движением, без единого скачка
 */
type View = {
  /** чьи слова и чья этикетка в силе - меняется ровно на полуобороте */
  formula: Formula
  day: Day
  cut: number
  air: [number, number]
  /** начало и конец прокрутки дня, в часах */
  from: number
  to: number
}

function dayOf(lat: number, dec: number): Day {
  const { rise, set } = daylight(lat, dec)
  return {
    lat,
    dec,
    rise,
    set,
    azSpan: Math.max(1, Math.abs(bearing(sunAt(rise + 0.05, lat, dec).azimuth, lat))),
  }
}

function viewOf(from: Formula, to: Formula, m: number): View {
  const at = (a: number, b: number): number => a + (b - a) * m
  const day = dayOf(at(from.latitude, to.latitude), at(from.declination, to.declination))
  return {
    formula: m < 0.5 ? from : to,
    day,
    cut: at(from.cut, to.cut),
    air: [at(from.air[0], to.air[0]), at(from.air[1], to.air[1])],
    from: day.rise - EDGE_HOURS,
    to: day.set + EDGE_HOURS,
  }
}

/** что стоит на этикетке: имя и минута среза, больше ничего */
function title(formula: Formula): string {
  return `${formula.name} ${formula.clock}`
}

interface Layout {
  w: number
  h: number
  horizonY: number
  baseX: number
  baseY: number
  gnomonH: number
  gnomonW: number
  dialRx: number
  dialRy: number
  perspective: number
  /** полудуга солнца по горизонтали, от меридиана флакона */
  arcHalf: number
  /** верх дуги: на эту высоту выходит солнце в ARC_PEAK */
  peakY: number
  /** ниже этой строки и правее этого столбца - текст дня, и тень туда не заходит */
  floor: number
  wall: number
}

interface Point {
  x: number
  y: number
}

/**
 * всё, что не зависит от часа: дуга солнца, часовые метки, лучи циферблата
 * и кривая, которую кончик тени вычерчивает за день. считается один раз на раскладку -
 * иначе каждый кадр скраба стоил бы под три сотни вызовов тригонометрии
 */
interface StaticGeometry {
  sunPath: Point[]
  hourMarks: Point[]
  rays: Array<{ from: Point; to: Point; label: Point; hour: number }>
  cut: { to: Point; label: Point } | null
  declination: Point[]
}

interface Refs {
  place: HTMLElement | null
  clock: HTMLElement | null
  altitude: HTMLElement | null
  shadow: HTMLElement | null
  air: HTMLElement | null
  line: HTMLElement | null
}

/** резолвится, когда сцена готова показаться: программы собраны, первый кадр есть */
export function initSweep(): Promise<void> {
  const section = document.querySelector<HTMLElement>('[data-scene="sweep"]')
  const canvas = document.querySelector<HTMLCanvasElement>('[data-sweep-canvas]')
  const stage = section?.querySelector<HTMLElement>('.sweep__stage')
  if (!section || !canvas || !stage) return Promise.resolve()

  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve()

  const refs: Refs = {
    place: section.querySelector('[data-sweep-place]'),
    clock: section.querySelector('[data-sweep-clock]'),
    altitude: section.querySelector('[data-sweep-alt]'),
    shadow: section.querySelector('[data-sweep-shadow]'),
    air: section.querySelector('[data-sweep-air]'),
    line: section.querySelector('[data-sweep-line]'),
  }

  /**
   * какая формула стоит на плите и куда она сейчас едет. пока переключения нет, from и to -
   * одна и та же формула, а m равно единице: вид получается ровно её собственным. на
   * переходе m идёт от нуля к единице, и ровно через него считается всё - и небо, и цвет
   * стекла, и оборот флакона
   */
  let index = 0
  const blend = { from: FORMULAS[0], to: FORMULAS[0], m: 1 }
  let view = viewOf(blend.from, blend.to, blend.m)
  const hud = stage.querySelector<HTMLElement>('.sweep__hud')
  let layout = measure(canvas, stage, ctx, hud)
  let fixed = buildGeometry(layout, view)
  let lastLine = ''

  /**
   * флакон - настоящий, из той же сборки, что стоит на стенде. холстов у него два, тень и
   * сам предмет, и оба лежат в сцене: их двигает браузер вместе с плитой. двумерный гномон
   * остаётся в файле и рисуется, если WebGL недоступен или если движение выключено: и там и
   * там сцена всё равно обязана рассказать свою историю, а флакон, спускающийся по окну, -
   * это ровно то движение, от которого отказываются
   */
  const shadeCanvas = stage.querySelector<HTMLCanvasElement>('[data-sweep-shade]')
  const flaconCanvas = stage.querySelector<HTMLCanvasElement>('[data-sweep-flacon]')
  const flacon =
    shadeCanvas && flaconCanvas && !prefersReducedMotion()
      ? createFlaconStage(
          { shade: shadeCanvas, flacon: flaconCanvas },
          { recipe: FORMULAS[0].tint, formula: title(FORMULAS[0]) },
        )
      : null
  if (!flacon) {
    shadeCanvas?.remove()
    flaconCanvas?.remove()
  } else {
    veilShade(flacon, layout)
  }
  const source = canvas
  /**
   * небо сцены продолжается за её край. на телефоне над приколотой сценой остаётся полоса
   * под строкой состояния, и в ней видно саму секцию - а она была бумажной. красим секцию
   * цветом верха неба, тогда полоса читается продолжением кадра, а не щелью в нём. без пина
   * (движение выключено) секция не приколота, и красить нечего
   */
  const pinning = !prefersReducedMotion()
  let lastSky = ''
  const paper = getComputedStyle(document.body).getPropertyValue('--paper').trim() || '#e8edef'
  let lastFrame = performance.now()

  function render(progress: number): void {
    if (layout.w < 2 || layout.h < 2) return
    const hour = view.from + (view.to - view.from) * progress
    draw(ctx as CanvasRenderingContext2D, layout, fixed, hour, view, flacon === null)
    lastLine = writeReadout(refs, hour, view, lastLine)
    if (pinning) {
      const sky = css(fieldAt(hour, view).field.skyTop)
      if (sky !== lastSky) {
        // стиль пишется одному элементу, а не переменной: смена переменной
        // пересчитала бы стили всей секции, и так на каждый шаг скраба
        section!.style.backgroundColor = sky
        lastSky = sky
      }
    }
  }

  const state = { p: 0 }

  /**
   * стрелки по обе стороны флакона. появляются только когда сцена стоит: во время прокрутки
   * колесо занято днём, и лишние мишени под курсором сцене не нужны. без трёхмерного
   * флакона их нет вовсе - менять было бы нечего
   */
  const switcher = document.querySelector<HTMLElement>('[data-flacon-switch]')
  if (switcher && !flacon) switcher.remove()

  let swapping = false

  /**
   * шаг по кругу формул. один и тот же ход двигает всё сразу: небо переезжает на другую
   * широту и другой день, стекло перекрашивается, флакон делает полный оборот и приходит на
   * тот же ракурс, а этикетка меняется на дальней его половине, где её не видно.
   *
   * ease inOut, а не out: у переключения нет толчка в начале - оно не отклик на
   * жест, а движение самого предмета, и трогается оно с нуля
   */
  function shift(step: number): void {
    if (!flacon || swapping) return
    const next = (index + step + FORMULAS.length) % FORMULAS.length
    if (next === index) return
    blend.from = FORMULAS[index]
    blend.to = FORMULAS[next]
    blend.m = 0
    index = next
    swapping = true
    gsap.to(blend, {
      m: 1,
      duration: SWAP_SECONDS,
      ease: 'power2.inOut',
      onUpdate: () => carry(step),
      onComplete: () => {
        swapping = false
        carry(step)
      },
    })
  }

  function carry(step: number): void {
    view = viewOf(blend.from, blend.to, blend.m)
    fixed = buildGeometry(layout, view)
    flacon?.tint.apply(mixRecipe(blend.from.tint, blend.to.tint, blend.m))
    flacon?.setSwap(step * blend.m)
    flacon?.write(title(view.formula))
    render(state.p)
  }

  switcher?.querySelector('[data-flacon-prev]')?.addEventListener('click', () => shift(-1))
  switcher?.querySelector('[data-flacon-next]')?.addEventListener('click', () => shift(1))

  let awake = false
  let lastTop = Number.NaN
  let lastEntrance = Number.NaN
  let lastProgress = Number.NaN
  let still = 0
  let quiet = 0
  let shown = true

  /**
   * флакон живёт на кадровом таймере, а не на колбэках прокрутки, и рисуется только тогда,
   * когда в картинке что-то поменялось. положение самой сцены его больше не касается: оба
   * холста лежат в приколотой секции и едут с ней за браузером. кадр нужен, только если
   * сдвинулся день, идёт полёт, переключение или флакон в руках. прокрутка до секции, после
   * неё и внутри пина без хода солнца не стоит ни одного кадра WebGL - и именно поэтому ни
   * на одном из этих отрезков флакон не может отстать от плиты
   */
  function frame(force = false): void {
    if (!flacon || layout.w < 2 || layout.h < 2) return

    const top = stage!.getBoundingClientRect().top
    const fold = window.innerHeight
    const onScreen = top < fold && top > -layout.h
    // холст флакона стоит там, где его оставил последний кадр, и едет вместе со сценой.
    // уйди секция за нижнюю кромку посреди полёта - и флакон остался бы висеть над
    // текстом выше, когда к нему прокрутят обратно
    if (onScreen !== shown) {
      flaconCanvas?.style.setProperty('visibility', onScreen ? 'visible' : 'hidden')
      shown = onScreen
    }
    // sticky держит верх сцены ровно в нуле все четыре экрана скраба: это и есть
    // единственное состояние, в котором флакон можно трогать. считается до выхода
    // по видимости, иначе прыжок по якорю оставил бы флакон навсегда взятым в руки
    const pinned = onScreen && Math.abs(top) < 1
    flacon.setReach(pinned)

    const scrolled = Math.abs(top - lastTop) > 0.05 || state.p !== lastProgress
    lastTop = onScreen ? top : Number.NaN
    if (!onScreen && !force) return

    // появление считается по самой сцене: ноль - её верх на нижней кромке окна,
    // единица - на верхней. ровно тот отрезок, на котором секция въезжает в кадр
    const entrance = clamp(1 - top / Math.max(fold, 1), 0, 1)

    /**
     * покой считается двумя счётчиками, а не одним. quiet - про прокрутку: по нему выходят
     * стрелки. still - про кадры, и в него входит и переключение, и парение под курсором.
     * будь счётчик один, стрелки прятались бы ровно в тот момент, когда на флакон навели
     * курсор.
     *
     * настой после остановки ещё качается на пружине, поэтому кадры идут не до
     * первого совпадения, а полторы секунды после него
     */
    quiet = scrolled ? 0 : quiet + 1
    const changed = entrance !== lastEntrance || state.p !== lastProgress
    lastEntrance = entrance
    lastProgress = state.p
    const moved = force || changed || swapping || flacon.restless()
    still = moved ? 0 : still + 1

    wake(pinned && quiet > 16)

    if (still > 90) return

    const hour = view.from + (view.to - view.from) * state.p
    const now = performance.now()
    // шаг ограничен той же третью секунды, что и на стенде: первый кадр после
    // загрузки приходит с разрывом в несколько секунд, и пружина настоя от него
    // расходится
    const dt = Math.min((now - lastFrame) / 1000, 1 / 30)
    lastFrame = now
    placeFlacon(flacon, source, paper, layout, hour, view, entrance, dt, top)
  }

  /**
   * стрелки встают по бокам флакона, в пикселях сцены: они лежат в ней же и едут с
   * ней, так что координаты пишутся один раз на раскладку, а не на каждый кадр
   */
  let placedFor = ''
  function wake(on: boolean): void {
    if (!switcher) return
    const key = `${layout.baseX}:${layout.baseY}:${layout.gnomonH}`
    if (on && key !== placedFor) {
      placedFor = key
      switcher.style.setProperty('--cx', `${layout.baseX}px`)
      switcher.style.setProperty('--cy', `${layout.baseY - layout.gnomonH * 0.5}px`)
      switcher.style.setProperty('--dx', `${layout.gnomonH * 0.34 + 54}px`)
    }
    if (awake === on) return
    awake = on
    switcher.classList.toggle('is-awake', on)
    // убранные стрелки не должны ловить ни табуляцию, ни экранный диктор
    switcher.inert = !on
  }

  // следим за коробкой сцены, а не за окном: высота у неё в lvh и от адресной строки
  // не зависит, так что наблюдатель молчит там, где window.resize срабатывал на каждое
  // движение пальца и рвал инерцию
  let pending = 0
  let measuredFor = `${stage.clientWidth}x${stage.clientHeight}`
  const relayout = (): void => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      measuredFor = `${stage.clientWidth}x${stage.clientHeight}`
      layout = measure(canvas, stage, ctx, hud)
      if (flacon) veilShade(flacon, layout)
      fixed = buildGeometry(layout, view)
      ScrollTrigger.refresh()
      // назначение ширины холсту стирает его. без этой строки сцена остаётся
      // пустой до следующего движения колеса - на повороте телефона это заметно
      render(state.p)
      frame(true)
    })
  }
  // наблюдатель смотрит на коробку содержимого, а у сцены сверху отступ под строку
  // состояния. сменись он, а размер нет - и сцена пересобиралась бы вместе с refresh
  // всего ScrollTrigger прямо посреди прокрутки. считаем только настоящую смену размера
  const observer = new ResizeObserver(() => {
    if (`${stage.clientWidth}x${stage.clientHeight}` !== measuredFor) relayout()
  })
  observer.observe(stage)
  // текст дня мерился до того, как пришли шрифты, а его высота от них зависит
  void document.fonts.ready.then(relayout)

  if (prefersReducedMotion()) {
    // альтернативная версия сцены: один кадр в момент среза, без пина и без скраба.
    // весь остальной текст сцены живёт в transcript, который на этом режиме показан
    render((view.cut - view.from) / (view.to - view.from))
    return Promise.resolve()
  }

  gsap.to(state, {
    p: 1,
    ease: 'none',
    /**
     * пин держит браузер, а не скрипт: сцена стоит в секции на position: sticky. пин
     * ScrollTrigger переключал ей position: fixed из главного потока, а на телефоне
     * прокрутку ведёт композитор, и переключение приходило на кадр позже: сцена вздрагивала
     * на входе и на выходе. sticky композитор держит сам. здесь остался только ход дня - от
     * верха секции до её низа, длину задаёт CSS
     */
    scrollTrigger: {
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      // 0.45: выше 0.6 картинка заметно отстаёт от колеса и сцена перестаёт
      // читаться как управляемая
      scrub: 0.45,
      invalidateOnRefresh: true,
    },
    onUpdate: () => render(state.p),
  })

  render(0)
  /**
   * первый кадр флакона считается в посадке, а не там, где секция сейчас. цель у него не
   * картинка, а разовые расходы. три откладывает всё до первого попадания в кадр: буфер
   * просвета, карту теней, программы. в начале страницы флакон стоит выше кромки и
   * отсекается по пирамиде, так что откладывать было бы до момента появления - и он
   * приходил в кадр после двух секунд тишины. считаем один кадр так, будто он уже сел: и
   * просвет, и тень, и надпись проходят весь путь, пока экран закрыт заставкой
   */
  if (flacon) {
    placeFlacon(flacon, source, paper, layout, view.cut, view, 1, 0, 0)
    lastFrame = performance.now()
  }
  frame(true)
  if (flacon) {
    gsap.ticker.add(() => frame())
    listen(flacon, () => lastTop, () => awake, shift)
  }

  return flacon ? flacon.warm() : Promise.resolve()
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/**
 * курсор и палец. оба слушаются на окне, а не на холсте. холсты флакона сквозные для мыши -
 * иначе тень на весь кадр забрала бы себе клики по стрелкам, - поэтому попадание в предмет
 * считает сама сцена по его коробке. окно переводится в пиксели сцены через её верх,
 * который кадровый таймер и так уже знает.
 *
 * все слушатели passive и ни один не зовёт preventDefault. это и есть условие
 * задачи на телефоне: палец по флакону крутит модель И листает страницу, потому
 * что жест не перехвачен ни на миллиметр
 */
function listen(
  stage: FlaconStage,
  where: () => number,
  awake: () => boolean,
  shift: (step: number) => void,
): void {
  let held: number | null = null
  let from = 0

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId === held) {
        stage.drag(event.clientX - from)
        from = event.clientX
        return
      }
      // палец не наводят: у касания нет состояния "над предметом", и подъём по
      // нему выглядел бы как случайное срабатывание при листании
      if (event.pointerType !== 'touch') stage.point(event.clientX, event.clientY - where())
    },
    { passive: true },
  )

  window.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') return
      if (!stage.covers(event.clientX, event.clientY - where())) return
      held = event.pointerId
      from = event.clientX
    },
    { passive: true },
  )

  const release = (event: PointerEvent): void => {
    if (event.pointerId === held) held = null
  }
  window.addEventListener('pointerup', release, { passive: true })
  window.addEventListener('pointercancel', release, { passive: true })

  // курсор ушёл за край окна: pointerout без соседа - единственное, что об этом сообщает
  document.addEventListener('pointerout', (event) => {
    if (!event.relatedTarget) stage.point(null, null)
  })

  window.addEventListener('keydown', (event) => {
    if (!awake() || event.metaKey || event.ctrlKey || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target?.isContentEditable) return
    if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return
    if (event.key === 'ArrowLeft') shift(-1)
    else if (event.key === 'ArrowRight') shift(1)
    else return
    event.preventDefault()
  })
}

function measure(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  ctx: CanvasRenderingContext2D,
  hud: HTMLElement | null,
): Layout {
  // пока секция не получила размер - например, вкладку открыли в фоне - деление
  // на высоту даёт NaN, и первый же градиент падает. считаем по единице и ждём
  // следующего срабатывания наблюдателя
  const w = Math.max(1, stage.clientWidth)
  const h = Math.max(1, stage.clientHeight)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const perspective = Math.tan(Math.asin(PLATE_TILT))
  // сцена заходит под строку состояния и под вырез экрана, а солнце в полдень - нет.
  // отступ приходит из padding сцены: env() из скрипта напрямую не прочитать
  const safeTop = parseFloat(getComputedStyle(stage).paddingTop) || 0
  // старый верх снимается до замера: растянутый им текст дал бы низ по прошлому окну
  stage.style.removeProperty('--hud-top')
  const reach = hud ? hudReach(hud) : 0

  /**
   * текст дня под сценой, и сцена считается от его верха вверх. раньше доли брались от
   * высоты окна, а текст стоял у низа сам по себе - на телефоне с панелями Safari он лёг
   * прямо на обод, подписи часов и флакон. теперь над текстом садится циферблат с
   * подписями, над ним горизонт, а флакон берёт то, что осталось до дуги
   */
  if (hud && window.matchMedia(STACKED).matches) {
    const hudTop = Math.round(hud.offsetTop + hud.offsetHeight - reach)
    stage.style.setProperty('--hud-top', `${hudTop}px`)
    const floor = hudTop - HUD_GAP
    // подписи часов стоят за ободом на 16 px, и у левого края они садились на меридиан
    const dialRx = Math.max(40, Math.min(w * 0.39, w / 2 - 44, 430, floor * 0.4))
    const dialRy = dialRx * PLATE_TILT
    const baseY = floor - FADE - 24 - dialRy
    const peakY = Math.max(safeTop + 20, h * 0.045)
    const gnomonH = Math.max(40, Math.min(dialRx * 1.05, (baseY - peakY) * 0.66))
    return {
      w,
      h,
      horizonY: baseY - dialRy - 36,
      baseX: w * 0.5,
      baseY,
      gnomonH,
      gnomonW: gnomonH * 0.42,
      dialRx,
      dialRy,
      perspective,
      arcHalf: w * 0.44,
      peakY,
      floor,
      wall: w,
    }
  }

  const hudLeft = hud ? hud.offsetLeft : w
  const hudBottom = hud ? hud.offsetTop + reach : 0
  const baseX = w * 0.382
  const horizonY = h * 0.52
  const plate = h - horizonY
  const baseY = horizonY + plate * 0.3
  const gnomonH = plate * 0.62
  // в коротком окне текст сбоку спускается ниже горизонта, на плиту. тогда она
  // кончается перед ним столбцом, и тень гаснет у его левого края
  const wall = hudBottom + HUD_GAP > horizonY ? hudLeft - HUD_GAP : w
  // не шире плиты: в низком окне дальняя кромка обода уходила за горизонт и срезалась
  const dialRx = Math.max(40, Math.min(w * 0.3, 430, plate, wall - FADE - 26 - baseX))

  return {
    w,
    h,
    horizonY,
    baseX,
    baseY,
    gnomonH,
    gnomonW: gnomonH * 0.42,
    dialRx,
    dialRy: dialRx * PLATE_TILT,
    perspective,
    // дуга кончается перед текстом, а не у края кадра: иначе солнце к полудню
    // проходило ровно под цифрами часов
    arcHalf: Math.max(60, Math.min(w * 0.44, baseX - w * 0.04, hudLeft - HUD_GAP - 8 - baseX)),
    peakY: Math.max(safeTop + 20, h * 0.07),
    floor: h,
    wall,
  }
}

/**
 * высота текста дня на самой длинной из его строк. строка под часами меняется по ходу дня и
 * с формулой, а сцена раскладывается один раз. посчитай по текущей - и первый же перенос на
 * лишнюю строку положил бы текст на циферблат. меряем на невидимой копии: живой регион
 * прочитал бы диктору полсотни чужих строк
 */
function hudReach(hud: HTMLElement): number {
  const probe = hud.cloneNode(true) as HTMLElement
  probe.setAttribute('aria-hidden', 'true')
  probe.querySelector('[aria-live]')?.removeAttribute('aria-live')
  probe.style.visibility = 'hidden'
  probe.style.top = '0px'
  probe.style.bottom = 'auto'
  hud.after(probe)

  const tallest = (selector: string, texts: string[]): void => {
    const el = probe.querySelector<HTMLElement>(selector)
    if (!el) return
    let best = el.textContent ?? ''
    let most = el.offsetHeight
    for (const text of texts) {
      el.textContent = text
      if (el.offsetHeight > most) {
        most = el.offsetHeight
        best = text
      }
    }
    el.textContent = best
  }
  tallest('[data-sweep-place]', FORMULAS.map(placeOf))
  tallest('[data-sweep-line]', FORMULAS.flatMap((formula) => formula.lines.map((line) => line.text)))
  tallest('[data-sweep-shadow]', ['off the plate'])

  const height = probe.offsetHeight
  probe.remove()
  return height
}

/**
 * кромка, за которой текст: всё, что нарисовано на плите, к ней гаснет, а не
 * обрезается. тень и пунктир уходят далеко за обод, и срез по линии читался бы как
 * край стола посреди плиты
 */
function veil(ctx: CanvasRenderingContext2D, l: Layout): void {
  if (l.floor >= l.h && l.wall >= l.w) return
  const fade =
    l.floor < l.h
      ? ctx.createLinearGradient(0, l.floor - FADE, 0, l.floor)
      : ctx.createLinearGradient(l.wall - FADE, 0, l.wall, 0)
  fade.addColorStop(0, '#000')
  fade.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, l.w, l.h)
  ctx.globalCompositeOperation = 'source-over'
}

/** та же кромка для трёхмерной тени - в шейдере её плиты, один раз на раскладку */
function veilShade(stage: FlaconStage, l: Layout): void {
  if (l.floor < l.h) stage.setVeil('y', l.floor - FADE, l.floor)
  else if (l.wall < l.w) stage.setVeil('x', l.wall - FADE, l.wall)
  else stage.setVeil(null, 0, 0)
}

function buildGeometry(l: Layout, view: View): StaticGeometry {
  const day = view.day
  const sunPath: Point[] = []
  for (let t = day.rise; t <= day.set; t += 0.2) sunPath.push(sunScreen(l, t, view))

  const hourMarks: Point[] = []
  const rays: StaticGeometry['rays'] = []
  for (let t = Math.ceil(day.rise); t <= day.set; t += 1) {
    hourMarks.push(sunScreen(l, t, view))
    const rim = dialRim(l, shadowVector(t, l, view))
    if (!rim) continue
    rays.push({
      from: { x: l.baseX + rim.ux * l.gnomonW * 0.5, y: l.baseY + rim.uy * l.gnomonW * 0.5 },
      to: { x: rim.x, y: rim.y },
      label: { x: rim.labelX, y: rim.labelY },
      hour: t,
    })
  }

  const cutRim = dialRim(l, shadowVector(view.cut, l, view))

  const declination: Point[] = []
  // только там, где солнце уже оторвалось от горизонта: ниже 7° тень упирается
  // в дальний край плиты, и кривая вырождается в прямую вдоль горизонта
  for (let t = day.rise; t <= day.set; t += 0.08) {
    if (sunAt(t, day.lat, day.dec).altitude < 7) continue
    const v = shadowVector(t, l, view)
    declination.push({ x: l.baseX + v.x, y: l.baseY + v.y })
  }

  return {
    sunPath,
    hourMarks,
    rays,
    cut: cutRim ? { to: { x: cutRim.x, y: cutRim.y }, label: { x: cutRim.labelX, y: cutRim.labelY } } : null,
    declination,
  }
}

function fieldAt(hour: number, view: View): { field: Field; altitude: number } {
  const { altitude } = sunAt(hour, view.day.lat, view.day.dec)
  const e = Math.max(0, Math.min(1, altitude / DAY_ALTITUDE)) ** 0.7
  const base = hour < 12 ? DAWN : DUSK
  return {
    altitude,
    field: {
      skyTop: mixOklch(base.skyTop, NOON.skyTop, e),
      skyLow: mixOklch(base.skyLow, NOON.skyLow, e),
      plateFar: mixOklch(base.plateFar, NOON.plateFar, e),
      plateNear: mixOklch(base.plateNear, NOON.plateNear, e),
      shade: mixOklch(base.shade, NOON.shade, e),
      sun: mixOklch(base.sun, NOON.sun, e),
    },
  }
}

/** экранный вектор тени: восток уходит влево, север - вниз к зрителю и сжат перспективой */
function shadowVector(
  hour: number,
  l: Layout,
  view: View,
): { x: number; y: number; length: number } {
  const { azimuth, shadowRatio } = sunAt(hour, view.day.lat, view.day.dec)
  const az = (bearing(azimuth, view.day.lat) * Math.PI) / 180
  const ratio = Math.min(shadowRatio, 16)

  let x = -Math.sin(az) * ratio * l.gnomonH
  let y = Math.cos(az) * ratio * l.gnomonH * l.perspective

  // плоскость земли кончается на горизонте: тень, уходящая от зрителя,
  // сходится к нему и не может его пересечь
  const room = l.baseY - l.horizonY - 3
  if (y < -room) {
    const f = -room / y
    x *= f
    y *= f
  }

  return { x, y, length: Math.hypot(x, y) }
}

function draw(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  fixed: StaticGeometry,
  hour: number,
  view: View,
  flatGnomon: boolean,
): void {
  const { field, altitude } = fieldAt(hour, view)

  ctx.clearRect(0, 0, l.w, l.h)

  drawSunPath(ctx, fixed)
  drawSun(ctx, l, hour, altitude, view, field)
  // горизонт тоже до кромки: в низком окне текст сбоку спускается к нему, и линия
  // шла бы прямо под последней строкой
  ctx.strokeStyle = css(INK, 0.3)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, l.horizonY + 0.5)
  ctx.lineTo(l.w, l.horizonY + 0.5)
  ctx.stroke()

  drawDial(ctx, l, fixed, view.formula.clock)
  drawCastShadow(ctx, l, hour, view, field, flatGnomon)
  veil(ctx, l)

  // небо и плита кладутся под уже нарисованное, а не до него: иначе кромка у текста
  // стёрла бы вместе с тенью и саму плиту
  ctx.globalCompositeOperation = 'destination-over'
  const plate = ctx.createLinearGradient(0, l.horizonY, 0, l.h)
  plate.addColorStop(0, css(field.plateFar))
  plate.addColorStop(1, css(field.plateNear))
  ctx.fillStyle = plate
  ctx.fillRect(0, l.horizonY, l.w, l.h - l.horizonY)

  const sky = ctx.createLinearGradient(0, 0, 0, l.horizonY)
  sky.addColorStop(0, css(field.skyTop))
  sky.addColorStop(1, css(field.skyLow))
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, l.w, l.horizonY)
  ctx.globalCompositeOperation = 'source-over'

  if (flatGnomon) drawGnomon(ctx, l, hour, view, field)
}

/**
 * флакон ставится после двумерной сцены, а не вместе с ней: подложка для просвета
 * снимается с уже отрисованной плиты, и стекло преломляет ту же тень, что лежит
 * рядом с ним на холсте
 */
function placeFlacon(
  stage: FlaconStage,
  source: HTMLCanvasElement,
  paper: string,
  l: Layout,
  hour: number,
  view: View,
  entrance: number,
  dt: number,
  /**
   * где сейчас коробка сцены относительно окна. пока флакон летит, она ниже сгиба
   * и число положительное; на пине ноль; после пина уходит в минус
   */
  top: number,
): void {
  const { field, altitude } = fieldAt(hour, view)
  const { azimuth } = sunAt(hour, view.day.lat, view.day.dec)
  const facing = bearing(azimuth, view.day.lat)

  stage.layout({
    w: l.w,
    h: l.h,
    fold: window.innerHeight,
    offsetY: top,
    horizonY: l.horizonY,
    baseX: l.baseX,
    baseY: l.baseY,
    gnomonH: l.gnomonH,
    tilt: PLATE_TILT,
  })

  // сила света идёт за высотой солнца, а не за часом: у горизонта луч проходит
  // через всю толщу воздуха, и от него остаётся треть
  const above = Math.max(0, Math.sin((altitude * Math.PI) / 180))
  stage.setSun(facing, altitude, rgbUnit(field.sun), 0.45 + 1.35 * above)
  // тень тем плотнее, чем выше солнце: на закате свет приходит отовсюду сразу
  stage.setShade(rgbUnit(field.shade), 0.3 + 0.3 * above)
  stage.setEntrance(entrance)
  stage.setBackdrop(source, paper)
  stage.render(dt)
}

function drawSunPath(ctx: CanvasRenderingContext2D, fixed: StaticGeometry): void {
  ctx.strokeStyle = css(INK, 0.16)
  ctx.lineWidth = 1
  ctx.beginPath()
  fixed.sunPath.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()

  ctx.strokeStyle = css(INK, 0.28)
  ctx.beginPath()
  fixed.hourMarks.forEach((p) => {
    ctx.moveTo(p.x, p.y - 4)
    ctx.lineTo(p.x, p.y + 4)
  })
  ctx.stroke()
}

function sunScreen(l: Layout, hour: number, view: View): { x: number; y: number } {
  const { altitude, azimuth } = sunAt(hour, view.day.lat, view.day.dec)
  return {
    // от меридиана флакона, а не от середины кадра: в полдень солнце стоит ровно над ним
    x: l.baseX + (bearing(azimuth, view.day.lat) / view.day.azSpan) * l.arcHalf,
    // потолок обязателен: на переходе площадка проезжает через тропики, солнце там
    // встаёт в зенит, и без него дуга уходила бы за верхнюю кромку кадра
    y: l.horizonY - Math.min(1, altitude / ARC_PEAK) * (l.horizonY - l.peakY),
  }
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  hour: number,
  altitude: number,
  view: View,
  field: Field,
): void {
  if (altitude <= 0) return
  const p = sunScreen(l, hour, view)
  ctx.fillStyle = css(field.sun)
  ctx.beginPath()
  ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = css(INK, 0.32)
  ctx.lineWidth = 1
  ctx.stroke()
}

/**
 * циферблат. лучи упираются в обод, а не уходят в край кадра: незамкнутый веер
 * читается как звёздочка, замкнутый - как прибор. луч 12:04 отдельный и красный,
 * на него тень садится ровно в момент среза. пунктиром - кривая, которую кончик
 * тени вычерчивает за весь день
 */
function drawDial(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  fixed: StaticGeometry,
  clock: string,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, l.horizonY, l.w, l.h - l.horizonY)
  ctx.clip()

  ctx.strokeStyle = css(INK, 0.18)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.ellipse(l.baseX, l.baseY, l.dialRx, l.dialRy, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.font = '500 11px "Schibsted Grotesk", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const strong of [false, true]) {
    ctx.strokeStyle = css(INK, strong ? 0.28 : 0.15)
    ctx.beginPath()
    fixed.rays
      .filter((r) => (r.hour % 3 === 0) === strong)
      .forEach((r) => {
        ctx.moveTo(r.from.x, r.from.y)
        ctx.lineTo(r.to.x, r.to.y)
      })
    ctx.stroke()
  }

  ctx.fillStyle = css(INK, 0.55)
  fixed.rays
    .filter((r) => r.hour % 2 === 0 && r.hour !== 12)
    .forEach((r) => ctx.fillText(String(r.hour), r.label.x, r.label.y))

  ctx.strokeStyle = css(INK, 0.24)
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  fixed.declination.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
  ctx.setLineDash([])

  if (fixed.cut) {
    ctx.strokeStyle = css(MADDER, 0.85)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(l.baseX, l.baseY)
    ctx.lineTo(fixed.cut.to.x, fixed.cut.to.y)
    ctx.stroke()

    ctx.fillStyle = css(MADDER)
    ctx.font = '600 11px "Schibsted Grotesk", Arial, sans-serif'
    ctx.fillText(clock, fixed.cut.label.x, fixed.cut.label.y)
  }

  ctx.restore()
}

/** точка, где направление тени пересекает эллипс обода */
function dialRim(
  l: Layout,
  v: { x: number; y: number; length: number },
): { x: number; y: number; ux: number; uy: number; labelX: number; labelY: number } | null {
  if (v.length < 1) return null
  const ux = v.x / v.length
  const uy = v.y / v.length
  const t = 1 / Math.hypot(ux / l.dialRx, uy / l.dialRy)
  return {
    x: l.baseX + ux * t,
    y: l.baseY + uy * t,
    ux,
    uy,
    labelX: l.baseX + ux * (t + 16),
    labelY: l.baseY + uy * (t + 16),
  }
}

/**
 * тень рисуется, только пока флакон плоский. у модели тень своя, настоящая, и две
 * рядом читались бы как два предмета. точка на конце остаётся в обоих случаях:
 * это отсчёт, по нему сцена и читается
 */
function drawCastShadow(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  hour: number,
  view: View,
  field: Field,
  painted: boolean,
): void {
  const v = shadowVector(hour, l, view)
  if (v.length < 2) return

  const ux = v.x / v.length
  const uy = v.y / v.length
  const nx = -uy
  const ny = ux

  const half = l.gnomonW * 0.46
  const tipHalf = half * (1 + Math.min(v.length / (l.gnomonH * 3.4), 1.1))

  const tipX = l.baseX + v.x
  const tipY = l.baseY + v.y

  const grad = ctx.createLinearGradient(l.baseX, l.baseY, tipX, tipY)
  grad.addColorStop(0, css(field.shade, 0.66))
  grad.addColorStop(0.3, css(field.shade, 0.52))
  grad.addColorStop(0.72, css(field.shade, 0.2))
  grad.addColorStop(1, css(field.shade, 0))

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, l.horizonY, l.w, l.h - l.horizonY)
  ctx.clip()
  // полутень растёт вместе с длиной, но медленно: у жёсткого солнца ядро тени режущее,
  // и размытие на всю фигуру превращает её в кляксу
  if (painted) {
    ctx.filter = `blur(${Math.min(1 + v.length * 0.006, 7).toFixed(2)}px)`
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(l.baseX - nx * half, l.baseY - ny * half)
    ctx.lineTo(l.baseX + nx * half, l.baseY + ny * half)
    ctx.lineTo(tipX + nx * tipHalf, tipY + ny * tipHalf)
    ctx.lineTo(tipX - nx * tipHalf, tipY - ny * tipHalf)
    ctx.closePath()
    ctx.fill()
  }

  ctx.filter = 'none'
  ctx.fillStyle = css(MADDER, 0.9)
  ctx.beginPath()
  ctx.arc(tipX, tipY, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawGnomon(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  hour: number,
  view: View,
  field: Field,
): void {
  const half = l.gnomonW / 2
  const gh = l.gnomonH

  // правый профиль флакона снизу вверх; левый - его зеркало
  const profile: Array<[number, number]> = [
    [0.94, 0],
    [1, 0.035],
    [1, 0.6],
    [0.96, 0.655],
    [0.62, 0.735],
    [0.28, 0.775],
    [0.24, 0.86],
    [0.4, 0.878],
    [0.4, 1],
  ]

  const trace = (path: Path2D, mirror: number, reverse: boolean): void => {
    const pts = reverse ? [...profile].reverse() : profile
    pts.forEach(([sx, sy], i) => {
      const x = l.baseX + sx * half * mirror
      const y = l.baseY - sy * gh
      if (i === 0 && !reverse) path.moveTo(x, y)
      else path.lineTo(x, y)
    })
  }

  const shape = new Path2D()
  trace(shape, 1, false)
  trace(shape, -1, true)
  shape.closePath()

  ctx.save()
  ctx.filter = 'blur(2.5px)'
  ctx.fillStyle = css(field.shade, 0.5)
  ctx.beginPath()
  ctx.ellipse(l.baseX, l.baseY + 1, half * 1.02, half * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const glass = ctx.createLinearGradient(l.baseX - half, 0, l.baseX + half, 0)
  glass.addColorStop(0, css(field.shade, 0.9))
  glass.addColorStop(0.5, css(field.shade, 0.78))
  glass.addColorStop(1, css(field.shade, 0.93))
  ctx.fillStyle = glass
  ctx.fill(shape)

  ctx.save()
  ctx.clip(shape)

  // уровень жидкости: настой темнее стекла и садится не по краю корпуса,
  // а по мениску - поэтому линия рисуется отдельно и на полтона светлее
  const level = l.baseY - gh * 0.4
  const juice = ctx.createLinearGradient(0, level, 0, l.baseY)
  juice.addColorStop(0, css({ l: 0.34, c: 0.082, h: 46 }, 0.8))
  juice.addColorStop(1, css({ l: 0.23, c: 0.062, h: 38 }, 0.92))
  ctx.fillStyle = juice
  ctx.fillRect(l.baseX - half, level, half * 2, l.baseY - level)

  ctx.fillStyle = css({ l: 0.52, c: 0.1, h: 52 }, 0.7)
  ctx.fillRect(l.baseX - half, level, half * 2, 1.5)

  // блик стоит с той стороны, откуда светит: сторона считается из вектора тени,
  // а не задаётся константой - иначе к вечеру он остаётся не с той стороны
  const lit = sunSide(hour, l, view)
  const streak = ctx.createLinearGradient(0, l.baseY - gh * 0.6, 0, l.baseY - gh * 0.08)
  streak.addColorStop(0, css(field.skyLow, 0))
  streak.addColorStop(0.22, css(field.skyLow, 0.22))
  streak.addColorStop(0.8, css(field.skyLow, 0.16))
  streak.addColorStop(1, css(field.skyLow, 0))
  ctx.fillStyle = streak
  ctx.fillRect(l.baseX + lit * half * 0.64, l.baseY - gh * 0.6, half * 0.1, gh * 0.52)
  ctx.restore()

  ctx.strokeStyle = css(field.shade, 0.85)
  ctx.lineWidth = 1
  ctx.stroke(shape)

  const rim = new Path2D()
  trace(rim, sunSide(hour, l, view), false)
  ctx.strokeStyle = css(field.skyLow, 0.5)
  ctx.lineWidth = 1.4
  ctx.stroke(rim)
}

function sunSide(hour: number, l: Layout, view: View): number {
  return shadowVector(hour, l, view).x >= 0 ? -1 : 1
}

function placeOf(formula: Formula): string {
  return (
    `${formula.name} ${formula.clock} · ${formula.date} · ` +
    `${formula.coordinates} · apparent solar time`
  )
}

function writeReadout(refs: Refs, hour: number, view: View, lastLine: string): string {
  const { altitude, shadowRatio } = sunAt(hour, view.day.lat, view.day.dec)
  const formula = view.formula

  if (refs.place) refs.place.textContent = placeOf(formula)
  if (refs.clock) refs.clock.textContent = formatClock(hour)
  if (refs.altitude) refs.altitude.textContent = `${altitude.toFixed(1)}°`
  if (refs.shadow) {
    refs.shadow.textContent =
      altitude > 1.2 ? `${shadowRatio.toFixed(2)} × h` : 'off the plate'
  }
  if (refs.air) {
    refs.air.textContent = `${Math.round(airAt(hour, view.air[0], view.air[1]))} °C`
  }

  const lines = formula.lines
  let index = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (hour >= lines[i].at) index = i
  }
  // ключ с именем формулы, а не один номер: у другой площадки та же строка под тем
  // же номером - совсем другой текст, и без имени сцена бы её не перерисовала
  const key = `${formula.id}:${index}`
  if (key !== lastLine && refs.line) {
    refs.line.textContent = lines[index].text
    refs.line.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    })
  }
  return key
}
