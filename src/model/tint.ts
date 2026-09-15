import { Color, SRGBColorSpace } from 'three'

import { mixOklch, rgbUnit, type Oklch } from '../lib/color'

/**
 * цвет флакона, вынесенный из материалов наружу. стекло, трубка помпы и настой красятся
 * одними и теми же четырьмя цветами: у стекла это плотность поглощения внизу и вверху, у
 * трубки - тот же градиент, чтобы она пропала в нём, у настоя - поверхность и глубина. пока
 * формула была одна, они жили константами по трём файлам, и поменять их можно было только
 * пересборкой.
 *
 * здесь они живут четырьмя объектами Color, на которые смотрят юниформы всех трёх
 * материалов. поменять формулу - это записать в них другие числа: ни новой
 * геометрии, ни новых текстур, ни пересборки программ
 */

export type TintRecipe = {
  /** марена у дна, где стекло толще всего */
  base: Oklch
  /** индиго у плеча */
  top: Oklch
  /** поверхность настоя */
  liquid: Oklch
  /** настой у дна, где слой толще и света доходит меньше */
  deep: Oklch
}

export type FlaconTint = {
  base: Color
  top: Color
  liquid: Color
  deep: Color
  /** переписать все четыре разом - так формула и переключается */
  apply(recipe: TintRecipe): void
}

/**
 * цвет дома: приглушённая марена у дна, индиго у плеча. марена приглушена намеренно -
 * настой под ней даёт свой красный, и на полной насыщенности низ флакона превращался в одно
 * тёмное пятно
 */
export const HOUSE_TINT: TintRecipe = {
  base: { l: 0.422, c: 0.1, h: 11 },
  top: { l: 0.373, c: 0.079, h: 252 },
  liquid: { l: 0.613, c: 0.147, h: 21 },
  deep: { l: 0.426, c: 0.145, h: 20 },
}

export function createTint(recipe: TintRecipe = HOUSE_TINT): FlaconTint {
  const tint: FlaconTint = {
    base: new Color(),
    top: new Color(),
    liquid: new Color(),
    deep: new Color(),
    apply(next) {
      write(tint.base, next.base)
      write(tint.top, next.top)
      write(tint.liquid, next.liquid)
      write(tint.deep, next.deep)
    },
  }
  tint.apply(recipe)
  return tint
}

/**
 * рецепт между двумя другими. смешивается в oklab, как и всё остальное на сайте: по оттенку
 * стекло уезжает с марены на морскую воду, и линейная интерполяция угла потащила бы его
 * через ядовито-зелёное на полпути
 */
export function mixRecipe(from: TintRecipe, to: TintRecipe, t: number): TintRecipe {
  return {
    base: mixOklch(from.base, to.base, t),
    top: mixOklch(from.top, to.top, t),
    liquid: mixOklch(from.liquid, to.liquid, t),
    deep: mixOklch(from.deep, to.deep, t),
  }
}

// rgbUnit отдаёт доли единицы уже с гаммой, то есть sRGB - в этом же
// пространстве их надо и принимать, иначе цвет уезжает светлее на полтона
function write(color: Color, value: Oklch): void {
  const [r, g, b] = rgbUnit(value)
  color.setRGB(r, g, b, SRGBColorSpace)
}
