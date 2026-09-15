import {
  BackSide,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three'

/**
 * съёмочная комната, написанная кодом. стеклу нужна среда: без неё отражать нечего, и
 * матовое стекло выходит серым пластиком. обычно её берут из .hdr на десяток мегабайт -
 * здесь её негде взять и незачем: сцена из купола с градиентом и трёх светящихся
 * прямоугольников прогоняется через PMREM один раз при запуске и даёт ту же карту
 * окружения.
 *
 * комната не абстрактная. это мастерская в Марселе в солнечный полдень: окно
 * слева-сверху, побелённая стена напротив, светлый стол под флаконом. те же
 * условия, в которых дом срезает сырьё, и та же палитра, что у страницы
 */

export type Studio = {
  environment: Texture
  lights: Group
  /** направление на окно. по нему же выставлен ключевой источник и падает тень */
  keyDirection: [number, number, number]
  dispose(): void
}

/**
 * окно, стена напротив, отскок от стола - в линейных единицах. первая сборка стояла втрое
 * ярче, и на ACES всё уезжало в белое: форма пропадала целиком, оставался силуэт. яркость
 * среды подбирается по тому, видно ли фаску. стена стоит ЗА флаконом и светит сильно не для
 * красоты: сквозь матовое стекло видно ровно то, что за ним. пока она была сбоку и тусклой,
 * проходить свету было неоткуда, и стекло читалось плотным телом
 */
const PANELS: Array<{
  size: [number, number]
  position: [number, number, number]
  colour: [number, number, number]
}> = [
  { size: [7, 5], position: [-4.6, 5.4, 4.8], colour: [3.1, 3, 2.85] },
  { size: [12, 8], position: [1.2, 2, -6.2], colour: [2.2, 2.18, 2.1] },
  { size: [11, 7], position: [0, -3.4, 1.8], colour: [0.24, 0.27, 0.31] },
]

const KEY_DIRECTION: [number, number, number] = [-4.6, 5.4, 4.8]

export function buildStudio(renderer: WebGLRenderer): Studio {
  const pmrem = new PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()

  const room = new Scene()
  const dome = new Mesh(new SphereGeometry(12, 32, 24), domeMaterial())
  room.add(dome)

  const panelGeometry = new PlaneGeometry(1, 1)
  const panels: Mesh[] = []
  for (const panel of PANELS) {
    const material = new MeshBasicMaterial()
    material.color.setRGB(...panel.colour)
    const mesh = new Mesh(panelGeometry, material)
    mesh.scale.set(panel.size[0], panel.size[1], 1)
    mesh.position.set(...panel.position)
    mesh.lookAt(0, 0, 0)
    room.add(mesh)
    panels.push(mesh)
  }

  const target = pmrem.fromScene(room, 0.04)

  // сцена нужна была только чтобы её один раз сняли - дальше живёт только текстура
  dome.geometry.dispose()
  ;(dome.material as ShaderMaterial).dispose()
  panelGeometry.dispose()
  for (const mesh of panels) (mesh.material as MeshBasicMaterial).dispose()
  pmrem.dispose()

  return {
    environment: target.texture,
    lights: buildLights(),
    keyDirection: KEY_DIRECTION,
    dispose: () => target.dispose(),
  }
}

/**
 * карта окружения освещает, но тени не даёт - её свет приходит отовсюду сразу.
 * жёсткая тень на столе нужна отдельным источником, и стоять он обязан там же,
 * где окно, иначе блик и тень указывают в разные стороны и сцена разваливается
 */
function buildLights(): Group {
  const group = new Group()

  const key = new DirectionalLight(0xfff4e6, 1.45)
  key.position.set(...KEY_DIRECTION)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 14
  /**
   * рамка теневой камеры считается в системе самого источника, а не сцены.
   * снизу она стояла на -0.5, и тень, которая уходит от света назад-вправо, за
   * эту границу вылезала: на столе оставался огрызок, и казалось, что тени нет
   * вовсе. 1.6 хватает на всю длину пятна при 2048 на кадр в три единицы
   */
  key.shadow.camera.left = -1.3
  key.shadow.camera.right = 1.3
  key.shadow.camera.top = 1.6
  key.shadow.camera.bottom = -1.6
  // без этого рамка не применяется вовсе: OrthographicCamera считает матрицу
  // проекции в конструкторе, а DirectionalLightShadow заводит её на пять единиц
  // в каждую сторону. все значения выше молча лежали мёртвым грузом, и тень
  // рисовалась картой 2048 на десять единиц вместо трёх
  key.shadow.camera.updateProjectionMatrix()
  /**
   * у VSM сдвиг работает иначе, чем у PCF: карта хранит два момента, и лишний
   * bias только отрывает тень от предмета. держим его на нуле, а акне снимаем
   * сдвигом по нормали - для плоского стола этого хватает
   */
  key.shadow.bias = 0
  key.shadow.normalBias = 0.004
  // радиус тут в текселях гаусса, а не в отсчётах PCF. на пяти тень расплывалась
  // в пятно без формы: 3.5 оставляет кромку мягкой, но силуэт флакона в ней
  // всё-таки узнаётся
  key.shadow.radius = 3.5
  key.shadow.blurSamples = 16
  group.add(key)

  // холодная подсветка теневой стороны: небо за окном, а не второй прожектор
  const skyFill = new DirectionalLight(0xbfd4e4, 0.32)
  skyFill.position.set(3.4, 2.6, -1.2)
  group.add(skyFill)

  return group
}

function domeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      sky: { value: new Color().setRGB(0.3, 0.34, 0.4) },
      horizon: { value: new Color().setRGB(0.52, 0.51, 0.48) },
      ground: { value: new Color().setRGB(0.11, 0.13, 0.16) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /**
     * степени 0.55 и 0.7 держат светлую полосу у горизонта узкой.
     * на линейной смеси купол читается как ровная заливка, и в стекле не остаётся
     * ни одной горизонтали, за которую цепляется глаз
     */
    fragmentShader: /* glsl */ `
      uniform vec3 sky;
      uniform vec3 horizon;
      uniform vec3 ground;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = h > 0.0
          ? mix(horizon, sky, pow(h, 0.55))
          : mix(horizon, ground, pow(-h, 0.7));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  })
}
