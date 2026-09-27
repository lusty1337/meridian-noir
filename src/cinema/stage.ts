import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  VSMShadowMap,
  WebGLRenderer,
} from 'three'

import { isCoarsePointer } from '../lib/motion'
import { onLowPower } from '../lib/quality'
import { halveShadow } from '../model/shadow'
import { buildStudio, type Studio } from '../model/studio'
import { createActor, type Actor } from './actor'
import type { TintRecipe } from '../model/tint'

/**
 * съёмочная площадка всей страницы: один холст, одна камера, одно солнце. у каждой секции
 * свой план со своими флаконами, прибитый к её месту в вёрстке, и за кадр рисуется столько
 * планов, сколько сейчас видно - обычно один, на стыке секций два. план за пределами окна
 * не стоит ничего: его просто нет в кадре.
 *
 * камера длиннофокусная и не двигается. ракурс меняет не она, а сама площадка: её
 * наклоняют к объективу вместе со светом и полом. для глаза разницы нет, а для счёта
 * это одна матрица вместо камеры, которую пришлось бы наводить на цель.
 *
 * крупность тоже даёт не масштаб, а расстояние: площадка отъезжает от объектива. масштаб
 * тут нельзя - three считает путь луча сквозь стекло с учётом масштаба модели, и
 * увеличенный флакон на глазах густел до синего пластика
 */

/**
 * угол зрения по вертикали. шесть градусов - это уже почти ортография: флакон на крупном
 * плане стоял в трёх своих высотах от объектива, и широкий угол разваливал его - дальняя
 * грань уезжала, крышка смотрела вбок. на этом угле камера отходит вчетверо дальше, и
 * силуэт остаётся тем же, что на плите полудня
 */
const FOV = 6
/** солнце далеко: на таком плече конус прожектора почти параллелен */
const SUN_DISTANCE = 24

export type Placement = {
  /** где основание в окне, css-пиксели */
  x: number
  base: number
  /** пикселей на высоту флакона */
  k: number
  /** наклон площадки к объективу, радианы */
  pitch: number
}

export type Sun = {
  /** откуда светит: азимут от объектива вправо и высота над полом, радианы */
  az: number
  el: number
  color: [number, number, number]
  intensity: number
  /** сколько даёт комната - отражения и заполняющий свет */
  env: number
}

export type Shade = {
  opacity: number
  /** радиус пола в высотах флакона - столько, сколько нужно самой длинной тени */
  reach: number
  /** где середина пола по горизонтали, в высотах флакона */
  centre: number
  /**
   * граница, за которую тень не заходит: меридиан в css-пикселях и сторона, где стоит
   * флакон, 1 - слева, -1 - справа. без неё низкое солнце тянуло тень через линию под
   * текст соседней колонки
   */
  fence?: { x: number; side: number }
}

/** один план: какие флаконы, где на экране, какая под ними тень и что за стеклом */
export type Shot = {
  actors: Actor[]
  place: Placement
  shade: Shade
  backdrop: [number, number, number]
}

export type CinemaStage = {
  actors: Actor[]
  resize(): void
  /** солнце одно на все планы: оно поворачивается по прокрутке, а не прыгает между ними */
  render(shots: Shot[], sun: Sun): void
  warm(): Promise<void>
  /** стереть холст сразу, в той же задаче: кадр прогрева не должен дойти до экрана */
  clear(): void
  /** контекст вернули после потери - кадр надо нарисовать заново, даже без движения */
  onRestore(fn: () => void): void
  dispose(): void
}

export function createCinemaStage(
  canvas: HTMLCanvasElement,
  cast: Array<{ recipe: TintRecipe; label: string }>,
): CinemaStage | null {
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch {
    return null
  }

  const coarse = isCoarsePointer()
  /**
   * холст на всё окно, поэтому плотность ниже, чем у маленького холста на плите. стекло всё
   * равно ужимается браузером и усредняется, а полтора - это ещё суперсэмплинг на обычном
   * мониторе и уже без разорительных четырёх пикселей на точку на ретине
   */
  renderer.setPixelRatio(coarse ? Math.min(devicePixelRatio, 1.75) : Math.min(Math.max(devicePixelRatio, 1.5), 2))
  // просвет считается в полном размере: в половине зеркало настоя приходило ступенями
  renderer.transmissionResolutionScale = coarse ? 0.85 : 1
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.localClippingEnabled = true
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = VSMShadowMap
  renderer.setClearColor(0x000000, 0)
  // холст чистится один раз за кадр, а планы рисуются поверх друг друга
  renderer.autoClear = false

  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, 1, 0.5, 900)
  scene.add(camera)

  /** площадка: пол, свет и актёры. наклоняется целиком, поэтому свет стоит там же, где пол */
  const set = new Group()
  scene.add(set)

  const actors = cast.map(({ recipe, label }) => createActor(recipe, label))

  let studio: Studio | null = buildStudio(renderer)
  scene.environment = studio.environment

  /**
   * телефон отбирает контекст, когда вкладка долго лежит в фоне или кончается память. three
   * сам просит его обратно и заново заводит программы и буферы, но комната снята в текстуру
   * на видеокарте и пропадает вместе с ней - стекло вернулось бы тёмным
   */
  let restored = (): void => {}
  canvas.addEventListener('webglcontextrestored', () => {
    // старую комнату не освобождаем: её буферы ушли вместе с тем контекстом
    studio = buildStudio(renderer)
    scene.environment = studio.environment
    restored()
  })

  /**
   * солнце - прожектор: у направленного света рамка теней натягивается на всю сцену, а
   * конус можно обжать по флаконам и их тени. плечо большое, и на нём конус почти не
   * расходится
   */
  const sun = new SpotLight(0xffffff, 2, 0, 0.3, 0, 0)
  sun.castShadow = true
  const mapSize = coarse ? 1024 : 2048
  sun.shadow.mapSize.set(mapSize, mapSize)
  sun.shadow.bias = 0
  sun.shadow.normalBias = 0.004
  sun.shadow.radius = 4
  sun.shadow.blurSamples = coarse ? 8 : 16
  onLowPower(() => halveShadow(sun.shadow))
  const aim = new Object3D()
  set.add(sun, aim)
  sun.target = aim

  // небо в тени: холодный заполняющий, а не второе солнце
  const sky = new DirectionalLight(0xbfd4e4, 0.3)
  sky.position.set(2.4, 3, -1.6)
  set.add(sky)

  /**
   * пол существует только ради тени. он прозрачный, и к краю тень гаснет по кругу: у
   * холста поверх страницы нет стола, в который пол мог бы упереться, и ровная кромка
   * читалась бы листом стекла, положенным на сайт
   */
  const floorMaterial = new ShadowMaterial({ opacity: 0.3, transparent: true, depthWrite: false })
  // x - граница в пикселях буфера, y - сторона флакона, z - ширина, на которой тень гаснет
  const fence = { value: new Vector3(0, 0, 1) }
  const shadowOut = 'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );'
  floorMaterial.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes(shadowOut)) {
      console.warn('cinema: в ShadowMaterial не нашлось строки для края пола')
      return
    }
    shader.uniforms.uFence = fence
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vFloor;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloor = position.xy;')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec2 vFloor;\nuniform vec3 uFence;\nvoid main() {')
      .replace(
        shadowOut,
        /* glsl */ `float edge = 1.0 - smoothstep( 0.22, 0.5, length( vFloor ) );
	// тень гаснет, не доходя до меридиана, и к самой линии её уже нет
	float fence = uFence.y == 0.0 ? 1.0 : 1.0 - smoothstep( -uFence.z, 0.0, ( gl_FragCoord.x - uFence.x ) * uFence.y );
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) * edge * fence );`,
      )
  }
  floorMaterial.color.setRGB(0.07, 0.13, 0.21, SRGBColorSpace)
  const floor = new Mesh(new PlaneGeometry(1, 1), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  set.add(floor)

  /**
   * подложка под стекло. просвет в three читает кадр без прозрачных мешей, а за холстом
   * страница, которую WebGL не видит: без подложки стекло преломляло бы пустоту и выходило
   * тёмным телом. подложка - цвет той секции, над которой сейчас флакон, и видна она только
   * проходу просвета
   */
  const backdropMaterial = new MeshBasicMaterial({ toneMapped: false, depthWrite: false, depthTest: false })
  const backdrop = new Mesh(new PlaneGeometry(1, 1), backdropMaterial)
  backdrop.renderOrder = -1
  backdrop.position.z = -800
  backdrop.onBeforeRender = (r) => {
    backdropMaterial.colorWrite = r.getRenderTarget() !== null
  }
  camera.add(backdrop)

  let width = 0
  let height = 0

  const resize = (): void => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w === width && h === height) return
    width = w
    height = h
    renderer.setSize(w, h, false)
    for (const actor of actors) actor.resize(w, h)
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
    const tall = 2 * 800 * Math.tan((FOV * Math.PI) / 360)
    backdrop.scale.set(tall * camera.aspect * 1.1, tall * 1.1, 1)
  }
  resize()

  const spread = 2 * Math.tan((FOV * Math.PI) / 360)

  return {
    actors,
    resize,

    render(shots, light) {
      if (width < 2 || height < 2) return
      renderer.clear()
      sun.color.setRGB(light.color[0], light.color[1], light.color[2], SRGBColorSpace)
      sun.intensity = light.intensity
      scene.environmentIntensity = light.env
      const dir = {
        x: Math.sin(light.az) * Math.cos(light.el),
        y: Math.sin(light.el),
        z: Math.cos(light.az) * Math.cos(light.el),
      }

      for (const shot of shots) {
        // флаконы у планов общие, пока планы не видны вместе: актёр переезжает на
        // площадку того плана, который сейчас снимают
        for (const actor of actors) if (actor.root.parent === set) set.remove(actor.root)
        for (const actor of shot.actors) set.add(actor.root)

        const { place, shade } = shot
        // флакон высотой в единицу занимает k пикселей ровно на этой глубине
        const depth = height / (spread * Math.max(1, place.k))
        const u = place.k
        set.position.set((place.x - width / 2) / u, (height / 2 - place.base) / u, -depth)
        set.rotation.x = place.pitch

        /**
         * конус солнца обязан накрыть и флаконы, и всю их тень. на закатном солнце тень
         * длиннее флакона раз в десять, и конус под одни флаконы обрезал бы её на полпути
         */
        const reach = Math.max(1.5, shade.reach)
        aim.position.set(shade.centre, 0.4, 0)
        sun.position.set(
          shade.centre + dir.x * SUN_DISTANCE,
          0.4 + dir.y * SUN_DISTANCE,
          dir.z * SUN_DISTANCE,
        )
        sun.angle = Math.min(1.2, Math.atan((reach + 0.6) / SUN_DISTANCE) * 1.15)
        sun.shadow.camera.near = Math.max(0.1, SUN_DISTANCE - reach - 3)
        sun.shadow.camera.far = SUN_DISTANCE + reach + 3
        sun.shadow.camera.updateProjectionMatrix()

        floor.scale.set(reach * 2, reach * 2, 1)
        floor.position.x = shade.centre
        floorMaterial.opacity = shade.opacity
        floor.visible = shade.opacity > 0.002
        const ratio = renderer.getPixelRatio()
        fence.value.set((shade.fence?.x ?? 0) * ratio, shade.fence?.side ?? 0, 40 * ratio)

        backdropMaterial.color.setRGB(shot.backdrop[0], shot.backdrop[1], shot.backdrop[2], SRGBColorSpace)

        scene.updateMatrixWorld()
        for (const actor of shot.actors) actor.prepare()
        // глубина от прошлого плана не должна закрывать этот - они на разных глубинах
        renderer.clearDepth()
        renderer.render(scene, camera)
      }
    },

    async warm() {
      /**
       * программы собираются заранее, и все сразу. compile в three обходит только видимое, а
       * четыре флакона из пяти до указателя спрятаны: без этого каждый собирал бы свой
       * просвет в тот момент, когда впервые чертится на глазах у зрителя
       */
      for (const a of actors) {
        set.add(a.root)
        a.setReveal(0.6)
        a.prepare()
      }
      await renderer.compileAsync(scene, camera)
      renderer.render(scene, camera)
      renderer.clear()
      for (const a of actors) {
        a.setReveal(1)
        set.remove(a.root)
      }
    },

    clear() {
      renderer.clear()
    },

    onRestore(fn) {
      restored = fn
    },

    dispose() {
      for (const actor of actors) actor.dispose()
      floor.geometry.dispose()
      floorMaterial.dispose()
      backdrop.geometry.dispose()
      backdropMaterial.dispose()
      studio?.dispose()
      studio = null
      renderer.dispose()
    },
  }
}
