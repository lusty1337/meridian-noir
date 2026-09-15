import { Box3, BufferGeometry, Group, Material, Mesh, Vector3 } from 'three'
import type { MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'

import {
  buildFlaconBody,
  buildFlaconCap,
  buildFlaconCollar,
  buildFlaconLiquid,
  FLACON,
  LIQUID_FILL,
  type FlaconOptions,
} from './flacon'
import { createCollarMetal, createGlass } from './glass'
import { createTint, HOUSE_TINT, type FlaconTint, type TintRecipe } from './tint'
import { buildLabel } from './label'
import { createLiquid, type LiquidMotion } from './liquid'
import {
  buildDipTube,
  buildNozzle,
  buildPump,
  createDipTubeMaterial,
  createNozzleMaterial,
  createPumpPlastic,
} from './pump'
import { createGlassShadow } from './shadow'

/**
 * собранный флакон - восемь мешей, семь материалов и порядок, в котором их складывают. до
 * этого сборка жила прямо в стенде, и когда флакон понадобился ещё и на странице,
 * копировать её было нельзя: разъехались бы в первый же день. здесь лежит только сборка,
 * без сцены, света и камеры - их каждая площадка ставит себе сама, у стенда и у сцены
 * полудня они разные
 */

type Physical = Mesh<BufferGeometry, Material>

export type FlaconAssembly = {
  group: Group
  meshes: {
    body: Physical
    cap: Physical
    collar: Physical
    liquid: Physical
    pump: Physical
    nozzle: Physical
    tube: Physical
    label: Mesh
  }
  materials: {
    glass: MeshPhysicalMaterial
    capGlass: MeshPhysicalMaterial
    metal: MeshStandardMaterial
    plastic: MeshPhysicalMaterial
    nozzle: MeshPhysicalMaterial
    tube: MeshPhysicalMaterial
    liquid: MeshPhysicalMaterial
  }
  /** полутени стекла - стенду они нужны отдельно, чтобы гасить их на глине */
  shadows: { body: MeshDepthMaterial; cap: MeshDepthMaterial; parts: MeshDepthMaterial }
  motion: LiquidMotion
  /**
   * цвет флакона. четыре объекта Color, на которые смотрят юниформы стекла, трубки
   * и настоя: перекрасить формулу - это записать в них другие числа
   */
  tint: FlaconTint
  /** перебить формулу на этикетке */
  write(formula: string): void
  /** резолвится, когда шрифты доехали и надпись перерисована */
  labelReady: Promise<void>
  triangles: number
  size: Vector3
  dispose(): void
}

export type AssemblyOptions = {
  shape?: FlaconOptions
  recipe?: TintRecipe
  /** формула на этикетке: имя и минута среза */
  formula?: string
}

export function buildFlaconAssembly({
  shape: options = FLACON,
  recipe = HOUSE_TINT,
  formula = 'Cypress 12:04',
}: AssemblyOptions = {}): FlaconAssembly {
  const tint = createTint(recipe)
  const bodyGeometry = buildFlaconBody(options)
  const capGeometry = buildFlaconCap(options)
  const collarGeometry = buildFlaconCollar(options)
  const liquidGeometry = buildFlaconLiquid(options)
  const pumpGeometry = buildPump(options)
  const nozzleGeometry = buildNozzle(options)
  const tube = buildDipTube(options)

  const glass = createGlass({ height: options.height, tint })
  // крышка полирована сильнее корпуса: у настоящего флакона она из литого стекла,
  // а корпус пескоструят
  const capGlass = createGlass({ height: options.height, roughness: 0.1, thickness: 0.056, tint })
  const metal = createCollarMetal()
  const plastic = createPumpPlastic()
  const nozzleMaterial = createNozzleMaterial()
  const tubeMaterial = createDipTubeMaterial(options.height, tint)
  const { material: liquidMaterial, motion } = createLiquid(LIQUID_FILL * options.height, tint)

  const body: Physical = new Mesh(bodyGeometry, glass)
  const cap: Physical = new Mesh(capGeometry, capGlass)
  const collar: Physical = new Mesh(collarGeometry, metal)
  const liquid: Physical = new Mesh(liquidGeometry, liquidMaterial)
  const pump: Physical = new Mesh(pumpGeometry, plastic)
  const nozzle: Physical = new Mesh(nozzleGeometry, nozzleMaterial)
  const tubeMesh: Physical = new Mesh(tube.geometry, tubeMaterial)
  for (const m of [body, cap, collar, liquid, pump]) m.castShadow = true

  /**
   * корпус и крышка кладут на стол полутень, всё остальное - полную. доли не с потолка. на
   * 0.34 стекло почти не давало тени, зато помпа и обжимное кольцо давали полную - и на
   * столе получалось бледное пятно с тёмным овалом на дальнем конце, будто рядом с флаконом
   * лежит отдельная железка. половина света ставит стекло в один ряд с ними: тень читается
   * одним предметом, а помпа в ней просто самое тёмное место. у крышки доля ниже - в ней
   * нет настоя
   */
  const bodyShadow = createGlassShadow(0.62)
  const capShadow = createGlassShadow(0.5)
  /**
   * помпа и кольцо тоже не совсем непрозрачные - для карты теней. сами по себе они глухие,
   * но стоят внутри литой крышки, и на стол их тень приходит уже через стекло. в three
   * ближайший загораживающий выигрывает целиком, никакого перемножения нет, поэтому чёрный
   * овал помпы ложился поверх бледной тени крышки отдельной железкой. 0.82 - это и есть
   * примерно "помпа сквозь крышку": заметно темнее стекла, но частью одного пятна
   */
  const partsShadow = createGlassShadow(0.82)
  body.customDepthMaterial = bodyShadow
  cap.customDepthMaterial = capShadow
  pump.customDepthMaterial = partsShadow
  collar.customDepthMaterial = partsShadow

  const label = buildLabel(options, formula)

  const group = new Group()
  // помпа и трубка идут до стекла: обе непрозрачные, и в буфер, из которого стекло
  // берёт свет на просвет, они обязаны попасть раньше него
  group.add(tubeMesh, pump, nozzle, liquid, body, collar, cap, label.mesh)

  const geometries = [
    bodyGeometry,
    capGeometry,
    collarGeometry,
    liquidGeometry,
    pumpGeometry,
    nozzleGeometry,
    tube.geometry,
  ]
  // трубка и сопло приходят из примитивов three и лежат с индексом, остальное собрано
  // вручную и идёт списком вершин - считать одинаково нельзя
  const triangles =
    geometries.reduce((sum, g) => sum + (g.index?.count ?? g.getAttribute('position').count), 0) / 3

  const size = new Vector3()
  new Box3().setFromObject(group).getSize(size)

  return {
    group,
    meshes: { body, cap, collar, liquid, pump, nozzle, tube: tubeMesh, label: label.mesh },
    materials: {
      glass,
      capGlass,
      metal,
      plastic,
      nozzle: nozzleMaterial,
      tube: tubeMaterial,
      liquid: liquidMaterial,
    },
    shadows: { body: bodyShadow, cap: capShadow, parts: partsShadow },
    motion,
    tint,
    write: label.write,
    labelReady: label.ready,
    triangles,
    size,
    dispose() {
      for (const g of geometries) g.dispose()
      label.mesh.geometry.dispose()
      ;(label.mesh.material as Material).dispose()
      for (const m of [
        glass,
        capGlass,
        metal,
        plastic,
        nozzleMaterial,
        tubeMaterial,
        liquidMaterial,
        bodyShadow,
        capShadow,
        partsShadow,
      ]) {
        m.dispose()
      }
    },
  }
}
