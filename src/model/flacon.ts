import { BufferAttribute, BufferGeometry } from 'three'

import {
  chamferedSection,
  loftNormals,
  roundCorners,
  towardCircle,
  type Vec2,
  type Vec3,
} from './shape'

/**
 * флакон: гранёное сечение, протянутое по профилю. форма набирается двумя контурами, и оба
 * скругляются одним и тем же способом. поперечный даёт вертикальные фаски по углам,
 * продольный - всё остальное: опорное кольцо дна, донную выемку, плечо, канал горлышка,
 * юбку крышки. никакой геометрии из файла тут нет и не будет
 */

export type FlaconOptions = {
  /** высота от опорного кольца до макушки крышки в мировых единицах */
  height: number
  /** половина ширины корпуса по фасаду */
  halfWidth: number
  /** половина глубины. заметно меньше ширины - флакон плоский, как и положено */
  halfDepth: number
  /** длина среза угла по каждой оси. это и есть та самая огранка */
  chamfer: number
  /** радиус скругления на концах среза. маленький, иначе срез теряет границы */
  fillet: number
  /** шаг точек по контуру сечения в долях полуширины */
  density: number
}

export const FLACON: FlaconOptions = {
  height: 1,
  halfWidth: 0.285,
  halfDepth: 0.163,
  chamfer: 0.038,
  fillet: 0.004,
  density: 0.3,
}

const BODY_TOP = 0.62
const SHOULDER_TOP = 0.735
const NECK_TOP = 0.8

/** радиусы горлышка и канала в долях полуширины корпуса */
const NECK_RADIUS = 0.34
const BORE_RADIUS = 0.235
/** насколько глубоко видно в канал. дальше стоит помпа, и заглядывать туда незачем */
const BORE_DEPTH = 0.075

/** обжимное кольцо: садится на горлышко и держит крышку */
const COLLAR_BOTTOM = 0.744
const COLLAR_TOP = 0.79
// шире горлышка ровно настолько, чтобы читаться отдельной деталью, и уже юбки
// крышки - иначе кольцо вылезает из-под неё по узкой стороне
const COLLAR_RADIUS = NECK_RADIUS * 1.06

/**
 * крышка повторяет сечение корпуса в уменьшении - иначе она из другого набора.
 * низ юбки заходит на обжимное кольцо и оставляет от него тонкую полоску: если
 * посадить крышку выше, она висит над плечом отдельным предметом
 */
const CAP_SCALE = 0.7
const CAP_BOTTOM = 0.774
const CAP_TOP = 1

/**
 * плечо - не прямой скос, а четверть эллипса. прямая от стенки к горлышку даёт гребень по
 * кругу и читается как крыша канистры: ровно это и было в первом варианте. кривая уходит от
 * стенки по касательной вертикально и приходит к горлышку горизонтально, а угол между ними
 * снимается коротким скруглением - так плечо и устроено у настоящего флакона.
 *
 * степени 1.6 и 0.7 держат кривую полной у стенки и подбирают её у горлышка;
 * на честной окружности (1 и 1) плечо выходит пузатым и флакон читается банкой
 */
function shoulderCurve(steps: number): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = []
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * (Math.PI / 2)
    const r = NECK_RADIUS + (1 - NECK_RADIUS) * Math.cos(t) ** 1.6
    const y = BODY_TOP + (SHOULDER_TOP - BODY_TOP) * Math.sin(t) ** 0.7
    points.push([r, y, 0])
  }
  return points
}

/**
 * профиль корпуса: (радиус в долях полуширины, высота в долях height, скругление). контур
 * идёт из центра донной выемки наружу, по опорному кольцу вверх по стенке, через плечо на
 * кромку горлышка и обратно вниз по каналу до его дна. замыкается он по оси вращения,
 * поэтому обе точки на оси стоят с нулевым скруглением.
 *
 * первые две точки лежат на одной высоте не для красоты: пока дно выемки было
 * коническим, его нормали чуть заваливались, а веер в центре стоял строго вниз,
 * и по стыку шла рамка со светлыми клиньями по углам. плоская площадка вокруг оси
 * снимает расхождение, а веер на ней остаётся крошечным
 */
const BODY_PROFILE: Array<[number, number, number]> = [
  [0, 0.046, 0],
  [0.2, 0.046, 0.022],
  [0.62, 0.038, 0.075],
  [0.9, 0.005, 0.028],
  [0.965, 0, 0.016],
  [1, 0.028, 0.028],
  ...shoulderCurve(14),
  [NECK_RADIUS, NECK_TOP, 0.007],
  [BORE_RADIUS, NECK_TOP, 0.005],
  [BORE_RADIUS, NECK_TOP - BORE_DEPTH, 0.018],
  [0, NECK_TOP - BORE_DEPTH, 0],
]

/** обжимное кольцо - тело вращения, поэтому у него своё, круглое сечение */
const COLLAR_PROFILE: Array<[number, number, number]> = [
  [0, COLLAR_BOTTOM, 0],
  [1, COLLAR_BOTTOM, 0.006],
  [1, COLLAR_TOP, 0.006],
  [0, COLLAR_TOP, 0],
]

/** уровень налива и толщина стенки в долях полуширины корпуса */
const FILL_LEVEL = 0.42
const INNER_WALL = 0.945

/**
 * профиль настоя. дно повторяет купол донной выемки наоборот: внутри флакона он торчит
 * вверх, и жидкость собирается кольцом вокруг него - у настоящего флакона это видно.
 *
 * последние три точки - мениск. у стекла жидкость поднимается выше, чем в середине:
 * она его смачивает. без этой ступеньки уровень читается нарисованной полосой,
 * а не поверхностью
 */
const LIQUID_PROFILE: Array<[number, number, number]> = [
  [0, 0.078, 0],
  [0.5, 0.074, 0.05],
  [0.87, 0.036, 0.03],
  [INNER_WALL, 0.03, 0.012],
  [INNER_WALL, FILL_LEVEL + 0.007, 0.003],
  [0.895, FILL_LEVEL, 0.014],
  [0, FILL_LEVEL - 0.005, 0],
]

/**
 * профиль крышки. верх снят широкой фаской - той же, что держит вертикальные рёбра корпуса,
 * только положенной горизонтально: макушка обязана ловить такой же длинный узкий блик,
 * иначе крышка выглядит приставленной от другой вещи. внутренней полости у крышки нет
 * намеренно. с ней стекло становится тонкой стенкой, и на просвет видно уже не форму, а
 * внутренние грани дальней стенки: крышка разваливалась на две плоские панели по бокам от
 * помпы. сплошное литьё держит и силуэт, и фаски, а помпа под ним читается сквозь стекло -
 * ровно так, как на референсе
 */
const CAP_PROFILE: Array<[number, number, number]> = [
  [0, CAP_BOTTOM, 0],
  [1, CAP_BOTTOM, 0.018],
  [1, 0.955, 0.05],
  [0.78, CAP_TOP, 0.024],
  [0, CAP_TOP, 0],
]

export function buildFlaconBody(options: FlaconOptions = FLACON): BufferGeometry {
  const section = bodySection(options)
  const bodyAspect = options.halfDepth / options.halfWidth

  return loft(section, BODY_PROFILE, options, (p) => {
    /**
     * доля "насколько ещё не горлышко". ведёт сразу и пропорции, и округление: к кромке
     * флакон обязан стать круглым в обоих смыслах одновременно. считать её от высоты нельзя
     * - на плече пропорция стремится к единице быстрее, чем падает радиус, и корпус пухнет
     * в глубину. поэтому она берётся от радиуса, а ниже стенки принудительно равна единице:
     * в донной выемке радиус тоже мал, и без этого дно поехало бы к окружности вместе с
     * горлышком
     */
    const belowBody = p.y < BODY_TOP * options.height
    const u = belowBody ? 1 : clamp01((p.x - NECK_RADIUS) / (1 - NECK_RADIUS))
    const halfW = options.halfWidth * p.x
    return {
      halfW,
      halfD: halfW * (bodyAspect + (1 - bodyAspect) * (1 - u)),
      roundness: 1 - u,
    }
  })
}

export const LIQUID_FILL = FILL_LEVEL

export function buildFlaconLiquid(options: FlaconOptions = FLACON): BufferGeometry {
  const section = bodySection(options)
  const bodyAspect = options.halfDepth / options.halfWidth

  const geometry = loft(section, LIQUID_PROFILE, options, (p) => ({
    halfW: options.halfWidth * p.x,
    halfD: options.halfWidth * p.x * bodyAspect,
    roundness: 0,
  }))

  /**
   * aSurface - "насколько эта вершина принадлежит зеркалу". единица на уровне налива, ноль
   * на ладонь ниже. по нему шейдер двигает только поверхность: наклонять весь меш нельзя,
   * он сразу выйдет за стенку
   */
  const position = geometry.getAttribute('position')
  const fill = FILL_LEVEL * options.height
  const band = 0.11 * options.height
  const surface = new Float32Array(position.count)
  for (let i = 0; i < position.count; i += 1) {
    surface[i] = smoothstep(fill - band, fill, position.getY(i))
  }
  geometry.setAttribute('aSurface', new BufferAttribute(surface, 1))

  return geometry
}

export function buildFlaconCollar(options: FlaconOptions = FLACON): BufferGeometry {
  const radius = options.halfWidth * COLLAR_RADIUS
  const circle: Vec2[] = []
  const steps = 48
  for (let i = 0; i < steps; i += 1) {
    const a = (Math.PI * 2 * i) / steps
    circle.push({ x: Math.cos(a), y: Math.sin(a) })
  }

  return loft(circle, COLLAR_PROFILE, options, (p) => ({
    halfW: radius * p.x,
    halfD: radius * p.x,
    roundness: 0,
  }))
}

export function buildFlaconCap(options: FlaconOptions = FLACON): BufferGeometry {
  const capW = options.halfWidth * CAP_SCALE
  const capD = options.halfDepth * CAP_SCALE
  const section = normalise(
    subdivideLong(
      chamferedSection(capW, capD, options.chamfer * CAP_SCALE, options.fillet * CAP_SCALE, 2),
      capW * options.density,
    ),
    capW,
    capD,
  )
  const aspect = capD / capW

  return loft(section, CAP_PROFILE, options, (p) => ({
    halfW: capW * p.x,
    halfD: capW * p.x * aspect,
    roundness: 0,
  }))

}

type RingShape = (p: Vec2) => { halfW: number; halfD: number; roundness: number }

/**
 * общая протяжка: контур сечения по контуру профиля. корпус, кольцо и крышка отличаются
 * только сечением и тем, как меняются полуоси, поэтому вся сшивка, крышки на оси и нормали
 * живут здесь в одном месте
 */
function loft(
  section: Vec2[],
  profile: Array<[number, number, number]>,
  options: FlaconOptions,
  shape: RingShape,
): BufferGeometry {
  const outline = roundCorners(
    profile.map(([r, y]) => ({ x: r, y: y * options.height })),
    profile.map(([, , radius]) => radius * options.height),
    5,
  )

  // порядок обхода контура и есть порядок колец. сортировать по высоте нельзя:
  // и донная выемка, и канал горлышка идут против высоты, и сортировка их вывернет
  const rings: Vec2[] = []
  for (const p of outline) {
    if (p.x <= 1e-4) continue
    const last = rings[rings.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < options.height * 5e-4) continue
    rings.push(p)
  }

  const loops: Vec3[][] = rings.map((p) => {
    const { halfW, halfD, roundness } = shape(p)
    return towardCircle(section, roundness).map((s) => ({
      x: s.x * halfW,
      y: p.y,
      z: s.y * halfD,
    }))
  })

  const normals = loftNormals(loops)
  const positions: number[] = []
  const normalOut: number[] = []
  const n = section.length

  for (let i = 0; i < loops.length - 1; i += 1) {
    for (let k = 0; k < n; k += 1) {
      const k2 = (k + 1) % n
      quad(
        positions,
        normalOut,
        loops[i][k],
        loops[i + 1][k],
        loops[i + 1][k2],
        loops[i][k2],
        normals[i][k],
        normals[i + 1][k],
        normals[i + 1][k2],
        normals[i][k2],
      )
    }
  }

  cap(positions, normalOut, loops[0], normals[0], { x: 0, y: -1, z: 0 }, false)
  cap(
    positions,
    normalOut,
    loops[loops.length - 1],
    normals[normals.length - 1],
    { x: 0, y: 1, z: 0 },
    true,
  )

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normalOut), 3))
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * сечение считается в настоящих единицах и только потом нормируется - каждая ось делится на
 * свою полуось. почему не единичный квадрат: срез угла, снятый в квадрате, после сжатия по
 * глубине перестаёт быть срезом под 45°, его нормаль уезжает к 29° от узкой грани, и
 * огранка расплывается в скругление. а почему не готовый прямоугольник: тогда при переходе
 * к окружности точки широкой грани идут внутрь на 0.13, точки узкой стоят, и плечо
 * собирается складкой. нормировка снимает обе беды разом
 */
function bodySection(options: FlaconOptions): Vec2[] {
  const world = chamferedSection(
    options.halfWidth,
    options.halfDepth,
    options.chamfer,
    options.fillet,
    2,
  )
  return normalise(
    subdivideLong(world, options.halfWidth * options.density),
    options.halfWidth,
    options.halfDepth,
  )
}

function normalise(points: Vec2[], halfW: number, halfD: number): Vec2[] {
  return points.map((p) => ({ x: p.x / halfW, y: p.y / halfD }))
}

function quad(
  pos: number[],
  nor: number[],
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  na: Vec3,
  nb: Vec3,
  nc: Vec3,
  nd: Vec3,
): void {
  push(pos, nor, a, na)
  push(pos, nor, b, nb)
  push(pos, nor, c, nc)
  push(pos, nor, a, na)
  push(pos, nor, c, nc)
  push(pos, nor, d, nd)
}

function cap(
  pos: number[],
  nor: number[],
  ring: Vec3[],
  ringNormals: Vec3[],
  axis: Vec3,
  flip: boolean,
): void {
  const centre: Vec3 = { x: 0, y: ring[0].y, z: 0 }
  for (let k = 0; k < ring.length; k += 1) {
    const k2 = (k + 1) % ring.length
    // по ободу берём нормаль кольца, а не осевую: иначе по краю крышки идёт
    // жёсткая ступень там, где на стекле её нет
    push(pos, nor, centre, axis)
    if (flip) {
      push(pos, nor, ring[k2], ringNormals[k2])
      push(pos, nor, ring[k], ringNormals[k])
    } else {
      push(pos, nor, ring[k], ringNormals[k])
      push(pos, nor, ring[k2], ringNormals[k2])
    }
  }
}

function push(pos: number[], nor: number[], p: Vec3, n: Vec3): void {
  pos.push(p.x, p.y, p.z)
  nor.push(n.x, n.y, n.z)
}

/**
 * добивает точки на длинных прямых участках сечения. без них плоская грань состоит из двух
 * вершин, и при переходе к круглому горлышку она остаётся хордой вместо дуги - шея выходит
 * гранёной там, где должна быть круглой. шаг держим крупным: лишний столбец на плоской
 * стенке не делает её ровнее, он только режет её на длинные тонкие треугольники
 */
function subdivideLong(points: Vec2[], maxLength: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / maxLength))
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
