export interface Oklch {
  l: number
  c: number
  h: number
}

interface Oklab {
  l: number
  a: number
  b: number
}

/**
 * смешивание цвета для canvas идёт через oklab, а не через oklch: по оттенку небо
 * к вечеру уезжает с 232° на 42°, и линейная интерполяция угла потащила бы его
 * через зелёное. в oklab путь идёт по прямой и остаётся тем, что видит глаз
 */
function toLab({ l, c, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) }
}

function gamma(x: number): number {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

function labToRgb({ l, a, b }: Oklab): [number, number, number] {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  const rgb: [number, number, number] = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]

  return rgb.map((v) => Math.round(Math.min(1, Math.max(0, gamma(v))) * 255)) as [
    number,
    number,
    number,
  ]
}

export function mixOklch(from: Oklch, to: Oklch, t: number): Oklch {
  const a = toLab(from)
  const b = toLab(to)
  const lab: Oklab = {
    l: a.l + (b.l - a.l) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  }
  const c = Math.hypot(lab.a, lab.b)
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: lab.l, c, h }
}

export function css(color: Oklch, alpha = 1): string {
  const [r, g, b] = labToRgb(toLab(color))
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`
}

/**
 * тот же цвет, но долями единицы и без строки - таким его берёт three.
 * через css() и Color.setStyle не пройти: строка тут в новом синтаксисе, через
 * пробелы, а разбор в three ждёт запятых
 */
export function rgbUnit(color: Oklch): [number, number, number] {
  return labToRgb(toLab(color)).map((v) => v / 255) as [number, number, number]
}
