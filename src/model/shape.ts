/**
 * два помощника, на которых стоит вся геометрия флакона: скругление углов многоугольника и
 * пересчёт нормалей по углу между гранями. оба нужны по одной причине - форма набрана
 * плоскими гранями с узкими фасками, и обе операции three.js из коробки делают не так, как
 * надо этой модели
 */

export type Vec2 = { x: number; y: number }
export type Vec3 = { x: number; y: number; z: number }

const EPS = 1e-9

/**
 * скругляет каждую вершину замкнутого контура дугой заданного радиуса. это и есть bevel из
 * блендера, только в двух измерениях: им набирается и сечение корпуса (фаски по четырём
 * углам), и профиль (переход дна в стенку, стенки в плечо). радиус задаётся на вершину,
 * потому что дну хватает волоска, а плечу нужен палец
 */
export function roundCorners(points: Vec2[], radii: number[], steps: number): Vec2[] {
  const n = points.length
  const out: Vec2[] = []

  for (let i = 0; i < n; i += 1) {
    const v = points[i]
    const prev = points[(i - 1 + n) % n]
    const next = points[(i + 1) % n]

    const d1 = norm(sub(prev, v))
    const d2 = norm(sub(next, v))

    const cos = clamp(d1.x * d2.x + d1.y * d2.y, -1, 1)
    const interior = Math.acos(cos)

    // вершина на прямой или сложенная вдвое - дуге тут места нет
    if (interior < 1e-3 || Math.PI - interior < 1e-3 || radii[i] <= 0) {
      out.push({ ...v })
      continue
    }

    const half = interior / 2
    // отход от вершины до точки касания. длиннее половины любого из соседних
    // рёбер он быть не может, иначе соседние дуги налезут друг на друга
    let tangent = radii[i] / Math.tan(half)
    tangent = Math.min(tangent, len(sub(prev, v)) / 2, len(sub(next, v)) / 2)
    const radius = tangent * Math.tan(half)

    const a = add(v, scale(d1, tangent))
    const b = add(v, scale(d2, tangent))
    const bisector = norm(add(d1, d2))
    const centre = add(v, scale(bisector, radius / Math.sin(half)))

    let from = Math.atan2(a.y - centre.y, a.x - centre.x)
    let to = Math.atan2(b.y - centre.y, b.x - centre.x)
    let delta = to - from
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2

    for (let s = 0; s <= steps; s += 1) {
      const t = from + (delta * s) / steps
      out.push({ x: centre.x + Math.cos(t) * radius, y: centre.y + Math.sin(t) * radius })
    }
  }

  return dedupe(out)
}

/**
 * контур сечения корпуса: прямоугольник со срезанными углами. срез - это отдельная плоская
 * грань, ради которой всё и затевалось: именно она ловит длинный узкий блик по
 * вертикальному ребру и отличает флакон от скруглённой коробки. fillet держим маленьким,
 * иначе срез теряет собственные границы
 */
export function chamferedSection(
  halfWidth: number,
  halfDepth: number,
  chamfer: number,
  fillet: number,
  steps = 2,
): Vec2[] {
  const w = halfWidth
  const d = halfDepth
  const c = Math.min(chamfer, w * 0.9, d * 0.9)

  const corners: Vec2[] = [
    { x: w, y: d - c },
    { x: w - c, y: d },
    { x: -(w - c), y: d },
    { x: -w, y: d - c },
    { x: -w, y: -(d - c) },
    { x: -(w - c), y: -d },
    { x: w - c, y: -d },
    { x: w, y: -(d - c) },
  ]

  return roundCorners(corners, corners.map(() => fillet), steps)
}

/**
 * тот же контур, подтянутый к окружности. нужен горлышку: снизу оно продолжает гранёный
 * корпус, сверху обязано стать круглым, иначе на него не сядет помпа. точки не
 * пересэмплируются, а двигаются по своим же углам - соответствие между кольцами остаётся
 * один в один, и профиль сохраняет сгущение точек на фасках
 */
export function towardCircle(section: Vec2[], amount: number): Vec2[] {
  if (amount <= 0) return section

  // радиус окружности - меньшая полуось, а не средняя.
  // по средней сечение на плече РАСТЁТ в глубину (у плоского флакона она вдвое
  // меньше ширины), и корпус раздувается пузом там, где обязан подбираться
  const target = Math.min(...section.map(len))
  const n = section.length
  const base = Math.atan2(section[0].y, section[0].x)

  return section.map((p, k) => {
    /**
     * тянем не только радиус, но и угол - к равномерному шагу по кругу. если двигать точки
     * строго по своим лучам, кучность сохраняется: на фасках их много, на прямых мало, и
     * кромка горлышка выходит не окружностью, а многоугольником с четырьмя длинными
     * хордами. это отчётливо видно сверху
     */
    const even = base + (Math.PI * 2 * k) / n
    const angle = unwrap(Math.atan2(p.y, p.x), even)
    const a = lerp(angle, even, amount)
    const r = lerp(len(p), target, amount)
    return { x: Math.cos(a) * r, y: Math.sin(a) * r }
  })
}

/** приводит угол в ту же ветвь, что и опорный, иначе интерполяция идёт через разрыв */
function unwrap(angle: number, near: number): number {
  let a = angle
  while (a - near > Math.PI) a -= Math.PI * 2
  while (near - a > Math.PI) a += Math.PI * 2
  return a
}

/**
 * нормали лофта считаются из самой поверхности: касательная вдоль кольца на касательную
 * вдоль профиля, и векторное произведение даёт нормаль. до этого нормали склеивались по
 * углу между гранями, как смягчающие группы в блендере, и на плече это дало брак: у среза
 * угла соседние кольца оказывались по разные стороны порога, часть граней сливалась, часть
 * нет, и по фаске шёл светлый клин. поле, снятое с поверхности, гладкое по построению и
 * порога не имеет вовсе.
 *
 * резкость фасок от этого не теряется: узкое скругление разворачивает нормаль на
 * коротком участке, и блик остаётся такой же тонкой полосой, как на настоящем стекле
 */
export function loftNormals(loops: Vec3[][]): Vec3[][] {
  return loops.map((ring, i) =>
    ring.map((_, k) => {
      const n = ring.length
      const along = sub3(ring[(k + 1) % n], ring[(k - 1 + n) % n])
      const prev = loops[Math.max(0, i - 1)]
      const next = loops[Math.min(loops.length - 1, i + 1)]
      const up = sub3(next[k], prev[k])
      return norm3(cross3(up, along))
    }),
  )
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

const norm3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z)
  return l > EPS ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 1, z: 0 }
}

function dedupe(points: Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || len(sub(p, last)) > 1e-6) out.push(p)
  }
  if (out.length > 1 && len(sub(out[0], out[out.length - 1])) < 1e-6) out.pop()
  return out
}

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })
const len = (a: Vec2): number => Math.hypot(a.x, a.y)
const norm = (a: Vec2): Vec2 => {
  const l = len(a)
  return l > EPS ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }
}
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
