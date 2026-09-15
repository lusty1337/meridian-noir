import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  Vector4,
  VSMShadowMap,
  WebGLRenderer,
} from 'three'

import { isCoarsePointer } from '../lib/motion'
import { buildFlaconAssembly } from '../model/assembly'
import { buildStudio, type Studio } from '../model/studio'
import type { FlaconTint, TintRecipe } from '../model/tint'

/**
 * флакон из стенда, поставленный в сцену полудня. двумерный холст по-прежнему рисует небо,
 * плиту, циферблат и дугу солнца - вся солнечная математика осталась там, где была. отсюда
 * приходит сам предмет и его тень, и обе обязаны лечь ровно в ту же геометрию, что
 * нарисована рядом.
 *
 * камера ортографическая, и это не экономия, а условие задачи. плита нарисована
 * аксонометрией: тень уходит от базы по прямой, длина умножается на постоянное
 * сжатие, дальний край не сходится в точку. перспективная камера даёт схождение,
 * и трёхмерная тень разошлась бы с лучами циферблата тем сильнее, чем длиннее - у
 * восхода вдвое. ортографическая проекция линейна ровно так же, как рисунок.
 *
 * холстов два, и оба лежат внутри сцены, а не поверх окна. тень - на весь кадр и
 * в плотность экрана: она мягкая, и лишние пиксели ей ни к чему. флакон - в
 * маленьком холсте по коробке предмета и вдвое гуще экрана: только там есть
 * кромки, надпись и просвет, которым плотность нужна. раньше это был один холст на
 * всё окно, и за резкость стекла платила каждая точка неба.
 *
 * а лежат они в сцене ради того, чтобы их двигал браузер. холст поверх окна
 * перерисовывался под прокрутку из скрипта и отставал от неё на кадр, а на телефоне
 * и на два: плита уезжала, флакон догонял. внутри приколотой секции оба холста
 * едут вместе с плитой сами, и скрипт трогает только полёт
 */

/** камера стоит далеко и смотрит на базу флакона - число нужно только для глубины */
const CAMERA_DISTANCE = 12

/** ширина полутени в высотах флакона */
const SHADOW_BLUR = 0.017

/** посадка флакона в кадре: доворот от фасада, чтобы читалась боковая грань */
const REST_YAW = -0.32

/**
 * появление. флакон выходит из-за верхней кромки окна, чуть правее середины, и идёт вниз
 * навстречу плите, которая в это время поднимается снизу. начало пути задано в окне, конец
 * - в базе гномона на плите, и путь между ними считается в пикселях сцены.
 *
 * FLIGHT_TOP отрицательный намеренно: это положение основания флакона, и на нуле
 * он стоял бы на кромке, а не выходил из-за неё
 */
const FLIGHT_TOP = -0.07
const FLIGHT_SIDE = 0.07
const FLIGHT_SCALE = 0.42

/** на сколько ключевых кадров режется путь полёта для CSS: между ними отрезки прямые */
const FLIGHT_STEPS = 48

/** наклон от зрителя и вправо, радианы. снимается к посадке */
const LEAN_BACK = 0.19
const LEAN_RIGHT = 0.12

/**
 * флакон в руках. стоит на плите - предмет в сцене. навели курсор - предмет в руках:
 * приподнялся, повис и слушается. подъём мал намеренно, четверть высоты флакона: больше - и
 * он отрывается от собственной тени, а тень тут настоящая и врать не умеет
 */
const LIFT = 0.26
/** максимальный доворот и наклон за курсором, радианы */
const SWING = 0.42
const NOD = 0.16
/** сколько радиан даёт палец на пиксель свайпа */
const DRAG = 0.006

/**
 * жёсткости пружин: подъём, доворот, палец. все три критически задемпфированы, и в этом всё
 * дело. цели им ставит курсор, а значение они догоняют сами, поэтому уход курсора, приход
 * прокрутки и переключение формулы могут случиться на одном кадре и ни один не даст скачка:
 * сцена в этот момент не переключает анимацию, а просто меняет цель
 */
const SPRING_LIFT = 46
const SPRING_TURN = 34
const SPRING_DRAG = 22

/** амплитуды парения в поднятом состоянии - мировые единицы и радианы */
const DRIFT_X = 0.014
const DRIFT_Y = 0.011
const DRIFT_Z = 0.01
const DRIFT_ROLL = 0.014

/**
 * коробка холста флакона в высотах флакона: вниз от базы, вверх от неё и в стороны. холст
 * не меняет размер ни на полёте, ни в руках - иначе на каждое движение перевыделялся бы
 * буфер. поэтому коробка берётся с запасом на всё сразу: подъём, парение, наклон за
 * курсором и диагональ повёрнутого корпуса
 */
const BOX_BELOW = 0.22
const BOX_ABOVE = 1.52
const BOX_HALF = 0.56

/**
 * подложка для просвета. transmission в three читает буфер, отрисованный без прозрачных
 * мешей. на своём холсте за флаконом нет ничего, и стекло выходит глухим телом - это уже
 * было на стенде. подложка вырезает из двумерного холста ровно тот кусок, что лежит под
 * коробкой флакона, и стекло преломляет настоящую плиту с настоящим циферблатом. двухсот
 * пятидесяти пикселей хватает: за стеклом гладкий градиент, а фрост его ещё и размывает
 */
const BACKDROP_PX = 256

export type StageLayout = {
  w: number
  h: number
  /** высота окна: от неё отсчитывается начало появления */
  fold: number
  /**
   * где верх сцены относительно окна, в пикселях. на полёте положительный - плита
   * ещё ниже сгиба; на пине ноль; после пина уходит в минус
   */
  offsetY: number
  /** линия горизонта: выше неё плиты нет, ни нарисованной, ни настоящей */
  horizonY: number
  baseX: number
  baseY: number
  gnomonH: number
  /** синус наклона площадки - он же сжатие эллипса циферблата */
  tilt: number
}

export type FlaconStage = {
  /**
   * цвет флакона: стекло, трубка помпы и настой смотрят на одни и те же четыре
   * объекта Color. перекрасить формулу - записать в них другие числа
   */
  tint: FlaconTint
  /** перебить формулу на этикетке */
  write(formula: string): void
  /**
   * доворот сверх рабочего ракурса, в оборотах. переключение формулы - это один
   * полный оборот, и на его дальней половине этикетка меняется незамеченной
   */
  setSwap(turns: number): void
  layout(l: StageLayout): void
  /** собрать программы заранее, до того как флакон впервые попадёт в кадр */
  warm(): Promise<void>
  /** направление на солнце: азимут от юга и высота, градусы */
  setSun(azimuth: number, altitude: number, tint: [number, number, number], strength: number): void
  /** цвет и плотность тени - те же, которыми двумерная сцена красит свою */
  setShade(tint: [number, number, number], opacity: number): void
  /**
   * кромка, к которой тень гаснет: по вертикали или по горизонтали, от from до to в
   * пикселях сцены. null - кромки нет
   */
  setVeil(axis: 'x' | 'y' | null, from: number, to: number): void
  /**
   * что стоит за стеклом: двумерный холст сцены и цвет бумаги для того, что выше
   * неё - пока флакон летит, над плитой ещё идёт предыдущая секция
   */
  setBackdrop(source: HTMLCanvasElement, paper: string): void
  /** ход появления, 0 - в воздухе над сценой, 1 - стоит на плите */
  setEntrance(t: number): void
  /**
   * можно ли сейчас трогать флакон. на полёте и за пределами секции нельзя: он
   * либо ещё летит по своему пути, либо его уже не видно
   */
  setReach(on: boolean): void
  /** курсор в пикселях сцены; null - курсор ушёл со страницы */
  point(x: number | null, y: number | null): void
  /** попадает ли точка сцены в флакон - по ней сцена решает, чей это жест */
  covers(x: number, y: number): boolean
  /** повернуть пальцем: горизонтальный сдвиг с прошлого события, в пикселях */
  drag(dx: number): void
  /** идёт ли собственное движение флакона - по нему сцена решает, нужен ли кадр */
  restless(): boolean
  render(dt: number): void
  dispose(): void
}

/** критически задемпфированная пружина: без колебаний и без остановки на полпути */
type Spring = { value: number; target: number; speed: number }

function spring(): Spring {
  return { value: 0, target: 0, speed: 0 }
}

function settle(s: Spring, dt: number, stiffness: number): void {
  const damping = 2 * Math.sqrt(stiffness)
  s.speed += (-stiffness * (s.value - s.target) - damping * s.speed) * dt
  s.value += s.speed * dt
}

function asleep(s: Spring): boolean {
  return Math.abs(s.value - s.target) < 1e-4 && Math.abs(s.speed) < 1e-4
}

export function createFlaconStage(
  canvases: { shade: HTMLCanvasElement; flacon: HTMLCanvasElement },
  start: { recipe: TintRecipe; formula: string },
): FlaconStage | null {
  let glass: WebGLRenderer
  let shade: WebGLRenderer
  try {
    glass = new WebGLRenderer({ canvas: canvases.flacon, antialias: true, alpha: true })
  } catch {
    // без WebGL сцена остаётся двумерной целиком - там нарисован свой флакон
    return null
  }
  try {
    // сглаживание тени не нужно: у неё нет кромок, только полутень
    shade = new WebGLRenderer({ canvas: canvases.shade, antialias: false, alpha: true })
  } catch {
    glass.dispose()
    return null
  }

  const coarse = isCoarsePointer()

  /**
   * флакон считаем гуще экрана, тень - по нему или реже. MSAA сглаживает только силуэт, а у
   * стекла половина кромок внутри: помпа, сопло, линия налива приходят из буфера просвета
   * обычной выборкой текстуры. двойная плотность даёт честный суперсэмплинг - браузер
   * ужимает холст до коробки и усредняет. на маленьком холсте это дёшево, на всё окно было
   * разорительно.
   *
   * на телефоне у флакона потолок двойной, а просвет считается в три четверти: там
   * экран и так втрое плотнее, а фрост матового стекла разницы не показывает
   */
  glass.setPixelRatio(coarse ? Math.min(devicePixelRatio, 2) : clamp(devicePixelRatio, 2, 2.5))
  glass.transmissionResolutionScale = coarse ? 0.75 : 1
  shade.setPixelRatio(coarse ? Math.min(devicePixelRatio, 1.25) : 1)

  for (const renderer of [glass, shade]) {
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.92
  }
  shade.shadowMap.enabled = true
  // тот же VSM, что на стенде: полутень стекла набрана выброшенными текселями,
  // и размывать её обязана сама карта, а не девять отсчётов PCF
  shade.shadowMap.type = VSMShadowMap

  const glassScene = new Scene()
  const glassCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 40)
  glassScene.add(glassCamera)
  const shadeScene = new Scene()
  const shadeCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 40)

  const flacon = buildFlaconAssembly({ recipe: start.recipe, formula: start.formula })
  /**
   * два вложенных узла, а не один. наклон живёт на внешнем, оборот - на внутреннем. если
   * сложить их в один, ось вращения наклонится вместе с флаконом и он поедет по конусу
   * вместо того, чтобы крутиться вокруг себя
   */
  const spinner = new Group()
  spinner.add(flacon.group)
  /**
   * наклон за курсором стоит НАД оборотом, а подъём над обоими. порядок не косметический.
   * подъём обязан идти вверх кадра, а не вверх флакона, иначе повёрнутый флакон всплывает
   * вбок. наклон обязан идти по осям кадра, а оборот - внутри него, по собственной оси
   * предмета: так это и держат в руках
   */
  const tilt = new Group()
  tilt.add(spinner)
  const drift = new Group()
  drift.add(tilt)
  const pivot = new Group()
  pivot.add(drift)
  glassScene.add(pivot)

  let studio: Studio | null = buildStudio(glass)
  glassScene.environment = studio.environment
  /**
   * комната из стенда остаётся ради отражений, но приглушена. это мастерская в Марселе:
   * окно слева, побелённая стена напротив. на полную силу она перебивает солнце, и флакон
   * весь день освещён одинаково, куда бы солнце ни ушло. на 0.5 в стекле остаются
   * отражения, а сторону света задаёт уже день
   */
  glassScene.environmentIntensity = 0.5

  // солнц два, по одному на холст, и оба смотрят одинаково: одно светит на стекло,
  // другое кладёт тень. переносить один источник между сценами three не умеет
  const light = new DirectionalLight(0xfff4e6, 1.5)
  const sky = new DirectionalLight(0xbfd4e4, 0.35)
  sky.position.set(0, 1, 0.4)
  glassScene.add(light, sky)

  const sun = new DirectionalLight(0xfff4e6, 1.5)
  sun.castShadow = true
  const shadowMap = coarse ? 1024 : 2048
  sun.shadow.mapSize.set(shadowMap, shadowMap)
  // у VSM карта хранит два момента, и обычный сдвиг только отрывает тень от предмета
  sun.shadow.bias = 0
  sun.shadow.normalBias = 0.004
  sun.shadow.blurSamples = coarse ? 8 : 16
  shadeScene.add(sun)

  /**
   * плита в трёхмерном виде - прямоугольник ровно по нарисованной плите. бесконечную
   * плоскость поставить нельзя: у ортографической камеры все лучи параллельны, наклонённая
   * плоскость встречает каждый из них и закрывает кадр целиком вместе с небом. первым
   * ограничением был круг по ободу циферблата, и он обрезал длинную тень поперёк - на
   * закате она обрывалась ровно по ободу, чего на рисунке нет: там тень режется только
   * рамкой плиты, от горизонта до нижней кромки. эта плоскость и есть та рамка, посчитанная
   * в мировых единицах
   */
  const shadowMaterial = new ShadowMaterial({ opacity: 0.5, transparent: true })
  /**
   * кромку у текста дня тень получает в шейдере плиты, а не CSS-маской на холсте. маска на
   * WebGL-холсте - лишний слой композиции поверх каждого кадра тени, а на подлёте тень
   * рисуется каждый кадр. координата берётся из gl_FragCoord: холст тени лежит на сцене
   * пиксель в пиксель, и пиксели сцены получаются делением на плотность
   */
  const veil = { value: new Vector4(0, 0, 1, 1) }
  const veilHeight = { value: 1 }
  const shadowOut = 'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );'
  shadowMaterial.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes(shadowOut)) {
      console.warn('flacon-stage: в ShadowMaterial не нашлось строки для кромки тени')
      return
    }
    shader.uniforms.uVeil = veil
    shader.uniforms.uVeilHeight = veilHeight
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec4 uVeil;\nuniform float uVeilHeight;\nvoid main() {')
      .replace(
        shadowOut,
        /* glsl */ `float along = uVeil.x > 1.5 ? gl_FragCoord.x / uVeil.w : uVeilHeight - gl_FragCoord.y / uVeil.w;
	float fade = uVeil.x > 0.5 ? 1.0 - smoothstep( uVeil.y, uVeil.z, along ) : 1.0;
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * fade );`,
      )
  }
  const ground = new Mesh(new PlaneGeometry(1, 1), shadowMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  shadeScene.add(ground)

  /**
   * двойники флакона для тени. меш не может жить в двух сценах сразу, а тень считается в
   * другой. двойник берёт ту же геометрию и тот же материал глубины с дизерингом, а
   * положение копирует у настоящего каждый кадр. в самом кадре он ничего не пишет - ни
   * цвета, ни глубины. слоями это не решить: проход теней в three проверяет слои по
   * основной камере, и спрятанный от неё двойник пропадал бы и из карты
   */
  const unseen = new MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  const { body, cap, collar, liquid, pump } = flacon.meshes
  const casters = [body, cap, collar, liquid, pump].map((source) => {
    const proxy = new Mesh(source.geometry, unseen)
    proxy.castShadow = true
    proxy.customDepthMaterial = source.customDepthMaterial
    proxy.matrixAutoUpdate = false
    proxy.matrixWorldAutoUpdate = false
    proxy.frustumCulled = false
    shadeScene.add(proxy)
    return { proxy, source }
  })

  const patch = document.createElement('canvas')
  const patchCtx = patch.getContext('2d')
  const backdropTexture = new CanvasTexture(patch)
  backdropTexture.colorSpace = SRGBColorSpace

  /**
   * подложка не пишет глубину и рисуется первой. она стоит перед объективом ближе, чем сам
   * флакон, и с записью глубины загораживала его целиком: в кадре оставались только
   * непрозрачные куски, которые успевали нарисоваться раньше неё
   */
  const backdropMaterial = new MeshBasicMaterial({
    map: backdropTexture,
    toneMapped: false,
    depthWrite: false,
    depthTest: false,
  })
  const backdrop = new Mesh(new PlaneGeometry(1, 1), backdropMaterial)
  backdrop.renderOrder = -1
  // подложка - ребёнок камеры: так она сама держится перед объективом при любом
  // положении коробки
  glassCamera.add(backdrop)

  /**
   * подложка нужна стеклу и не нужна глазу. в проход просвета она обязана попасть, в кадр -
   * нет: иначе поверх двумерной сцены ляжет её же копия, размытая до двухсот пикселей.
   * отличить один проход от другого можно по цели отрисовки - у просвета это буфер, у кадра
   * пусто. если сюда когда-нибудь придёт постобработка со своим буфером, признак перестанет
   * работать, и подложку станет видно
   */
  backdrop.onBeforeRender = (r) => {
    backdropMaterial.colorWrite = r.getRenderTarget() !== null
  }

  let scale = 0
  let cosPitch = 1
  /** половина большей стороны видимой плиты - по ней ставится рамка теней */
  let reach = 1
  /** видимая плита в мировых единицах: по ней обжимается глубина теневой камеры */
  const plate = { halfX: 1, near: 1, far: -1 }
  /** единичный вектор на солнце - направление, вдоль которого меряется эта глубина */
  const depth = new Vector3(0, 1, 0)
  let width = 0
  let height = 0
  let fold = 1
  let offsetY = 0
  const base = { x: 0, y: 0 }
  let density = 0.5
  let landed = 0
  /** тень была в последнем кадре - значит, её надо стереть, даже если она погасла */
  let shadeDrawn = false
  let lastYaw = REST_YAW
  /**
   * два доворота, а не один угол. появление крутит флакон на своём пути, переключение
   * формулы - на своём, и попасть они могут на один кадр. складываем, а не перезаписываем:
   * иначе то из двух, что обновилось вторым, стирает первое
   */
  let entranceYaw = 0
  let swapYaw = 0

  const lift = spring()
  const swing = spring()
  const nod = spring()
  const turn = spring()
  let hovering = false
  let reachable = false
  let drifting = 0
  /** экранная коробка флакона в пикселях сцены - по ней ловится и курсор, и палец */
  const box = { x: 0, top: 0, bottom: 0, half: 1 }
  /** где лежит и какого размера холст флакона, в пикселях сцены */
  const frame = { left: Number.NaN, top: Number.NaN, w: 0, h: 0 }

  /**
   * где основание флакона на доле появления t, в пикселях сцены, если верх сцены стоит на
   * offset от окна. сглаживание на обоих концах, а не линейный ход: колесо мыши крутится
   * рывками, и прямое отображение прокрутки в положение видно как дёрганье. smootherstep
   * даёт нулевую скорость и нулевое ускорение и в начале, и в конце - флакон трогается
   * мягко и садится мягко. по горизонтали кривая мягче: на одной и той же обе координаты
   * идут по прямой, и полёт читается падением груза, а не проходом предмета. начало пути
   * задано в окне, поэтому из него вычитается положение сцены: над плитой, пока она ещё
   * внизу, это отрицательные пиксели
   */
  const course = (t: number, offset: number): { e: number; away: number; x: number; y: number } => {
    const e = t * t * t * (t * (t * 6 - 15) + 10)
    const ex = t * t * (3 - 2 * t)
    const away = 1 - e
    const startX = width * (0.5 + FLIGHT_SIDE)
    const startY = FLIGHT_TOP * fold - offset
    return {
      e,
      away,
      x: base.x + (startX - base.x) * (1 - ex),
      y: base.y + (startY - base.y) * away,
    }
  }

  /**
   * полёт по прокрутке ведёт браузер, а не скрипт, - там, где он это умеет. на телефоне
   * страницу прокручивает композитор в своём потоке, а кадр скрипта приходит следом: холст,
   * сдвинутый из скрипта, отставал от плиты на полкадра то в одну, то в другую сторону, и на
   * подлёте флакон подёргивался. путь режется на ключевые кадры CSS на шкале самой секции, и
   * положение холста считается там же и тогда же, где прокрутка. скрипт рисует только сам
   * флакон, всегда в середине коробки, где бы та сейчас ни стояла
   */
  const flightSheet = CSS.supports('animation-timeline: view()')
    ? document.head.appendChild(document.createElement('style'))
    : null
  let flightFor = ''

  const plan = (): void => {
    if (!flightSheet || frame.w < 1 || scale <= 0) return
    // высоты окна в ключе нет намеренно: на телефоне она гуляет вместе с панелями
    // браузера, и путь перестраивался бы прямо под пальцем
    const key = `${frame.w}:${frame.h}:${base.x}:${base.y}:${width}:${scale}`
    if (key === flightFor) return
    flightFor = key
    const ratio = glass.getPixelRatio()
    const steps: string[] = []
    for (let i = 0; i <= FLIGHT_STEPS; i += 1) {
      const t = i / FLIGHT_STEPS
      const { x, y } = course(t, fold * (1 - t))
      const left = t < 1 ? x - frame.w / 2 : snap(x - frame.w / 2, ratio)
      const top = t < 1 ? y - BOX_ABOVE * scale : snap(y - BOX_ABOVE * scale, ratio)
      steps.push(`${(t * 100).toFixed(3)}% { transform: translate3d(${left.toFixed(2)}px, ${top.toFixed(2)}px, 0) }`)
    }
    // имя общее со scenes.css: там кадры вешаются на шкалу секции
    flightSheet.textContent = `@keyframes flacon-flight { ${steps.join(' ')} }`
    canvases.flacon.style.removeProperty('transform')
    canvases.flacon.classList.add('is-flown')
  }

  /**
   * попадание считается по коробке, а не по геометрии. луч по мешу дал бы дыры: между
   * крышкой и корпусом, под плечом, в проёме между гранями - и курсор терял бы флакон
   * посреди него. коробка чуть шире предмета: рука целится в вещь, а не в её силуэт
   */
  const inside = (x: number, y: number): boolean =>
    Math.abs(x - box.x) < box.half * 1.2 &&
    y > box.top - (box.bottom - box.top) * 0.06 &&
    y < box.bottom + (box.bottom - box.top) * 0.08

  const applyShade = (): void => {
    shadowMaterial.opacity = density * landed
  }

  const applyYaw = (): void => {
    spinner.rotation.y = REST_YAW + entranceYaw + swapYaw + swing.value + turn.value
  }

  void flacon.labelReady.then(() => {
    if (frame.w > 0) glass.render(glassScene, glassCamera)
  })

  return {
    tint: flacon.tint,
    write: flacon.write,

    setReach(on) {
      if (reachable === on) return
      reachable = on
      if (on) return
      // ушли из секции - всё, что натрогали, возвращается само. цели в ноль,
      // пружины доедут по дороге и никакого кадра на это не потратят
      hovering = false
      lift.target = 0
      swing.target = 0
      nod.target = 0
      turn.target = 0
    },

    point(x, y) {
      hovering = reachable && x !== null && y !== null && inside(x, y)
      lift.target = hovering ? LIFT : 0
      if (!hovering) {
        swing.target = 0
        nod.target = 0
        return
      }
      /**
       * флакон уходит от курсора, а не за ним. курсор влево - правая грань выезжает вперёд.
       * это то же движение, каким поворачивают предмет в руке: толкают ближнюю к себе
       * сторону
       */
      const middle = (box.top + box.bottom) / 2
      swing.target = clamp(((x as number) - box.x) / box.half, -1, 1) * SWING
      nod.target =
        clamp(((y as number) - middle) / Math.max(1, (box.bottom - box.top) / 2), -1, 1) * NOD
    },

    covers(x, y) {
      return reachable && inside(x, y)
    },

    drag(dx) {
      if (!reachable) return
      turn.target += dx * DRAG
    },

    restless() {
      // парение не затухает никогда, поэтому поднятый флакон считается движущимся
      // всегда, а опущенный - только пока пружины доезжают
      return hovering || ![lift, swing, nod, turn].every(asleep)
    },

    setSwap(turns) {
      swapYaw = turns * Math.PI * 2
      /**
       * этикетка гаснет на дальней половине оборота. стекло матовое, но не глухое: с
       * изнанки надпись видно зеркальной. меняется она ровно на полуобороте, и эта
       * прозрачность закрывает подмену
       */
      const face = Math.cos(swapYaw)
      const paint = flacon.meshes.label.material as MeshPhysicalMaterial
      paint.opacity = clamp((face + 0.1) / 0.6, 0, 1)
      applyYaw()
    },

    layout(l) {
      const pitch = Math.asin(l.tilt)
      cosPitch = Math.cos(pitch)
      /**
       * пикселей на мировую единицу. делим на косинус, а не берём как есть: камера смотрит
       * сверху, и вертикаль флакона проецируется короче своей длины ровно во столько раз.
       * без деления флакон вышел бы ниже нарисованного гномона, на место которого он встал
       */
      scale = l.gnomonH / cosPitch

      for (const camera of [glassCamera, shadeCamera]) {
        camera.position.set(0, CAMERA_DISTANCE * Math.sin(pitch), CAMERA_DISTANCE * Math.cos(pitch))
        camera.lookAt(0, 0, 0)
      }

      // кадр тени - вся сцена, и начало мира в базе гномона. сдвига под прокрутку
      // больше нет: холст едет вместе с плитой, и считать за браузер нечего
      shadeCamera.left = -l.baseX / scale
      shadeCamera.right = (l.w - l.baseX) / scale
      shadeCamera.top = l.baseY / scale
      shadeCamera.bottom = -(l.h - l.baseY) / scale
      shadeCamera.updateProjectionMatrix()
      if (l.w !== width || l.h !== height) shade.setSize(l.w, l.h, true)

      /**
       * размер коробки округлён до физических пикселей. холст, растянутый на дробную
       * ширину, браузер пересэмплирует, и вся выгаданная резкость уходит в это размытие
       */
      const ratio = glass.getPixelRatio()
      const boxW = snap(BOX_HALF * 2 * scale, ratio)
      const boxH = snap((BOX_ABOVE + BOX_BELOW) * scale, ratio)
      if (boxW !== frame.w || boxH !== frame.h) {
        frame.w = boxW
        frame.h = boxH
        frame.left = Number.NaN
        glass.setSize(boxW, boxH, true)
        patch.width = BACKDROP_PX
        patch.height = Math.max(1, Math.round((BACKDROP_PX * boxH) / boxW))
      }

      width = l.w
      height = l.h
      fold = l.fold
      offsetY = l.offsetY
      base.x = l.baseX
      base.y = l.baseY

      /**
       * плита в мире считается обратной подстановкой из экрана. точка земли (x, 0, z)
       * проецируется в y = baseY + scale * z * sin(наклон): высоты у неё нет, и весь ход по
       * экрану даёт только удаление от зрителя. отсюда z горизонта и z нижней кромки, а по
       * x рамка просто шире кадра
       */
      const sin = Math.max(0.05, Math.sin(pitch))
      const far = (l.horizonY - l.baseY) / (scale * sin)
      const near = (l.h - l.baseY) / (scale * sin)
      const halfX = Math.max(l.baseX, l.w - l.baseX) / scale
      ground.scale.set(halfX * 2, near - far, 1)
      ground.position.z = (far + near) / 2

      plate.halfX = halfX
      plate.near = near
      plate.far = far
      reach = Math.max(halfX, Math.abs(far), near) + 1

      /**
       * тень появляется тогда, когда под флаконом действительно оказывается плита. по
       * одному ходу появления это не посчитать: на девяти десятых пути флакон уже почти на
       * месте, а плита ещё в полутора сотнях пикселей ниже, и тень от него ложилась бы в
       * небо отдельным клином. считаем по тому, где сцена: четверть окна до пина - тени
       * нет, на пине - полная
       */
      landed = clamp(1 - Math.max(0, l.offsetY) / (0.24 * l.fold), 0, 1)
      /**
       * гаснет тень прозрачностью плиты, а не выключением света. castShadow меняет число
       * теней в сцене, а от него зависят дефайны каждого материала: одно присваивание - и
       * three пересобирает все программы заново. на подлёте это были три кадра по двести
       * миллисекунд подряд, ровно в тот момент, когда флакон входит в кадр
       */
      applyShade()
      veilHeight.value = l.h
      plan()
    },

    setSun(azimuth, altitude, tint, strength) {
      const az = (azimuth * Math.PI) / 180
      const alt = (altitude * Math.PI) / 180
      /**
       * юг - прямо от зрителя, поэтому в полдень солнце стоит ЗА флаконом и он идёт на
       * просвет. это не ошибка расстановки: в двумерной сцене полуденная тень ложится к
       * зрителю, и свет обязан приходить с той же стороны. высота внизу подпёрта: у
       * горизонта тень уходит в бесконечность, и карта теней натягивается на неё впустую.
       * рисунок обрезает её ободом, здесь тем же
       */
      const above = Math.max(0.12, Math.sin(alt))
      sun.position.set(Math.sin(az) * Math.cos(alt), above, -Math.cos(az) * Math.cos(alt))
      const distance = reach + 4
      sun.position.setLength(distance)
      depth.copy(sun.position).divideScalar(distance)
      sun.color.setRGB(tint[0], tint[1], tint[2], SRGBColorSpace)
      sun.intensity = strength
      light.position.copy(sun.position)
      light.color.copy(sun.color)
      light.intensity = strength

      // рамка теневой камеры считается в системе источника и обязана накрыть всю
      // видимую плиту вместе с флаконом, иначе тень обрывается на полпути
      sun.shadow.camera.left = -reach
      sun.shadow.camera.right = reach
      sun.shadow.camera.top = reach
      sun.shadow.camera.bottom = -reach
      /**
       * ближняя и дальняя плоскости обжаты по самой плите, а не взяты с запасом. VSM хранит
       * в карте глубину и её квадрат, и оба в половинной точности. чем шире диапазон, тем
       * грубее шаг: на 0.5..19 разность между средним квадратом и квадратом среднего
       * уходила в шум, и плита к полудню покрывалась рябью из коротких штрихов на всю
       * ширину кадра. взять с запасом по радиусу рамки тоже мало - на узком экране плита
       * уходит к зрителю вчетверо дальше, чем вширь, и запас там снова оказывался вдвое
       * больше нужного.
       *
       * поэтому считаем настоящую глубину: четыре угла плиты и сам флакон,
       * спроецированные на луч света. в полдень свет идёт почти по нормали к плите,
       * и весь диапазон - это высота флакона
       */
      let nearest = spanOf(depth, 1.05 + LIFT, 0.5)
      let furthest = -spanOf(depth, 0, 0.5)
      for (const x of [-plate.halfX, plate.halfX]) {
        for (const z of [plate.far, plate.near]) {
          const along = x * depth.x + z * depth.z
          nearest = Math.max(nearest, along)
          furthest = Math.min(furthest, along)
        }
      }
      sun.shadow.camera.near = Math.max(0.5, distance - nearest - 0.5)
      sun.shadow.camera.far = distance - furthest + 0.5
      /**
       * размытие держим постоянным в мире, а не в текселях. radius у VSM считается по
       * карте, и стоит рамке вырасти - кромка сужается во столько же раз. рамка тут зависит
       * от размера окна, и на широком экране тень становилась резаной. SHADOW_BLUR - ширина
       * полутени в высотах флакона
       */
      sun.shadow.radius = clamp((SHADOW_BLUR * shadowMap) / (2 * reach), 2, 14)
      // без этого ни одно из чисел выше не применяется: матрицу проекции
      // OrthographicCamera считает в конструкторе
      sun.shadow.camera.updateProjectionMatrix()
    },

    warm() {
      /**
       * программы собираются заранее. three компилирует материал, когда тот впервые
       * попадает в кадр. в начале появления флакон стоит выше верхней кромки и отсекается
       * по пирамиде, так что просвет, полутень и надпись компилировались ровно в тот
       * момент, когда он входил в кадр - на глазах у зрителя, кадром в четверть секунды.
       * compileAsync проходит по сцене целиком и не спрашивает, видно ли объект
       */
      return Promise.all([
        glass.compileAsync(glassScene, glassCamera),
        shade.compileAsync(shadeScene, shadeCamera),
      ]).then(() => undefined)
    },

    setShade(tint, opacity) {
      shadowMaterial.color.setRGB(tint[0], tint[1], tint[2], SRGBColorSpace)
      density = opacity
      applyShade()
    },

    setVeil(axis, from, to) {
      veil.value.set(axis === 'y' ? 1 : axis === 'x' ? 2 : 0, from, to, shade.getPixelRatio())
    },

    setBackdrop(source, paper) {
      if (!patchCtx || frame.w < 1 || width < 2) return
      /**
       * подложка - кусок сцены ровно под коробкой флакона. пока флакон летит, коробка выше
       * плиты, над ней ещё предыдущая секция на бумаге. заливаем бумагой и кладём сверху ту
       * часть сцены, что под коробкой реально есть. источник обрезаем руками: drawImage с
       * прямоугольником за краем холста Safari когда-то молча не рисовал вовсе
       */
      patchCtx.fillStyle = paper
      patchCtx.fillRect(0, 0, patch.width, patch.height)
      const k = source.width / width
      const x0 = Math.max(0, frame.left * k)
      const y0 = Math.max(0, frame.top * k)
      const x1 = Math.min(source.width, (frame.left + frame.w) * k)
      const y1 = Math.min(source.height, (frame.top + frame.h) * k)
      if (x1 > x0 && y1 > y0) {
        const fx = patch.width / (frame.w * k)
        const fy = patch.height / (frame.h * k)
        patchCtx.drawImage(
          source,
          x0,
          y0,
          x1 - x0,
          y1 - y0,
          (x0 - frame.left * k) * fx,
          (y0 - frame.top * k) * fy,
          (x1 - x0) * fx,
          (y1 - y0) * fy,
        )
      }
      backdropTexture.needsUpdate = true
    },

    setEntrance(t) {
      const { e, away, x: sx, y: sy } = course(t, offsetY)
      // в мир путь переводится обратной подстановкой: по горизонтали пиксель - единица мира,
      // умноженная на scale, по вертикали ещё и косинус наклона, потому что камера смотрит
      // сверху и вертикаль укорачивается ровно во столько раз
      pivot.position.set((sx - base.x) / scale, (base.y - sy) / (scale * cosPitch), 0)
      const size = FLIGHT_SCALE + (1 - FLIGHT_SCALE) * e
      pivot.scale.setScalar(size)

      // коробка на экране: по ней ловится курсор и палец. считается тут, потому что
      // тут известно и где флакон стоит, и какого он сейчас размера
      box.x = sx
      box.bottom = sy
      box.top = sy - flacon.size.y * size * scale * cosPitch
      box.half = flacon.size.x * 0.5 * size * scale

      /**
       * коробка холста. в полёте по CSS её ставит браузер, а скрипт только знает, где она:
       * без округления, чтобы флакон стоял ровно в её середине, куда бы браузер её ни
       * довёз. на плите - в физических пикселях, как и последний ключевой кадр: холст на
       * дробной координате пересэмплируется, и надпись мылится. без CSS холст сдвигается
       * отсюда же трансформом и только тогда, когда действительно едет
       */
      const ratio = glass.getPixelRatio()
      const exact = flightSheet !== null && t < 1
      const left = exact ? sx - frame.w / 2 : snap(sx - frame.w / 2, ratio)
      const top = exact ? sy - BOX_ABOVE * scale : snap(sy - BOX_ABOVE * scale, ratio)
      if (left !== frame.left || top !== frame.top) {
        frame.left = left
        frame.top = top
        if (!flightSheet) canvases.flacon.style.transform = `translate3d(${left}px, ${top}px, 0)`
      }
      glassCamera.left = (left - base.x) / scale
      glassCamera.right = glassCamera.left + frame.w / scale
      glassCamera.top = (base.y - top) / scale
      glassCamera.bottom = glassCamera.top - frame.h / scale
      glassCamera.updateProjectionMatrix()

      backdrop.scale.set(frame.w / scale, frame.h / scale, 1)
      backdrop.position.set(
        (glassCamera.left + glassCamera.right) / 2,
        (glassCamera.top + glassCamera.bottom) / 2,
        // за флаконом, а не перед ним: сам он стоит в CAMERA_DISTANCE от объектива
        -(CAMERA_DISTANCE + 6),
      )

      pivot.rotation.set(-LEAN_BACK * away, 0, -LEAN_RIGHT * away)
      // ровно один оборот за всё появление, и заканчивается он на рабочем ракурсе
      entranceYaw = Math.PI * 2 * away
      applyYaw()

      /**
       * над страницей света больше, чем в сцене. день начинается до рассвета, и на низком
       * солнце флакон над белой бумагой выходит чёрным силуэтом. комнату из стенда
       * поднимаем на время полёта и убираем к посадке, где сцену ведёт уже само солнце
       */
      glassScene.environmentIntensity = 0.5 + 0.5 * away
    },

    render(dt) {
      if (width < 2 || frame.w < 1) return

      const step = Math.min(dt, 1 / 30)
      settle(lift, step, SPRING_LIFT)
      settle(swing, step, SPRING_TURN)
      settle(nod, step, SPRING_TURN)
      settle(turn, step, SPRING_DRAG)

      /**
       * парение включается вместе с подъёмом, а не отдельно от него. три несоизмеримых
       * периода: сумма трёх синусов с такими не повторяется на глаз, и колебание не
       * читается как заводная игрушка. амплитуда умножена на саму высоту подъёма, поэтому
       * на опущенном флаконе её просто нет
       */
      drifting += step
      const air = lift.value / LIFT
      drift.position.set(
        Math.sin(drifting * 0.55) * DRIFT_X * air,
        lift.value + Math.sin(drifting * 0.83) * DRIFT_Y * air,
        Math.sin(drifting * 0.41) * DRIFT_Z * air,
      )
      tilt.rotation.x = nod.value
      tilt.rotation.z = Math.sin(drifting * 0.37) * DRIFT_ROLL * air
      applyYaw()
      /**
       * настой качает не сам поворот, а его изменение - модель жидкости считает
       * наклон зеркала от углового ускорения. поэтому скорость оборота берётся из
       * разницы кадров, а не задаётся отдельно: флакон плещет на старте оборота и
       * на посадке, и стоит ровно, пока стоит сам
       */
      const spin = dt > 0 ? (spinner.rotation.y - lastYaw) / dt : 0
      lastYaw = spinner.rotation.y
      flacon.motion.update(dt, spin)

      glassScene.updateMatrixWorld()
      for (const { proxy, source } of casters) proxy.matrixWorld.copy(source.matrixWorld)
      glass.render(glassScene, glassCamera)

      // пока флакон в полёте, тени нет вовсе, и карту с двумя проходами размытия
      // незачем считать впустую. один кадр после угасания всё же нужен - стереть её
      const visible = shadowMaterial.opacity > 0
      if (visible || shadeDrawn) {
        shade.render(shadeScene, shadeCamera)
        shadeDrawn = visible
      }
    },

    dispose() {
      flightSheet?.remove()
      canvases.flacon.classList.remove('is-flown')
      flacon.dispose()
      ground.geometry.dispose()
      shadowMaterial.dispose()
      unseen.dispose()
      backdrop.geometry.dispose()
      backdropMaterial.dispose()
      backdropTexture.dispose()
      studio?.dispose()
      studio = null
      glass.dispose()
      shade.dispose()
    },
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** до физического пикселя: половинный пиксель холста браузер размывает */
function snap(value: number, ratio: number): number {
  return Math.round(value * ratio) / ratio
}

/** насколько далеко коробка флакона выступает по лучу света: высота плюс полширины */
function spanOf(direction: Vector3, height: number, half: number): number {
  return direction.y * height + (Math.abs(direction.x) + Math.abs(direction.z)) * half
}
