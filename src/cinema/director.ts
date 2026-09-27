import { FORMULAS, type Formula } from '../data/formulas'
import { mixOklch, type Oklch } from '../lib/color'
import { isCoarsePointer } from '../lib/motion'
import { HOUSE_TINT, mixRecipe, type TintRecipe } from '../model/tint'
import { EXPLODED_HEIGHT } from './actor'
import type { Placement } from './stage'

/**
 * режиссёр: по прокрутке отдаёт все планы, которые сейчас видно, и одно солнце на всех.
 * у каждой секции свой план, и флакон в нём прибит к месту в вёрстке - он едет вместе со
 * страницей без догона и без задержки. между секциями флаконы не перелетают: верхний уходит
 * вместе со своей секцией, нижний уже стоит в своей. через весь сайт тянется только свет -
 * он поворачивается по прокрутке и к приходу каждой секции успевает встать как надо.
 *
 * это чистый счёт. сцену он не трогает и ничего не рисует
 */

/**
 * флаконы на всю страницу. планы, которые не бывают в кадре вместе, делят одних и тех же:
 * первый кадр, кожа на телефоне и комната ставней, указатель и цены, стол и подвал. семь сборок
 * вместо двенадцати - и семь, а не двенадцать надписей в памяти видеокарты
 */
export const POOL: Array<{ formula: number }> = [
  { formula: 0 },
  { formula: 0 },
  { formula: 1 },
  { formula: 2 },
  { formula: 3 },
  { formula: 4 },
  { formula: 0 },
]
const SOLO = 0
const RANK = [1, 2, 3, 4, 5]
const BENCH = 6

/** рабочий ракурс, как у флакона на плите: фасад и боковая грань вместе */
const REST_YAW = -0.32

/** указатель: пять флаконов идут диагональю вглубь, как строй, а не в линейку */
const RANK_X = 0.42
const RANK_Z = -0.62

/** объёмы в линейке покупки. масштаб - кубический корень из объёма: так и выходят бутылки */
const SIZES = [1, Math.cbrt(60 / 100), Math.cbrt(9 / 100)]

/** половины корпуса по фасаду и в глубину, в высотах флакона - по ним считается силуэт */
const HALF_W = 0.285
const HALF_D = 0.163

/**
 * слои формулы Cypress 12:04 по порядку строк - один настой, разобранный на доли. цвет у
 * всех общий, домовый, и слои отличаются только светлотой: смола тёмная, известняковый
 * аккорд светлее, спирт с водой светлее всех. разные тона читались как полосатая
 * конфета, а не как один разлив
 */
export const LAYERS: Oklch[] = [0.5, 0.39, 0.68, 0.58, 0.46, 0.53, 0.76].map((l) => ({
  l,
  c: HOUSE_TINT.liquid.c * (0.5 + 0.55 * l),
  h: HOUSE_TINT.liquid.h,
}))

/**
 * что звучит на коже в каждой строке раздела "on skin": номера слоёв. перец; дерево и
 * камень; бессмертник и ладанник; амбретта и минеральный след, который остаётся
 */
const SKIN = [[5], [0, 2], [4, 1], [3, 2]]

/**
 * стекло на столе формулы. цвет дома - марена у дна - красил бы в красное любой слой под
 * собой, и доли читались бы оттенками одного вина. пустой флакон на столе - просто стекло,
 * и цвет у разлива свой
 */
const BENCH_GLASS: TintRecipe = {
  base: { l: 0.84, c: 0.018, h: 30 },
  top: { l: 0.82, c: 0.02, h: 245 },
  liquid: HOUSE_TINT.liquid,
  deep: HOUSE_TINT.deep,
}

const LIGHT: Record<'noon' | 'moon' | 'shutter' | 'dusk', Oklch> = {
  noon: { l: 0.97, c: 0.02, h: 80 },
  moon: { l: 0.9, c: 0.03, h: 245 },
  shutter: { l: 0.95, c: 0.035, h: 72 },
  dusk: { l: 0.82, c: 0.12, h: 52 },
}

/** на сколько поднимается флакон под рукой, в высотах флакона */
const HAND_LIFT = 0.1

/**
 * на сколько экранов прокрутки стол формулы стоит на месте. за это время флакон
 * разбирается, в него по очереди льются семь слоёв и его собирают обратно. доли ниже -
 * где внутри этого хода кончается разборка и начинается сборка
 */
const PIN = 1.5
const PIN_OPEN = 0.28
const PIN_SHUT = 0.86
/**
 * на телефоне строки идут по одной, и ход отдан им: разборка и сборка - короткие концы,
 * а каждой строке достаётся почти полэкрана, чтобы её успели прочесть
 */
const PHONE_OPEN = 0.12
const PHONE_SHUT = 0.92

/** на какой доле шага одна строка сцены сменяет другую - и цвет флаконов вместе с ней */
export const SWAP = 0.12

export type Box = { x: number; y: number; w: number; h: number; held?: boolean }

export type ActorPose = {
  reveal: number
  dx: number
  dz: number
  size: number
  lift: number
  yaw: number
  tint: TintRecipe
  label: string
  explode: number
  /** 0 - пескоструй дома, 1 - полированное стекло лаборатории */
  clarity: number
  level: number
  strata: number
  lit: number[]
  dim: number
  bands: number[]
}

export type SunPose = { az: number; el: number; color: Oklch; intensity: number; env: number }

export type ShotPose = {
  name: string
  /** номера флаконов из POOL, по порядку actors */
  cast: number[]
  actors: ActorPose[]
  place: Placement
  shadow: number
  backdrop: [number, number, number]
  /** граница тени на меридиане; нет её - тень лежит как легла */
  fence?: { x: number; side: number }
  /** флакон в пути через меридиан: граница прыгала бы со стороны на сторону */
  loose?: boolean
  /**
   * место прилипло к окну и не едет со страницей. холст на это время держится за окно, а
   * не за страницу - иначе на телефоне браузер уносил бы его прокруткой раньше, чем придёт
   * кадр, и флакон дёргался бы на месте
   */
  held?: boolean
}

export type Hands = {
  /** строка указателя под курсором, -1 - ни одной */
  row: number
  /** колонка объёма под курсором в таблице цен: 0 - 9 мл, 1 - 60, 2 - 100 */
  size: number
  /** курсор или палец в окне, css-пиксели; null - его нет */
  x: number | null
  y: number | null
  /** крышку сажают на место после письма: 0 - на месте, 1 - поднята */
  press: number
}

export type Director = {
  /**
   * пересчитать всё, что зависит от вёрстки. зовётся на ресайзе и после шрифтов. true -
   * сменилась длина стоянки стола, и страница под ней стала другой высоты
   */
  measure(): boolean
  /** все планы, которые сейчас в кадре, и солнце */
  frame(scroll: number): { shots: ShotPose[]; sun: SunPose }
  /** первый кадр во время заставки: флакон чертится в её середине */
  intro(reveal: number): ShotPose | null
  /** формула, которую выбрали на плите: после полудня флаконы идут с ней */
  wear(index: number): void
  /** строка указателя, которую сейчас держит рука - через текст или через флакон */
  lit(): number
  /** строка формулы, чей слой сейчас льётся на столе; -1 - ни одной */
  pouring(): number
  /**
   * где идут сцены телефона: стол и цены. число - какая строка сейчас на экране, дробное на
   * смене; NaN - сцены нет, строки стоят списком
   */
  stages(): { method: number; prices: number }
  hands: Hands
}

const title = (f: Formula): string => `${f.name} ${f.clock}`

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(t: number): number {
  return Math.max(0, Math.min(1, t))
}

/** кривая с нулевой скоростью на обоих концах: движение трогается и встаёт мягче */
function ease(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function rest(formula: number): ActorPose {
  const f = FORMULAS[formula] ?? FORMULAS[0]
  return {
    reveal: 1,
    dx: 0,
    dz: 0,
    size: 1,
    lift: 0,
    yaw: REST_YAW,
    tint: f.tint,
    label: title(f),
    explode: 0,
    clarity: 0,
    level: 1,
    strata: 0,
    lit: LAYERS.map(() => 0),
    dim: 0,
    bands: LAYERS.map(() => 0),
  }
}

/** ширина силуэта в высотах флакона при этом повороте: фасад и боковая грань вместе */
function silhouette(yaw: number): number {
  return 2 * (HALF_W * Math.abs(Math.cos(yaw)) + HALF_D * Math.abs(Math.sin(yaw)))
}

/**
 * сколько флакон занимает на экране над основанием и под ним, в высотах флакона. на
 * наклонённой площадке дальний край крышки встаёт выше макушки, а ближний край дна уходит
 * ниже основания - поэтому поля считались неравными: у кожи сверху выходило на треть
 * больше, чем снизу. dz - сдвиг вглубь строя, он поднимает флакон на экране
 */
function span(a: ActorPose, pitch: number, hold = 0): { up: number; down: number } {
  const s = Math.sin(pitch)
  const deep = HALF_W * Math.abs(Math.sin(a.yaw)) + HALF_D * Math.abs(Math.cos(a.yaw))
  const tall = Math.max(hold, a.size * (1 + a.explode * (EXPLODED_HEIGHT - 1)))
  return {
    // крышка уже корпуса: её дальний край - семь десятых глубины
    up: tall * Math.cos(pitch) + a.size * s * deep * 0.7 - a.dz * s,
    down: a.size * s * deep + a.dz * s,
  }
}

/**
 * вписать флаконы в коробку места: крупность - чтобы поместились и по высоте, и по ширине,
 * а сам флакон ровно посередине, по тому, что видно на экране, а не по основанию. центр по
 * горизонтали можно задать отдельно - в левой колонке флакон стоит посередине между краем
 * окна и меридианом
 */
function fit(
  box: Box,
  actors: ActorPose[],
  share: number,
  pitch: number,
  options: { centre?: number; hold?: number; across?: number } = {},
): Placement {
  let left = Infinity
  let right = -Infinity
  let up = 0
  let down = 0
  for (const a of actors) {
    const half = (silhouette(a.yaw) / 2) * a.size
    left = Math.min(left, a.dx - half)
    right = Math.max(right, a.dx + half)
    // подъём в руке в габарит не входит: иначе камера отъезжала бы на каждое наведение
    const reach = span(a, pitch, options.hold)
    up = Math.max(up, reach.up)
    down = Math.max(down, reach.down)
  }
  // across - сколько пикселей строю можно занять в ширину, если не доля коробки
  const room = options.across ?? box.w * 0.84
  const k = Math.max(1, Math.min((box.h * share) / (up + down), room / (right - left)))
  const centre = options.centre ?? box.x + box.w / 2
  return {
    x: centre - ((left + right) / 2) * k,
    base: box.y + box.h / 2 + ((up - down) * k) / 2,
    k,
    pitch,
  }
}

export function mixPlace(a: Placement, b: Placement, t: number): Placement {
  if (t <= 0) return a
  if (t >= 1) return b
  return {
    x: lerp(a.x, b.x, t),
    base: lerp(a.base, b.base, t),
    // масштаб смешивается в логарифме: иначе переезд из крупного плана в общий
    // проходит почти весь путь крупным и схлопывается в самом конце
    k: Math.exp(lerp(Math.log(a.k), Math.log(b.k), t)),
    pitch: lerp(a.pitch, b.pitch, t),
  }
}

export function createDirector(view: () => { w: number; h: number }): Director {
  const q = <T extends Element>(s: string): T | null => document.querySelector<T>(s)
  const coarse = isCoarsePointer()

  const sections = {
    hero: q<HTMLElement>('.hero'),
    index: q<HTMLElement>('.index'),
    head: q<HTMLElement>('.method__head'),
    bench: q<HTMLElement>('.method__bench'),
    skin: q<HTMLElement>('.skin'),
    provenance: q<HTMLElement>('.provenance'),
    acquisition: q<HTMLElement>('.acquisition'),
    finale: q<HTMLElement>('.colophon'),
    meridian: q<HTMLElement>('.meridian'),
  }

  const rows = Array.from(document.querySelectorAll<HTMLElement>('.formula__row'))
  const pcts = rows.map((row) => parseFloat(row.querySelector('.formula__pct')?.textContent ?? '0') / 100)
  const skinItems = Array.from(document.querySelectorAll<HTMLElement>('.skin__track li'))
  const indexRows = Array.from(document.querySelectorAll<HTMLElement>('.index tbody tr'))

  const hands: Hands = { row: -1, size: -1, x: null, y: null, press: 0 }
  let worn = 0
  let held = -1
  let pour = -1
  const stage = { method: Number.NaN, prices: Number.NaN }

  /** середины строк в координатах страницы - строки не липнут, и их можно мерить один раз */
  let rowMid: number[] = []
  let skinMid: number[] = []
  /** от какой прокрутки до какой в секции цен сменяются все пять формул */
  let priceFrom = 0
  let priceTo = 1
  let indexMid: number[] = []
  let stick = 0
  /**
   * ход, на котором стол стоит на месте, и высота, на которой он стоит. на телефоне хода
   * нет: там строки сами идут под полосой с флаконом
   */
  let pinFrom = 0
  let pinTo = 0
  let pinTop = 0
  let skinCentre = 0
  let indexTop = 0
  let lastRow = 0
  let skinMiddle = 0
  let wide = true
  let meridian = 0
  let backdrops: Record<string, [number, number, number]> = {}
  /** где солнце должно уже стоять как надо: по прокрутке, по возрастанию */
  let anchors: Array<{ at: number; sun: SunPose }> = []

  const pageTop = (el: Element | null): number => (el ? el.getBoundingClientRect().top + window.scrollY : 0)
  const pageBottom = (el: Element | null): number => (el ? el.getBoundingClientRect().bottom + window.scrollY : 0)
  const middles = (list: HTMLElement[]): number[] =>
    list.map((el) => {
      const r = el.getBoundingClientRect()
      return r.top + window.scrollY + r.height / 2
    })

  /**
   * коробка места прямо сейчас. места, которые липнут, меряются только так - их положение
   * на странице зависит от прокрутки. из нескольких мест с одним именем берётся видимое:
   * у указателя и у стола формулы на широком экране и на телефоне места разные
   */
  const boxOf = (name: string): Box | null => {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-slot="${name}"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      // липкое место стоит ровно на своём top, пока прилипло; до и после оно едет
      const top = stickyTop.get(el) ?? Number.NaN
      return { x: r.left, y: r.top, w: r.width, h: r.height, held: Math.abs(r.top - top) < 0.5 }
    }
    return null
  }

  /** top у липких мест в пикселях; снимается в measure - css на ходу не меняется */
  const stickyTop = new Map<HTMLElement, number>()

  /**
   * цвет фона берётся через холст, а не разбором строки. браузер отдаёт вычисленный цвет в
   * том синтаксисе, в каком он задан, а токены тут в oklch: разбор как rgb читал светлоту,
   * хрому и угол как три канала, и стекло преломляло ярко-синюю стену, которой нет
   */
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const colour = (el: Element | null): [number, number, number] => {
    let node: Element | null = el
    while (node && probe) {
      const c = getComputedStyle(node).backgroundColor
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = c
      probe.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
      if (a > 128) return [r / 255, g / 255, b / 255]
      node = node.parentElement
    }
    return [0.89, 0.92, 0.94]
  }

  /** середина между краем окна и меридианом - там стоят флаконы левой колонки */
  const leftCentre = (): number | undefined => (wide ? meridian / 2 : undefined)

  /** экранная коробка флакона - по ней рука попадает во флакон, а не в его место */
  const reach = (place: Placement, a: ActorPose): Box => {
    const half = silhouette(a.yaw) * 0.5 * a.size * place.k
    const bottom = place.base + a.dz * Math.sin(place.pitch) * place.k
    const tall = a.size * place.k
    return { x: place.x + a.dx * place.k - half, y: bottom - tall, w: half * 2, h: tall }
  }

  const inside = (b: Box): boolean =>
    hands.x !== null &&
    hands.y !== null &&
    hands.x > b.x - b.w * 0.1 &&
    hands.x < b.x + b.w * 1.1 &&
    hands.y > b.y - b.h * 0.05 &&
    hands.y < b.y + b.h * 1.05

  const hero = (): ShotPose | null => {
    const box = boxOf('hero')
    if (!box) return null
    const a = rest(0)
    if (hands.x !== null && !coarse) {
      // флакон чуть отворачивается от курсора, как предмет, который толкнули за ближний край
      a.yaw = REST_YAW + (hands.x / view().w - 0.5) * 0.6
    }
    return {
      name: 'hero',
      cast: [SOLO],
      actors: [a],
      place: fit(box, [a], 0.84, 0.08, { centre: leftCentre() }),
      shadow: 0.3,
      backdrop: backdrops.hero,
    }
  }

  /**
   * пять формул строем. проявляются по очереди, каждая из своего чертежа. рука берёт
   * флакон и через строку таблицы, и через сам флакон, а на телефоне поднимается тот, чья
   * строка в середине экрана
   */
  const index = (scroll: number): ShotPose | null => {
    const box = boxOf('index')
    if (!box) return null
    /**
     * строй проявляется прокруткой, а не по сигналу: чем дальше секция вошла в окно, тем
     * больше флаконов начерчено. к моменту, когда она закрыла весь экран, стоят все пять,
     * и назад прокрутка стирает их в обратном порядке
     */
    const { h } = view()
    const came = (scroll - (indexTop - h)) / h
    const actors = RANK.map((_, i) => ({
      ...rest(i),
      dx: i * RANK_X,
      dz: i * RANK_Z,
      reveal: smooth(0.12 + i * 0.13, 0.4 + i * 0.13, came),
    }))
    const place = fit(box, actors, 0.92, 0.2)

    let row = hands.row
    if (row < 0) {
      // из пересекающихся коробок выигрывает ближний флакон - первый в строю
      row = actors.findIndex((a) => a.reveal > 0.9 && inside(reach(place, a)))
    }
    if (row < 0 && coarse) {
      let best = h * 0.2
      indexMid.forEach((m, i) => {
        const d = Math.abs(m - scroll - h * 0.62)
        if (d < best) {
          best = d
          row = i
        }
      })
    }
    held = row
    actors.forEach((a, i) => (a.lift = i === row ? HAND_LIFT : 0))
    return {
      name: 'index',
      cast: RANK,
      actors,
      place,
      shadow: 0.45,
      backdrop: backdrops.index,
      held: box.held,
    }
  }

  /** поворот и наклон флакона у кожи - по ним считаются и поля, и высота места */
  const SKIN_YAW = -0.25
  const SKIN_PITCH = 0.1
  const skinFrame = (): { k: number; margin: number; up: number; down: number } => {
    const margin = meridian * 0.2
    const k = (meridian - margin * 2) / silhouette(SKIN_YAW)
    const { up, down } = span({ ...rest(0), yaw: SKIN_YAW }, SKIN_PITCH)
    return { k, margin, up, down }
  }

  /**
   * флакон у раздела "on skin" на широком экране: одинаковые поля со всех четырёх сторон -
   * до края окна, до меридиана, сверху и снизу. высоту места под это выставляет measure
   */
  const skinPlace = (box: Box, a: ActorPose): Placement => {
    if (!wide) return fit(box, [a], 0.84, 0.1)
    const { k, margin, up } = skinFrame()
    return { x: meridian / 2, base: box.y + margin + up * k, k, pitch: SKIN_PITCH }
  }

  /**
   * стол формулы и раздел "on skin" - один и тот же флакон. на широком экране стол встаёт
   * на место целиком, и строки, и флакон: пока он стоит, флакон разбирают, наливают слой за
   * слоем и собирают. на телефоне строки идут под полосой с флаконом, и каждая, уходя
   * вверх, наливает свой слой. потом флакон переносят к коже - уже крупным планом
   */
  const method = (scroll: number): Array<ShotPose | null> => {
    const bench = boxOf('method')
    const skinBox = boxOf('skin')
    if (!bench && !skinBox) return []
    const { h } = view()
    const pinned = pinTo > pinFrom

    let open: number
    let shut: number
    let bands: number[]
    let leave: number
    let arrive: number
    if (pinned) {
      const run = pinTo - pinFrom
      const [from, to] = wide ? [PIN_OPEN, PIN_SHUT] : [PHONE_OPEN, PHONE_SHUT]
      // разбирать начинают, когда стол уже целиком в окне, и заканчивают на неподвижном
      open = ease(smooth(pinFrom - 0.12 * h, pinFrom + from * run, scroll))
      /**
       * слои льются по очереди, поровну на ход между разборкой и сборкой. у каждого
       * короткая пауза на концах: слой лёг, и только тогда пошёл следующий - как из пипетки,
       * а не одной струёй
       */
      const step = clamp((scroll - pinFrom - from * run) / ((to - from) * run)) * LAYERS.length
      bands = LAYERS.map((_, i) => (pcts[i] ?? 0) * smooth(0.12, 0.88, step - i))
      // на телефоне на экране одна строка - та, чей слой сейчас льётся
      if (!wide) stage.method = Math.max(0.5, Math.min(LAYERS.length - 0.5, step))
      shut = smooth(pinFrom + (to + 0.02) * run, pinTo, scroll)
      leave = pinTo
      arrive = Math.max(pinTo + 0.4 * h, skinCentre - 0.5 * h)
    } else {
      // окно ниже строк стола: стол не встаёт, строки идут мимо флакона и наливают слои сами
      open = ease(smooth(stick, stick + 0.85 * h, scroll))
      const [from, to] = [0.66, 0.42]
      bands = LAYERS.map((_, i) => (pcts[i] ?? 0) * smooth(h * from, h * to, (rowMid[i] ?? 0) - scroll))
      // строка стоит на позиции p, когда прокрутка равна lastRow - p * h
      shut = smooth(lastRow - (to - 0.02) * h, lastRow - (to - 0.14) * h, scroll)
      leave = lastRow - (to - 0.14) * h
      arrive = Math.max(leave + 0.3 * h, skinCentre - 0.5 * h)
    }
    const filled = bands.reduce((sum, v) => sum + v, 0)
    pour =
      open >= 1 && shut <= 0
        ? bands.findIndex((b, i) => b > 0.02 * (pcts[i] ?? 0) && b < 0.98 * (pcts[i] ?? 0))
        : -1

    const lab = rest(0)
    lab.tint = mixRecipe(HOUSE_TINT, BENCH_GLASS, open)
    lab.clarity = open
    lab.yaw = -0.18
    lab.explode = open * (1 - shut)
    // пока флакон целый, в нём формула как продаётся; разобранный он пуст и наливается
    lab.level = lerp(1, filled, open)
    lab.strata = open
    lab.bands = bands

    /**
     * место на столе держится и после того, как стол отпустило: флакон остаётся там, где
     * стоял, пока страница уходит из-под него, и оттуда его переносят. без этого он уезжал
     * со столом за верх окна и возвращался в кадр уже с другой стороны, ломаной
     */
    const benchBox = bench && wide ? { ...bench, y: Math.max(bench.y, pinned ? pinTop : 0) } : bench
    const atBench = benchBox ? fit(benchBox, [lab], 0.9, 0.1, { hold: EXPLODED_HEIGHT }) : null
    const toSkin = ease(smooth(leave, arrive, scroll))
    // флакон держится за окно и тогда, когда стол уже поехал, а его место на столе ещё нет
    const held = Boolean(bench?.held || (benchBox && benchBox.y !== bench?.y))
    const onBench: ShotPose | null = atBench
      ? { name: 'method', cast: [BENCH], actors: [lab], place: atBench, shadow: 0.26, backdrop: backdrops.method, held }
      : null
    // на телефоне у кожи свой флакон: см. ниже, почему его не несут
    if ((wide && toSkin <= 0) || !skinBox) return [onBench]

    // на коже: слои те же, но светятся только те, что сейчас звучат
    const held2: ActorPose = {
      ...lab,
      explode: 0,
      level: 1,
      clarity: 1,
      tint: BENCH_GLASS,
      strata: 1,
      bands: [...pcts],
      yaw: SKIN_YAW,
    }
    held2.lit = LAYERS.map(() => 0)
    skinMid.forEach((m, i) => {
      // строка звучит, пока она около середины экрана, и гаснет плавно
      const near = 1 - smooth(h * 0.06, h * 0.3, Math.abs(m - scroll - h * 0.5))
      held2.dim = Math.max(held2.dim, near)
      for (const j of SKIN[i] ?? []) held2.lit[j] = Math.max(held2.lit[j], near)
    })

    const atSkin = skinPlace(skinBox, held2)
    const r = reach(atSkin, held2)
    if (inside(r) && hands.x !== null) {
      // в руках: приподнимается и отворачивается от курсора, как флакон на плите
      held2.lift = HAND_LIFT
      held2.yaw += Math.max(-1, Math.min(1, (hands.x - (r.x + r.w / 2)) / (r.w / 2))) * -0.42
    }

    /**
     * на телефоне стол и кожа стоят в одной колонке, одна под другой, и перенос вёл флакон
     * сверху вниз сквозь строки, которые в это время ехали вверх. там флакон уезжает со
     * столом, а у кожи его ждёт собранный - из тех, что не бывают в кадре в это время
     */
    if (!wide) {
      return [
        onBench,
        { name: 'skin', cast: [SOLO], actors: [held2], place: atSkin, shadow: 0.26, backdrop: backdrops.method },
      ]
    }

    const t = atBench ? toSkin : 1
    /**
     * перенос рукой, а не по линейке: флакон приподнимают, по дороге он доворачивается
     * боковой гранью и опускается на место. прямая с одновременным ростом читалась
     * слайдом из презентации
     */
    const carry = Math.sin(Math.PI * t)
    const a: ActorPose = {
      ...held2,
      tint: mixRecipe(lab.tint, held2.tint, t),
      explode: lerp(lab.explode, 0, t),
      level: lerp(lab.level, 1, t),
      clarity: lerp(lab.clarity, 1, t),
      bands: lab.bands.map((v, i) => lerp(v, pcts[i] ?? 0, t)),
      yaw: lerp(lab.yaw, held2.yaw, t) - 0.55 * carry,
      lift: held2.lift * t,
      dim: held2.dim * t,
    }
    /**
     * несут туда, где место у кожи окажется к концу переноса, а не туда, где оно сейчас.
     * сейчас оно ещё под краем окна, и флакон нырял к низу экрана и выныривал обратно. к
     * концу переноса обе точки совпадают, и дальше флакон едет уже вместе со страницей
     */
    const landing = skinPlace({ ...skinBox, y: skinBox.y - Math.max(0, arrive - scroll) }, held2)
    const place = atBench ? mixPlace(atBench, landing, t) : atSkin
    if (atBench) place.base -= carry * 0.06 * h
    return [
      {
        name: 'method',
        cast: [BENCH],
        actors: [a],
        place,
        shadow: 0.26,
        backdrop: backdrops.method,
        loose: t > 0 && t < 1,
      },
    ]
  }

  const provenance = (): ShotPose | null => {
    const box = boxOf('provenance')
    if (!box) return null
    const a = { ...rest(worn), yaw: -0.45 }
    return {
      name: 'provenance',
      cast: [SOLO],
      actors: [a],
      place: fit(box, [a], 0.82, 0.07, { centre: leftCentre() }),
      shadow: 0.22,
      backdrop: backdrops.provenance,
      held: box.held,
    }
  }

  /**
   * три объёма в ряд. формулы сменяются ровно по всей секции: от её прихода до ухода
   * проходят все пять, по равной доле прокрутки на каждую. раньше смена шла только по
   * строкам таблицы, и весь цвет успевал прокрутиться в одной узкой полосе
   */
  const acquisition = (scroll: number): ShotPose | null => {
    const box = boxOf('acquisition')
    if (!box) return null
    const last = FORMULAS.length - 1
    /**
     * доля прокрутки делится поровну между формулами - без сглаживания на концах:
     * плавная кривая почти стоит у краёв, и все пять успевали смениться в середине
     */
    const gone = Math.max(0, Math.min(1, (scroll - priceFrom) / Math.max(1, priceTo - priceFrom)))
    let i: number
    let t: number
    if (wide) {
      const step = gone * last
      i = Math.min(last - 1, Math.floor(step))
      t = smooth(0, 1, step - i)
    } else {
      /**
       * на телефоне под флаконами одна формула за раз, и цвет меняется ровно тогда, когда
       * сменяется строка, а между сменами стоит: флаконы и цена под ними всегда об одном
       */
      const pos = gone * FORMULAS.length
      stage.prices = Math.max(0.5, Math.min(FORMULAS.length - 0.5, pos))
      const b = Math.max(1, Math.min(last, Math.round(pos)))
      i = b - 1
      t = smooth(-SWAP, SWAP, pos - b)
    }
    const recipe = mixRecipe(FORMULAS[i].tint, FORMULAS[i + 1].tint, t)
    const label = title(FORMULAS[t < 0.5 ? i : i + 1])
    let x = 0
    const actors = SIZES.map((size, i) => {
      if (i > 0) x += 0.3 * SIZES[i - 1] + 0.05 + 0.3 * size
      return { ...rest(0), dx: x, size, tint: recipe, label }
    })
    // колонки цен идут от малого объёма к большому, а флаконы - от большого к малому
    if (hands.size >= 0) actors[2 - hands.size].lift = HAND_LIFT
    actors[0].explode = hands.press * 0.14
    return {
      name: 'acquisition',
      cast: [RANK[0], RANK[1], RANK[2]],
      actors,
      /**
       * строй занимает всю левую колонку, с тем же полем от меридиана, что от края окна.
       * в коробке места он стоял мелко: по двести пикселей пустоты сверху и снизу
       */
      place: fit(box, actors, 0.8, 0.12, {
        centre: leftCentre(),
        across: wide ? meridian - 2 * box.x : undefined,
      }),
      shadow: 0.28,
      backdrop: backdrops.acquisition,
      held: box.held,
    }
  }

  /**
   * закат. флакон стоит посередине между линией подвала и низом страницы - одинаково от
   * крышки до линии и от дна до края окна, когда страница докручена до конца
   */
  const finale = (): ShotPose | null => {
    const a = { ...rest(worn), yaw: -0.5 }
    const box = boxOf('finale')
    if (wide && sections.finale) {
      const r = sections.finale.getBoundingClientRect()
      const pitch = 0.16
      const { up, down } = span(a, pitch)
      const k = (r.height * 0.72) / (up + down)
      // по горизонтали - посередине правой колонки, от меридиана до края текста
      const edge = box ? box.x + box.w : r.right
      const place: Placement = {
        x: (meridian + edge) / 2,
        base: r.top + r.height / 2 + ((up - down) * k) / 2,
        k,
        pitch,
      }
      return { name: 'finale', cast: [BENCH], actors: [a], place, shadow: 0.24, backdrop: backdrops.finale }
    }
    if (!box) return null
    return {
      name: 'finale',
      cast: [BENCH],
      actors: [a],
      place: fit(box, [a], 0.8, 0.16),
      shadow: 0.24,
      backdrop: backdrops.finale,
    }
  }

  const sunOf = (az: number, el: number, colour: Oklch, intensity: number, env: number): SunPose => ({
    az,
    el,
    color: colour,
    intensity,
    env,
  })

  /**
   * солнце к каждой секции. всё спереди: свет обязан падать на фасад, где надпись, иначе
   * флакон стоит к зрителю тенью. на закате оно уходит вправо и низко, и тень ложится назад
   */
  const SUNS = {
    hero: sunOf(-0.9, 0.85, LIGHT.noon, 2.2, 0.55),
    index: sunOf(-0.45, 0.62, LIGHT.moon, 2.4, 0.45),
    method: sunOf(-0.6, 0.95, LIGHT.noon, 2, 0.62),
    skin: sunOf(-0.35, 0.8, LIGHT.noon, 2.1, 0.6),
    provenance: sunOf(-1.25, 0.62, LIGHT.shutter, 2.4, 0.42),
    acquisition: sunOf(-0.7, 0.8, LIGHT.noon, 2, 0.6),
    finale: sunOf(0.55, 0.3, LIGHT.dusk, 2.8, 0.3),
  }

  /**
   * солнце между секциями поворачивается, а не переключается. держится оно на месте вокруг
   * своей точки и переходит в средней части пути: к приходу секции свет уже встал
   */
  const sunAt = (scroll: number): SunPose => {
    if (!anchors.length) return SUNS.hero
    if (scroll <= anchors[0].at) return anchors[0].sun
    for (let i = 1; i < anchors.length; i += 1) {
      const a = anchors[i - 1]
      const b = anchors[i]
      if (scroll > b.at) continue
      const t = smooth(0.2, 0.8, (scroll - a.at) / Math.max(1, b.at - a.at))
      return {
        az: lerp(a.sun.az, b.sun.az, t),
        el: lerp(a.sun.el, b.sun.el, t),
        color: mixOklch(a.sun.color, b.sun.color, t),
        intensity: lerp(a.sun.intensity, b.sun.intensity, t),
        env: lerp(a.sun.env, b.sun.env, t),
      }
    }
    return anchors[anchors.length - 1].sun
  }

  const measure = (): boolean => {
    const before = pinTo - pinFrom
    const { h, w } = view()
    wide = w > 900
    meridian = sections.meridian?.getBoundingClientRect().left ?? w * 0.382
    const max = Math.max(0, document.documentElement.scrollHeight - h)

    /**
     * у места "on skin" высота считается, а не задаётся в css: поля вокруг флакона обязаны
     * быть равны со всех сторон, а ширина колонки зависит от окна. пишем её до замеров
     * строк, иначе они сняли бы страницу без неё
     */
    const skinSlot = document.querySelector<HTMLElement>('[data-slot="skin"]')
    if (skinSlot) {
      if (wide) {
        const { k, margin, up, down } = skinFrame()
        skinSlot.style.height = `${Math.round((up + down) * k + margin * 2)}px`
      } else skinSlot.style.removeProperty('height')
    }

    /**
     * стол встаёт посередине окна, если строки туда помещаются. на низком окне хода нет:
     * прилипший стол выше окна прятал бы нижние строки ровно тогда, когда в них льётся
     */
    const formula = sections.bench?.querySelector<HTMLElement>('.formula')
    if (sections.bench && formula && wide) {
      const tall = formula.offsetHeight
      pinTop = Math.round((h - tall) / 2)
      const room = pinTop >= 16
      sections.bench.style.setProperty('--rows-h', `${tall}px`)
      sections.bench.style.setProperty('--pin-top', `${room ? pinTop : 0}px`)
      sections.bench.style.setProperty('--pin', `${room ? Math.round(PIN * h) : 0}px`)
      pinFrom = pageTop(sections.bench) - pinTop
      pinTo = room ? pinFrom + Math.round(PIN * h) : pinFrom
    } else if (sections.bench && formula) {
      /**
       * на телефоне длину хода задаёт css в svh, а не скрипт по высоте окна: окно там
       * меняется, стоит панели браузера спрятаться, и страница росла бы прямо под пальцем.
       * строки стоят, пока их лист прилип к верху, - от этого и считается ход
       */
      for (const v of ['--rows-h', '--pin-top', '--pin']) sections.bench.style.removeProperty(v)
      pinTop = 0
      pinFrom = pageTop(sections.bench)
      pinTo = pinFrom + Math.max(0, sections.bench.offsetHeight - formula.offsetHeight)
    }

    stickyTop.clear()
    for (const el of document.querySelectorAll<HTMLElement>('[data-slot]')) {
      const style = getComputedStyle(el)
      if (style.position === 'sticky') stickyTop.set(el, parseFloat(style.top) || 0)
    }

    rowMid = middles(rows)
    skinMid = middles(skinItems)
    const prices = sections.acquisition?.querySelector<HTMLElement>('.acquisition__bench')
    const ledger = prices?.querySelector<HTMLElement>('.ledger--prices')
    if (!wide && prices && ledger) {
      // формулы сменяются, пока лист цен прилип к верху, - ровно на этот ход
      priceFrom = pageTop(prices)
      priceTo = priceFrom + Math.max(1, prices.offsetHeight - ledger.offsetHeight)
    } else {
      priceFrom = pageTop(sections.acquisition) - 0.8 * h
      priceTo = pageBottom(sections.acquisition) - 0.55 * h
    }
    indexMid = middles(indexRows)
    lastRow = rowMid[rowMid.length - 1] ?? pageTop(sections.skin)
    skinMiddle = middles(sections.skin ? [sections.skin] : [])[0] ?? lastRow + h
    skinCentre = skinSlot ? middles([skinSlot])[0] : skinMiddle

    /**
     * с какой прокрутки флакон на столе начинает разбираться. он приходит целым вместе с
     * секцией и расходится на детали с первыми движениями колеса, пока стол ещё поднимается
     * к своему месту
     */
    stick = pageTop(sections.bench) - (wide ? 0.78 : 0.3) * h
    indexTop = pageTop(sections.index)

    backdrops = {
      hero: colour(sections.hero),
      index: colour(sections.index),
      method: colour(sections.bench),
      provenance: colour(sections.provenance),
      acquisition: colour(sections.acquisition),
      finale: colour(sections.finale),
    }

    anchors = [
      { at: 0, sun: SUNS.hero },
      { at: pageTop(sections.index) - 0.2 * h, sun: SUNS.index },
      { at: pinTo > pinFrom ? pinFrom : stick, sun: SUNS.method },
      { at: pinTo > pinFrom ? pinTo : lastRow, sun: SUNS.skin },
      { at: pageTop(sections.provenance) - 0.1 * h, sun: SUNS.provenance },
      { at: pageTop(sections.acquisition) - 0.1 * h, sun: SUNS.acquisition },
      { at: Math.min(max, pageTop(sections.finale) - 0.3 * h), sun: SUNS.finale },
    ]
    for (let i = 1; i < anchors.length; i += 1) {
      anchors[i].at = Math.max(anchors[i].at, anchors[i - 1].at + 1)
    }
    return pinTo - pinFrom !== before
  }

  measure()

  /**
   * план в кадре, если в окно попадает хоть что-то от флаконов: запас вверх на крышку
   * разобранного флакона, вниз на тень, вбок на строй
   */
  const seen = (shot: ShotPose): boolean => {
    const { w, h } = view()
    const k = shot.place.k
    const top = shot.place.base - k * EXPLODED_HEIGHT * 1.1
    const bottom = shot.place.base + k * 0.5
    const spread = k * 4
    return bottom > 0 && top < h && shot.place.x + spread > 0 && shot.place.x - spread < w
  }

  return {
    measure,
    hands,

    frame(scroll) {
      stage.method = Number.NaN
      stage.prices = Number.NaN
      const shots = [
        hero(),
        index(scroll),
        ...method(scroll),
        provenance(),
        acquisition(scroll),
        finale(),
      ].filter((s): s is ShotPose => s !== null && seen(s))
      // каждая тень остаётся в своей колонке. на телефоне колонка одна, и делить нечего
      if (wide) {
        for (const s of shots) {
          if (!s.loose) s.fence = { x: meridian, side: s.place.x < meridian ? 1 : -1 }
        }
      }
      return { shots, sun: sunAt(scroll) }
    },

    intro(reveal) {
      // заставка пустая: флакон чертится ровно посередине окна, на месте ушедшего текста
      const { w, h } = view()
      const box = { x: w / 2 - h * 0.2, y: h * 0.26, w: h * 0.4, h: h * 0.48 }
      const a = { ...rest(0), reveal }
      return {
        name: 'hero',
        cast: [SOLO],
        actors: [a],
        place: fit(box, [a], 0.9, 0.06),
        shadow: 0.22 * smooth(0.6, 1, reveal),
        backdrop: backdrops.hero,
      }
    },

    wear(i) {
      worn = Math.max(0, Math.min(FORMULAS.length - 1, i))
    },

    lit() {
      return held
    },

    pouring() {
      return pour
    },

    stages() {
      return { ...stage }
    },
  }
}
