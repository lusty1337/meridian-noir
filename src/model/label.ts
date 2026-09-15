import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'

import type { FlaconOptions } from './flacon'

/**
 * надпись на стекле. шелкография, а не гравировка: у флакона из первого референса белые
 * буквы лежат поверх пескоструя, и именно матовая краска на глянце даёт им вес. гравировку
 * пришлось бы вести нормалью, а нормаль требует развёртки, которой у протяжки нет.
 *
 * текстура рисуется на canvas теми же шрифтами, что и страница. файла с картинкой
 * в проекте по-прежнему нет
 */

/** всё, что дому есть сказать на флаконе. больше сюда ничего не добавляется */
const HOUSE = 'MERIDIAN NOIR'

const CANVAS_W = 1024
const CANVAS_H = 512

export type Label = {
  mesh: Mesh
  /** резолвится, когда шрифты доехали и текстура перерисована */
  ready: Promise<void>
  /** перебить формулу на этикетке - холст перерисовывается, текстура остаётся та же */
  write(formula: string): void
}

export function buildLabel(options: FlaconOptions, formula: string): Label {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 16
  /**
   * мип-уровни обязательны. холст надписи - тысяча пикселей в ширину, а на телефоне она
   * занимает на экране от силы двести пятьдесят. без мипов каждый экранный пиксель берёт
   * один случайный тексель из четырёх, и буквы рассыпаются лесенкой и мерцают при повороте.
   * с ними уменьшение идёт по заранее усреднённой копии нужного размера
   */
  texture.minFilter = LinearMipmapLinearFilter

  const material = new MeshPhysicalMaterial({
    color: 0xe8e4dc,
    map: texture,
    transparent: true,
    // глубину не пишем и рисуем последними: стекло под надписью прозрачное,
    // и без этого порядок между двумя прозрачными материалами гуляет от кадра к кадру
    depthWrite: false,
    // краска матовая, стекло под ней глянцевое - на этом контрасте надпись и держится
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.7,
  })

  // ширина плоскости - по плоской части фасада, без углов со срезом
  const faceWidth = (options.halfWidth - options.chamfer) * 2 * 0.92
  const geometry = new PlaneGeometry(faceWidth, (faceWidth * CANVAS_H) / CANVAS_W)
  const mesh = new Mesh(geometry, material)

  /**
   * по середине корпуса, а не над линией налива. буквы ложатся на настой, и это правильно:
   * у флакона с референса они тоже стоят поверх окрашенной жидкости, и краска по цветному
   * стеклу читается лучше, чем по прозрачному. выше 0.5 начинается плечо - там поверхность
   * уходит от камеры и надпись ведёт
   */
  mesh.position.set(0, 0.325 * options.height, options.halfDepth + 0.0018)
  mesh.renderOrder = 10

  let current = formula
  const ready = draw(canvas, texture, current)

  return {
    mesh,
    ready,
    write(next) {
      if (next === current) return
      current = next
      void draw(canvas, texture, next)
    },
  }
}

/**
 * шрифты ждём один раз на всё время жизни страницы. без ожидания первая отрисовка уходит в
 * запасной шрифт и остаётся такой навсегда. а вот при смене формулы ждать уже нечего:
 * шрифты давно в кеше, и второй await стоил бы кадра ровно там, где флакон разворачивается
 */
let faces: Promise<unknown> | null = null

async function draw(
  canvas: HTMLCanvasElement,
  texture: CanvasTexture,
  formula: string,
): Promise<void> {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  faces ??= Promise.all([
    document.fonts.load('700 42px "Schibsted Grotesk"'),
    document.fonts.load('600 122px "Newsreader"'),
  ]).catch(() => undefined)
  await faces

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // canvas умеет разрядку с Chrome 99, но проверяем: без неё имя дома
  // набьётся плотным блоком и потеряет всю дороговизну
  const spaced = 'letterSpacing' in ctx

  ctx.font = '700 42px "Schibsted Grotesk", sans-serif'
  if (spaced) ctx.letterSpacing = '17px'
  ctx.fillText(HOUSE, CANVAS_W / 2, 188)
  if (spaced) ctx.letterSpacing = '0px'

  ctx.font = '600 122px "Newsreader", serif'
  if (spaced) ctx.letterSpacing = '1px'
  ctx.fillText(formula, CANVAS_W / 2, 330)
  if (spaced) ctx.letterSpacing = '0px'

  texture.needsUpdate = true
}
