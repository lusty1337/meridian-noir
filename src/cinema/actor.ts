import { Group, Material, Mesh, Plane, SRGBColorSpace, Vector3 } from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

import { buildFlaconAssembly, type FlaconAssembly } from '../model/assembly'
import { buildFlaconOutline } from '../model/flacon'
import { STRATA_MAX } from '../model/liquid'
import type { TintRecipe } from '../model/tint'
import { rgbUnit, type Oklch } from '../lib/color'

/**
 * флакон как действующее лицо. сборка та же, что на плите полудня, а сверху три умения,
 * которых у предмета на столе нет: разобраться на детали, налить формулу по слоям и
 * проявиться из чертежа. всё это числа от нуля до единицы - режиссёр ставит их по
 * прокрутке, а актёр только исполняет
 */

/** дно настоя в высотах флакона: ниже него стекло, и столб сжимается к нему, а не к нулю */
const LIQUID_LOW = 0.03

/**
 * на сколько поднимается каждая деталь при разборке, в высотах флакона. трубка уходит
 * целиком над горлышком: пока она внутри, разбор читается как брак сборки, а не как чертёж
 */
const LIFT_CAP = 1.02
const LIFT_COLLAR = 0.2
const LIFT_PUMP = 0.76

/** сколько разобранный флакон занимает в высоту - по этому числу режиссёр отъезжает */
export const EXPLODED_HEIGHT = 1 + LIFT_CAP

/**
 * чертёжная линия - синька, как у настоящего чертежа. марена на бумаге и на тёмном поле
 * указателя читалась одинаково плохо, а у этой светлоты контраст с обоими фонами близкий
 */
const INK: Oklch = { l: 0.66, c: 0.16, h: 244 }

/** толщина линии чертежа в css-пикселях: волосяная в один пиксель пропадала на ретине */
const PEN = 1.6

export type Actor = {
  root: Group
  assembly: FlaconAssembly
  /** 0 - собран, 1 - все детали разведены по вертикали */
  setExplode(e: number): void
  /** 0 - пескоструй, 1 - полировка: на полированном стекле слои формулы видны резко */
  setClarity(c: number): void
  /** доля налива: 1 - как продаётся, 0 - пусто */
  setLevel(level: number): void
  /**
   * слои формулы: толщина каждого в долях полного налива, по порядку заливки. mix - насколько
   * настой разложен на слои; lit - насколько каждый слой сейчас на коже, dim - насколько
   * гаснут остальные
   */
  setStrata(thickness: number[], colors: Oklch[], mix: number, lit: number[], dim: number): void
  /** 0 - нет ничего, до 0.55 чертится контур, дальше по нему нарастает стекло */
  setReveal(r: number): void
  setTint(recipe: TintRecipe): void
  write(label: string): void
  /** обновить плоскости отсечения под нынешнее положение в мире. зовётся перед кадром */
  prepare(): void
  /** размер холста: толстой линии он нужен, чтобы держать толщину в пикселях */
  resize(width: number, height: number): void
  dispose(): void
}

export function createActor(recipe: TintRecipe, label: string): Actor {
  const assembly = buildFlaconAssembly({ recipe, formula: label })
  const { cap, collar, pump, nozzle, tube, liquid, body } = assembly.meshes

  const root = new Group()
  root.add(assembly.group)

  /**
   * две плоскости на актёра. одна режет стекло и всё, что в нём, другая - линии чертежа.
   * three принимает плоскости в мировых координатах, а флакон ездит и наклоняется вместе
   * с камерой, поэтому здесь они хранятся в осях флакона и переносятся в мир перед кадром
   */
  const solidLocal = new Plane(new Vector3(0, -1, 0), 1e3)
  const linesLocal = new Plane(new Vector3(0, -1, 0), 1e3)
  const solid = new Plane()
  const lines = new Plane()

  const materials = new Set<Material>()
  assembly.group.traverse((node) => {
    if (!(node instanceof Mesh)) return
    const list = Array.isArray(node.material) ? node.material : [node.material]
    for (const m of list) materials.add(m)
    if (node.customDepthMaterial) materials.add(node.customDepthMaterial)
  })
  for (const m of materials) {
    m.clippingPlanes = [solid]
    // без этого тень не знает про плоскость: флакона ещё нет, а тень от него уже целая
    m.clipShadows = true
  }

  const ink = new LineMaterial({ linewidth: PEN, transparent: true, opacity: 0, depthWrite: false })
  const [r, g, b] = rgbUnit(INK)
  ink.color.setRGB(r, g, b, SRGBColorSpace)
  ink.clippingPlanes = [lines]
  ink.toneMapped = false

  const outline = buildFlaconOutline()
  const drawn: LineSegments2[] = []
  const pen = (positions: number[], parent: Mesh | Group): LineSegments2 => {
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(positions)
    const line = new LineSegments2(geometry, ink)
    line.renderOrder = 20
    parent.add(line)
    drawn.push(line)
    return line
  }
  // каждый контур висит на своей детали, чтобы при разборке уходить вместе с ней
  pen(outline.body, body)
  pen(outline.cap, cap)
  pen(outline.collar, collar)

  /**
   * линия разреза: горизонталь по фасаду на той высоте, где сейчас нарастает стекло. без
   * неё проявление выглядит как растворение, а с ней - как съёмка прибором, который идёт
   * по предмету снизу вверх
   */
  const scan = pen([-0.36, 0, 0.2, 0.36, 0, 0.2], root)
  scan.renderOrder = 21

  let explode = 0
  let reveal = 1
  let level = 1
  let current = label

  const tall = (): number => 1 + explode * LIFT_CAP + 0.04

  const applyReveal = (): void => {
    root.visible = reveal > 0.001
    const top = tall()
    // линии успевают дочертиться раньше, чем стекло их догонит: на одной высоте
    // стекло закрывало бы контур прямо под пером, и чертежа никто бы не увидел
    const pen = smooth(0, 0.55, reveal) * top
    const glass = smooth(0.35, 1, reveal) * top
    linesLocal.constant = reveal >= 1 ? 1e3 : pen
    solidLocal.constant = reveal >= 1 ? 1e3 : glass
    ink.opacity = 0.9 * (1 - smooth(0.82, 1, reveal))
    for (const e of drawn) e.visible = ink.opacity > 0.01
    scan.visible = reveal > 0.35 && reveal < 0.995
    scan.position.y = glass
  }

  applyReveal()

  return {
    root,
    assembly,

    setExplode(e) {
      if (e === explode) return
      explode = e
      /**
       * детали уходят по очереди, а не разом: крышку снимают первой, потом кольцо, и только
       * тогда вынимается помпа с трубкой. одновременный подъём читается взрывом, очерёдный -
       * разборкой руками
       */
      cap.position.y = smooth(0, 0.45, e) * LIFT_CAP
      /**
       * поднятая крышка тени не кладёт. на высоте в целый флакон её тень падала на пол далеко
       * в стороне, серым пятном у процентов, и читалась грязью на столе, а не крышкой. пока
       * она ниже пары сантиметров, её тень ещё внутри тени корпуса и пропадает незаметно
       */
      cap.castShadow = e < 0.06
      collar.position.y = smooth(0.2, 0.6, e) * LIFT_COLLAR
      const out = smooth(0.35, 1, e) * LIFT_PUMP
      pump.position.y = out
      nozzle.position.y = out
      tube.position.y = out
      applyReveal()
    },

    setClarity(c) {
      const { glass, capGlass } = assembly.materials
      glass.roughness = 0.33 + (0.07 - 0.33) * c
      capGlass.roughness = 0.1 + (0.05 - 0.1) * c
    },

    setLevel(next) {
      const l = Math.max(0, Math.min(1, next))
      if (l === level) return
      level = l
      liquid.visible = l > 0.004
      liquid.scale.y = Math.max(l, 0.004)
      liquid.position.y = LIQUID_LOW * (1 - liquid.scale.y)
    },

    setStrata(thickness, colors, mix, lit, dim) {
      const strata = assembly.strata
      strata.mix.value = mix
      for (let i = 0; i < STRATA_MAX; i += 1) strata.lit.value[i] = lit[i] ?? 0
      strata.dim.value = dim
      if (mix <= 0) return
      const total = thickness.reduce((sum, t) => sum + t, 0)
      let sum = 0
      for (let i = 0; i < STRATA_MAX; i += 1) {
        sum += thickness[i] ?? 0
        strata.edges.value[i] = total > 0 ? Math.min(1, sum / total) : 1
        const tone = colors[Math.min(i, colors.length - 1)]
        if (tone) {
          const [cr, cg, cb] = rgbUnit(tone)
          strata.colors.value[i].setRGB(cr, cg, cb, SRGBColorSpace)
        }
      }
    },

    setReveal(r) {
      const next = Math.max(0, Math.min(1, r))
      if (next === reveal) return
      reveal = next
      applyReveal()
    },

    setTint(next) {
      assembly.tint.apply(next)
    },

    write(next) {
      if (next === current) return
      current = next
      assembly.write(next)
    },

    resize(width, height) {
      ink.resolution.set(width, height)
    },

    prepare() {
      if (!root.visible) return
      root.updateWorldMatrix(true, false)
      solid.copy(solidLocal).applyMatrix4(root.matrixWorld)
      lines.copy(linesLocal).applyMatrix4(root.matrixWorld)
    },

    dispose() {
      for (const e of drawn) e.geometry.dispose()
      ink.dispose()
      assembly.dispose()
    },
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
