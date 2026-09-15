export interface SolarSample {
  /** видимое солнечное время в часах, кульминация ровно в 12:00 */
  hour: number
  /** высота над горизонтом, градусы */
  altitude: number
  /** азимут от юга, градусы; до кульминации отрицательный */
  azimuth: number
  /** длина тени в высотах гномона; на горизонте уходит в бесконечность */
  shadowRatio: number
}

/** широта по умолчанию: Марсель, 43°17′14″ N - площадка формулы Cypress 12:04 */
export const LATITUDE = 43.2872

/** склонение солнца на 4 августа, в тот же день */
export const DECLINATION = 17.0

const RAD = Math.PI / 180

export function sunAt(hour: number, lat = LATITUDE, dec = DECLINATION): SolarSample {
  // часовой угол: солнце проходит 15° в час, в полдень он равен нулю
  const H = (hour - 12) * 15 * RAD
  const phi = lat * RAD
  const delta = dec * RAD

  const sinAlt = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H)
  const altitude = Math.asin(Math.min(1, Math.max(-1, sinAlt))) / RAD

  const azimuth =
    Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(delta) * Math.cos(phi)) / RAD

  const shadowRatio = altitude > 0.05 ? 1 / Math.tan(altitude * RAD) : Infinity

  return { hour, altitude, azimuth, shadowRatio }
}

/** восход и закат в видимом солнечном времени - границы, внутри которых имеет смысл рисовать тень */
export function daylight(lat = LATITUDE, dec = DECLINATION): { rise: number; set: number } {
  const cosH = -Math.tan(lat * RAD) * Math.tan(dec * RAD)
  if (cosH <= -1) return { rise: 0, set: 24 }
  if (cosH >= 1) return { rise: 12, set: 12 }
  const half = Math.acos(cosH) / RAD / 15
  return { rise: 12 - half, set: 12 + half }
}

/**
 * ход воздуха за день - не расчёт, а замер: восемь точек из журнала за 4 августа, между
 * ними линейная протяжка. максимум сдвинут на 15 часов, потому что камень отдаёт тепло с
 * задержкой в три часа после кульминации. точки нормированы: ноль - ночной минимум
 * площадки, единица - её дневной максимум. форма кривой у всех пяти площадок одна, а концы
 * у каждой свои, потому что сдвиг максимума физический и от широты не зависит - хоть в
 * Марселе, хоть в Охаре
 */
const AIR: Array<[number, number]> = [
  [5, 0],
  [6.33, 0.1429],
  [8.67, 0.4286],
  [10.83, 0.7143],
  [12.07, 0.8571],
  [15.17, 1],
  [17.5, 0.7857],
  [19, 0.5],
]

export function airAt(hour: number, low: number, high: number): number {
  return low + shapeAt(hour) * (high - low)
}

function shapeAt(hour: number): number {
  if (hour <= AIR[0][0]) return AIR[0][1]
  for (let i = 1; i < AIR.length; i += 1) {
    const [h1, t1] = AIR[i]
    if (hour <= h1) {
      const [h0, t0] = AIR[i - 1]
      return t0 + ((t1 - t0) * (hour - h0)) / (h1 - h0)
    }
  }
  return AIR[AIR.length - 1][1]
}

export function formatClock(hour: number): string {
  const total = Math.round(hour * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
