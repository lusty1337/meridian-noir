import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  MeshPhysicalMaterial,
  RingGeometry,
} from 'three'

import type { FlaconTint } from './tint'
import { FLACON, type FlaconOptions } from './flacon'
import { loftNormals, roundCorners, type Vec2, type Vec3 } from './shape'

/**
 * помпа под крышкой и трубка от неё ко дну. крышка прозрачная, значит внутри неё обязано
 * что-то стоять. пустая полость читается браком литья, а не флаконом: у любого спрея под
 * колпаком видно чёрную кнопку с соплом, и именно она объясняет, зачем колпак вообще нужен.
 *
 * помпа - тело вращения, как и обжимное кольцо: реальные распылители точатся на
 * токарном, гранить тут нечего
 */

/**
 * профиль помпы: (радиус в долях полуширины корпуса, высота в долях height, скругление).
 * три цилиндра, поставленные друг на друга и расширяющиеся книзу: кнопка, узкая проставка
 * под ней и обжимной корпус на горлышке. ровно это на референсе, и ровно это провалилось
 * дважды - но не из-за ступеней, а из-за скруглений.
 *
 * при радиусе 0.006 на участке высотой 0.02 дуга съедает участок целиком, торец
 * перестаёт быть плоским и цилиндр превращается в валик. а конус вместо ступени,
 * которым я пробовал это лечить, дал колокол. на литом пластике рёбра острые, и
 * держится вся форма именно на плоских кольцевых торцах: 0.002 - это фаска от
 * пресс-формы, а не скругление.
 *
 * пропорции с референса: кнопка примерно вдвое ниже своего диаметра и занимает
 * верхнюю треть сборки, разница диаметров между ярусами - четверть и треть,
 * иначе ярусы не различить
 */
const PUMP_PROFILE: Array<[number, number, number]> = [
  [0, 0.774, 0],
  // корпус садится на обжимное кольцо и чуть уже него - так между сталью и
  // пластиком остаётся видимая ступенька, а не один слипшийся цилиндр
  [0.335, 0.774, 0.002],
  [0.335, 0.834, 0.002],
  [0.25, 0.834, 0.002],
  [0.25, 0.856, 0.002],
  [0.2, 0.856, 0.002],
  // единственное мягкое место: макушку кнопки жмут пальцем, и она у всех скруглена
  [0.2, 0.918, 0.007],
  [0, 0.924, 0],
]

/** радиус кнопки в тех же долях - по нему садится сопло на её стенку */
const BUTTON_RADIUS = 0.2

/**
 * сопло: высота в долях height, наружный радиус в долях полуширины и вылет над
 * стенкой кнопки. кольцо, а не точка: у настоящей помпы в кнопку запрессована
 * светлая втулка, и видно именно её ободок вокруг тёмного отверстия
 */
const NOZZLE_LEVEL = 0.897
const NOZZLE_RADIUS = 0.04
const NOZZLE_BORE = 0.017
const NOZZLE_LIFT = 0.0005

/**
 * трубка идёт не по оси. по оси её ставить нельзя физически: дно флакона выгнуто куполом
 * внутрь, и на оси настоя меньше всего - он собирается кольцом у стенки. поэтому низ трубки
 * уведён назад, к самому глубокому месту. заодно она уходит от надписи, которая стоит на
 * фасаде
 */
const TUBE_RADIUS = 0.031
const TUBE_TOP = 0.788
const TUBE_FOOT = 0.068
/**
 * увод назад в долях полуглубины. 0.72 - самое глубокое место дна: дальше
 * начинается скругление к стенке, и трубка упёрлась бы в стекло раньше, чем в настой
 */
const TUBE_REACH = 0.72

/**
 * своя полоса перехода, ниже стеклянной. у стекла марена держится до 0.36 высоты, но видно
 * её там нечем: настой стоит до 0.42, а выше стенка тонкая и на просвет читается синевой
 * фона. трубка видна ровно на этом отрезке, поэтому индиго у неё набирается раньше - иначе
 * поверх синего идёт розовая нитка
 */
const TUBE_BAND: [number, number] = [0.3, 0.46]

export function buildPump(options: FlaconOptions = FLACON): BufferGeometry {
  return revolve(PUMP_PROFILE, options, 36)
}

export function buildNozzle(options: FlaconOptions = FLACON): BufferGeometry {
  const wall = BUTTON_RADIUS * options.halfWidth
  const geometry = new RingGeometry(
    NOZZLE_BORE * options.halfWidth,
    NOZZLE_RADIUS * options.halfWidth,
    24,
  )
  geometry.translate(0, NOZZLE_LEVEL * options.height, wall + NOZZLE_LIFT)
  return geometry
}

export type DipTube = {
  geometry: BufferGeometry
  /** верх и низ трубки в мировых координатах - по ним лаб рисует, куда она встала */
  span: [Vec3, Vec3]
}

export function buildDipTube(options: FlaconOptions = FLACON): DipTube {
  const top: Vec3 = { x: 0, y: TUBE_TOP * options.height, z: 0 }
  const foot: Vec3 = {
    x: 0,
    y: TUBE_FOOT * options.height,
    z: -TUBE_REACH * options.halfDepth,
  }

  const dy = top.y - foot.y
  const dz = top.z - foot.z
  const length = Math.hypot(dy, dz)

  // цилиндр вместо протяжки намеренно: у трубки нет ни фасок, ни переменного
  // радиуса, а гнуть её незачем - она прямая и у настоящего флакона тоже
  const geometry = new CylinderGeometry(
    TUBE_RADIUS * options.halfWidth,
    TUBE_RADIUS * options.halfWidth,
    length,
    14,
    1,
  )
  /**
   * знак поворота здесь не косметика. с минусом трубка вставала зеркально: низ уходил к
   * фасаду, а верх - назад, и на высоте горлышка он оказывался дальше от оси, чем стенка.
   * трубка протыкала плечо и торчала наружу белой чертой
   */
  geometry.rotateX(Math.atan2(dz, dy))
  geometry.translate((top.x + foot.x) / 2, (top.y + foot.y) / 2, (top.z + foot.z) / 2)

  return { geometry, span: [top, foot] }
}

/**
 * чёрный пластик помпы. не чистый чёрный: на 0x000000 деталь схлопывается в силуэт и теряет
 * все рёбра. лёгкая синева в замесе - от той же холодной комнаты, в которой снят весь
 * флакон, а лак поверх матовой основы даёт узкий блик по кромке кнопки. так выглядит
 * дорогой пластик и так он отличается от дешёвого, у которого глянец идёт насквозь
 */
export function createPumpPlastic(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color: 0x121519,
    metalness: 0,
    roughness: 0.38,
    clearcoat: 0.85,
    clearcoatRoughness: 0.17,
    envMapIntensity: 1.1,
  })
}

/**
 * ободок сопла. светлее пластика, а не темнее: чёрное на чёрном не видно вовсе - первый
 * заход был почти в цвет кнопки и попросту пропал. отверстие рисовать нечем и незачем, в
 * дырке кольца видно саму кнопку, и она там как раз тёмная
 */
export function createNozzleMaterial(): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0x4c5158,
    metalness: 0,
    roughness: 0.24,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.2,
  })
  // кольцо лежит на самой стенке кнопки, и без сдвига глубины они мерцают
  material.polygonOffset = true
  material.polygonOffsetFactor = -2
  material.polygonOffsetUnits = -2
  return material
}

/**
 * трубка красится тем же градиентом, что и стекло. это не красивость, а способ её спрятать:
 * ровная тёмная черта поперёк всего флакона тянет на себя взгляд сильнее, чем сама помпа.
 * если трубка в каждой точке того же цвета, что стекло вокруг неё, глаз перестаёт её
 * выделять и она остаётся только на пристальном разглядывании - ровно так это сделано у
 * дорогих домов, которые красят трубку в цвет настоя.
 *
 * материал непрозрачный: transmission в three читает буфер без прозрачных мешей,
 * и прозрачная трубка внутри прозрачного стекла просто не попала бы в кадр
 */
export function createDipTubeMaterial(height: number, tint: FlaconTint): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    // матовая и почти без лака. глянцевая трубка тянет вдоль себя длинный блик,
    // и он выдаёт её вернее любого цвета: глаз ловит именно эту светлую нитку
    roughness: 0.46,
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.9,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBaseTint = { value: tint.base }
    shader.uniforms.uTopTint = { value: tint.top }
    shader.uniforms.uHeight = { value: height }
    shader.uniforms.uFrom = { value: TUBE_BAND[0] }
    shader.uniforms.uTo = { value: TUBE_BAND[1] }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTubeLevel;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTubeLevel = position.y;')

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying float vTubeLevel;
        uniform vec3 uBaseTint;
        uniform vec3 uTopTint;
        uniform float uHeight;
        uniform float uFrom;
        uniform float uTo;
      `,
      )
      /**
       * от стекла берётся оттенок, но не яркость. attenuationColor - это то, во сколько раз
       * стекло гасит проходящий свет, а не то, каким оно выглядит: на экране стекло сильно
       * светлее, потому что сквозь него идёт свет комнаты. покрасить трубку прямо этим
       * цветом значит получить тёмную черту поперёк флакона - ровно то, что мы прячем.
       *
       * поэтому цвет нормируется по яркости и разводится добела: остаётся хвойный
       * тон стекла на нужной высоте, а светлота встаёт вровень с фоном за флаконом
       */
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        float level = clamp( ( vTubeLevel - uHeight * uFrom ) / ( uHeight * ( uTo - uFrom ) ), 0.0, 1.0 );
        vec3 tint = mix( uBaseTint, uTopTint, smoothstep( 0.0, 1.0, level ) );
        float lum = max( dot( tint, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
        diffuseColor.rgb *= mix( vec3( 1.0 ), tint / lum, 0.34 ) * 0.78;
      `,
      )
  }

  material.customProgramCacheKey = () => 'meridian-diptube'
  return material
}

/**
 * тело вращения из профиля. то же, что делает протяжка корпуса, но без сечения: кольца
 * круглые. отдельная функция здесь потому, что LatheGeometry из three считает нормали
 * усреднением по соседям и размазывает ступеньки помпы в один оплывший конус - а вся её
 * читаемость держится именно на ступеньках
 */
function revolve(
  profile: Array<[number, number, number]>,
  options: FlaconOptions,
  segments: number,
): BufferGeometry {
  const outline = roundCorners(
    profile.map(([r, y]) => ({ x: r * options.halfWidth, y: y * options.height })),
    profile.map(([, , radius]) => radius * options.height),
    4,
  )

  const rings: Vec2[] = []
  for (const p of outline) {
    if (p.x <= 1e-4) continue
    const last = rings[rings.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < options.height * 4e-4) continue
    rings.push(p)
  }

  const circle: Vec2[] = []
  for (let i = 0; i < segments; i += 1) {
    const a = (Math.PI * 2 * i) / segments
    circle.push({ x: Math.cos(a), y: Math.sin(a) })
  }

  const loops: Vec3[][] = rings.map((p) =>
    circle.map((c) => ({ x: c.x * p.x, y: p.y, z: c.y * p.x })),
  )
  const normals = loftNormals(loops)

  const positions: number[] = []
  const normalOut: number[] = []

  for (let i = 0; i < loops.length - 1; i += 1) {
    for (let k = 0; k < segments; k += 1) {
      const k2 = (k + 1) % segments
      push(positions, normalOut, loops[i][k], normals[i][k])
      push(positions, normalOut, loops[i + 1][k], normals[i + 1][k])
      push(positions, normalOut, loops[i + 1][k2], normals[i + 1][k2])
      push(positions, normalOut, loops[i][k], normals[i][k])
      push(positions, normalOut, loops[i + 1][k2], normals[i + 1][k2])
      push(positions, normalOut, loops[i][k2], normals[i][k2])
    }
  }

  fan(positions, normalOut, loops[0], { x: 0, y: -1, z: 0 }, false)
  fan(positions, normalOut, loops[loops.length - 1], { x: 0, y: 1, z: 0 }, true)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normalOut), 3))
  geometry.computeBoundingSphere()
  return geometry
}

function fan(pos: number[], nor: number[], ring: Vec3[], axis: Vec3, flip: boolean): void {
  const centre: Vec3 = { x: 0, y: ring[0].y, z: 0 }
  for (let k = 0; k < ring.length; k += 1) {
    const k2 = (k + 1) % ring.length
    push(pos, nor, centre, axis)
    if (flip) {
      push(pos, nor, ring[k2], axis)
      push(pos, nor, ring[k], axis)
    } else {
      push(pos, nor, ring[k], axis)
      push(pos, nor, ring[k2], axis)
    }
  }
}

function push(pos: number[], nor: number[], p: Vec3, n: Vec3): void {
  pos.push(p.x, p.y, p.z)
  nor.push(n.x, n.y, n.z)
}
