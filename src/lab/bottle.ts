import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  GridHelper,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  VSMShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js'

import { buildFlaconAssembly } from '../model/assembly'
import { FLACON } from '../model/flacon'
import { buildStudio } from '../model/studio'
import './lab.css'

/**
 * страница для разработки модели: только флакон, только вращение.
 * с основного сайта на неё нет ни одной ссылки - она нужна, чтобы судить форму
 * до того, как та начнёт тащить на себе сцену
 *
 * материал здесь намеренно глиняный. стекло прощает кривое плечо, глина - нет,
 * и пока форма не принята, любой блик от стекла только мешает смотреть
 */

const stage = document.querySelector<HTMLElement>('[data-stage]')
const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]')
if (!stage || !canvas) throw new Error('lab: нет холста')

// холст с альфой, фон рисует CSS: так стенд остаётся в палитре сайта, а не
// в чёрном прямоугольнике, и заголовок поверх него читается
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = 0.92
renderer.shadowMap.enabled = true
/**
 * VSM, а не PCF. полутень от стекла набрана выброшенными текселями, и PCF её не усредняет:
 * он берёт девять отсчётов рядом, узор 4x4 в них попадает целыми клетками, и на столе идут
 * пятна вместо ровной тени. VSM размывает саму карту гауссом в два прохода до того, как её
 * кто-то прочитает, - решётка растворяется, а заодно тень получает честную мягкую кромку,
 * которой у направленного PCF не бывает
 */
renderer.shadowMap.type = VSMShadowMap

const scene = new Scene()
// длинный объектив, как в предметной съёмке: на 38 мм у флакона разъезжаются
// вертикали и низ выглядит шире верха, хотя корпус прямой
const camera = new PerspectiveCamera(27, 1, 0.05, 40)
camera.position.set(1.42, 1.05, 2.05)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 0.55
controls.maxDistance = 7
controls.target.set(0, FLACON.height * 0.5, 0)

const flaconParts = buildFlaconAssembly()
const {
  meshes: {
    body: flacon,
    cap: capMesh,
    collar: collarMesh,
    liquid: liquidMesh,
    pump: pumpMesh,
    nozzle: nozzleMesh,
    tube: tubeMesh,
    label: labelMesh,
  },
  materials: { glass, capGlass, metal, plastic, liquid, tube: tubeMaterial },
  shadows: { body: bodyShadow, cap: capShadow, parts: partsShadow },
  motion: liquidMotion,
} = flaconParts

// глина с чуть заметным отражением: судить свет по абсолютно матовой поверхности
// нельзя, она показывает только направление и ничего про среду
const clay = new MeshStandardMaterial({
  color: 0xa8b8c4,
  roughness: 0.42,
  metalness: 0,
  envMapIntensity: 0.9,
})
// кольцо и крышка временно чуть темнее корпуса: на одинаковой глине стык между
// ними не читается, а судить надо именно посадку
const clayDark = new MeshStandardMaterial({
  color: 0x8b9dab,
  roughness: 0.3,
  metalness: 0,
  envMapIntensity: 1,
})

const model = flaconParts.group
scene.add(model)

const normalsHelper = new VertexNormalsHelper(flacon, 0.02, 0xc52327)
normalsHelper.visible = false
scene.add(normalsHelper)

/**
 * стол непрозрачный, и это обязательное условие, а не оформление. transmission берёт свет
 * из буфера, в который сцена отрисована без прозрачных мешей. пока тень ловила невидимая
 * плоскость с ShadowMaterial, в этот буфер за флаконом не попадало ничего: ни стола, ни
 * горизонта, ни собственной тени. сквозь стекло было видно ровную заливку фона, и оно
 * читалось глухим телом. настоящая поверхность даёт стеклу что пропускать
 */
/**
 * стол должен светить сам, иначе тени не выйдет. комната освещает его со всех сторон, и
 * вклад ключевого источника на её фоне теряется: в тени оставалось девять десятых
 * освещённости, пятна не было видно ни глазом, ни пипеткой.
 *
 * подкрутить долю через envMapIntensity не получается: в three 185 это число
 * работает только у материала со своей картой окружения, а на scene.environment
 * действует лишь scene.environmentIntensity, общая на всю сцену. поэтому карту
 * отдаём столу в руки - тогда множитель начинает слушаться, и стол можно увести
 * в полумрак, не трогая флакон.
 *
 * дальше доля считается вручную: свечение и приглушённая среда держат тень, а
 * ключевой добавляет сверху. замерено пипеткой: освещённый стол 207, самое
 * тёмное место тени 110 - это под настоем, где свет действительно не проходит.
 * под пустым стеклом тень заметно бледнее, и ровно в этом всё дело
 */
const floorMaterial = new MeshStandardMaterial({
  color: 0xdde5ea,
  roughness: 0.96,
  metalness: 0,
  envMapIntensity: 0.22,
  emissive: 0xb9c9d6,
  emissiveIntensity: 0.62,
})

const floor = new Mesh(
  // стол уходит за горизонт намеренно: у плоскости 14 на 14 дальний край падает
  // ниже уровня глаз, и линия стола проходила ровно за настоем, где её не видно.
  // на сорока метрах край встаёт на высоту камеры и пересекает пустое стекло
  new PlaneGeometry(40, 40),
  floorMaterial,
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

const grid = new GridHelper(6, 24, 0x8a9aa6, 0xb9c6cf)
const gridMaterial = grid.material as LineBasicMaterial
gridMaterial.transparent = true
gridMaterial.opacity = 0.5
scene.add(grid)

const studio = buildStudio(renderer)
scene.environment = studio.environment
floorMaterial.envMap = studio.environment
scene.add(studio.lights)

/**
 * фон обязателен, а не декоративен. transmission в three читает буфер, куда сцена
 * отрисована БЕЗ прозрачных мешей. при пустом фоне за флаконом там нет ничего, стеклу
 * нечего пропускать, и оно выглядит плотным телом. ровное светлое поле даёт ему свет,
 * который видно насквозь
 */
const backdrop = new Color(0xccd9e1)
scene.background = backdrop

const size = flaconParts.size

const stat = (name: string, value: string): void => {
  const el = document.querySelector(`[data-stat="${name}"]`)
  if (el) el.textContent = value
}
const triangles = flaconParts.triangles
stat('tris', triangles.toLocaleString('en-US'))
stat('size', `${size.y.toFixed(3)} × ${size.x.toFixed(3)} × ${size.z.toFixed(3)}`)

let spinning = false
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

document.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((input) => {
  const apply = (): void => {
    const on = input.checked
    switch (input.dataset.toggle) {
      case 'wireframe':
        clay.wireframe = on
        clayDark.wireframe = on
        break
      case 'label':
        labelMesh.visible = on
        break
      case 'clay':
        // глина остаётся под рукой: форму по стеклу не судят, блики врут
        flacon.material = on ? clay : glass
        capMesh.material = on ? clayDark : capGlass
        collarMesh.material = on ? clayDark : metal
        pumpMesh.material = on ? clayDark : plastic
        // глина непрозрачна, полутень от неё была бы враньём
        flacon.customDepthMaterial = on ? undefined : bodyShadow
        capMesh.customDepthMaterial = on ? undefined : capShadow
        pumpMesh.customDepthMaterial = on ? undefined : partsShadow
        collarMesh.customDepthMaterial = on ? undefined : partsShadow
        nozzleMesh.visible = !on
        liquidMesh.visible = !on
        // на глине трубку не видно всё равно - корпус непрозрачный
        tubeMesh.visible = !on
        break
      case 'normals':
        normalsHelper.visible = on
        break
      case 'room':
        scene.background = on ? studio.environment : backdrop
        break
      case 'ground':
        grid.visible = on
        floor.visible = on
        break
      case 'spin':
        spinning = on
        break
    }
  }
  input.addEventListener('change', apply)
  apply()
})

/**
 * фиксированные ракурсы. форму судят с одних и тех же точек, иначе каждый
 * следующий скриншот сравнивать не с чем: чуть довернул - и плечо "стало лучше"
 */
const VIEWS: Record<string, [number, number, number]> = {
  'three-quarter': [1.42, 1.05, 2.05],
  front: [0, 0.55, 2.6],
  side: [2.6, 0.55, 0],
  top: [0.01, 2.6, 0.62],
  // низ смотрим отдельно: во вступительной анимации флакон поворачивается,
  // и донная выемка видна не хуже фасада
  bottom: [0.42, -1.85, 1.6],
}

function look(name: string): void {
  const v = VIEWS[name]
  if (!v) return
  // пол стал непрозрачным, и снизу сквозь него ничего не видно. галочку гасим
  // сами, иначе кнопка UNDER показывает изнанку стола
  const ground = document.querySelector<HTMLInputElement>('[data-toggle="ground"]')
  if (name === 'bottom' && ground?.checked) {
    ground.checked = false
    ground.dispatchEvent(new Event('change'))
  }
  camera.position.set(v[0], v[1], v[2])
  controls.target.set(0, name === 'bottom' ? FLACON.height * 0.12 : FLACON.height * 0.5, 0)
  controls.update()
}

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => look(button.dataset.view ?? ''))
})

// толчок по жидкости: ровное вращение её не качает, качает рывок
document.querySelector('[data-nudge]')?.addEventListener('click', () => {
  liquidMotion.nudge(0.42, 0.16)
})

const ORDER = ['three-quarter', 'front', 'side', 'top', 'bottom']
addEventListener('keydown', (event) => {
  if (event.key === 'r' || event.key === 'R') look('three-quarter')
  const index = Number(event.key) - 1
  if (index >= 0 && index < ORDER.length) look(ORDER[index])
})

// размер берём с контейнера, а не с окна: на мобильных адресная строка меняет
// innerHeight на каждом движении, а коробка холста при этом стоит на месте
const resize = (): void => {
  const w = stage.clientWidth
  const h = stage.clientHeight
  if (!w || !h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(stage)
resize()

const clock = new Clock()
let frames = 0
// счётчик стартует от текущего времени: с нуля первое же деление берёт весь
// возраст страницы за интервал и показывает единицу вместо шестидесяти
let fpsAt = performance.now()
let running = true

function tick(): void {
  if (!running) return
  requestAnimationFrame(tick)

  const dt = clock.getDelta()
  const spin = spinning && !reducedMotion.matches ? 0.42 : 0
  model.rotation.y += dt * spin
  liquidMotion.update(dt, spin)

  controls.update()
  if (normalsHelper.visible) normalsHelper.update()
  renderer.render(scene, camera)

  frames += 1
  const now = performance.now()
  if (now - fpsAt >= 500) {
    stat('fps', Math.round((frames * 1000) / (now - fpsAt)).toString())
    stat('calls', renderer.info.render.calls.toString())
    frames = 0
    fpsAt = now
  }
}
tick()

// вкладка в фоне не рисует: контекст держать надо, кадры - нет
document.addEventListener('visibilitychange', () => {
  running = !document.hidden
  if (running) {
    clock.getDelta()
    tick()
  }
})

// стенд отладочный: свет и материалы подбираются с консоли, а не пересборкой.
// на боевой странице этого нет и не будет - там окно чужое
;(window as unknown as Record<string, unknown>).lab = {
  renderer,
  scene,
  camera,
  controls,
  floor,
  grid,
  model,
  studio,
  materials: { glass, capGlass, metal, liquid, plastic, tubeMaterial },
}
