/**
 * слабое железо узнаётся по кадрам, а не по модели телефона: по названию его не угадать,
 * а длинный кадр видно сразу. считаются только кадры, в которых сцена правда рисовала, -
 * пустой тик ничего не говорит о видеокарте. решение одно и навсегда: качество,
 * прыгающее туда и обратно, заметнее, чем просто чуть более мягкая тень.
 *
 * экономия идёт только на том, чего глаз не отличит: карта теней и выборки фроста. плотность
 * холста не трогается никогда - пиксельный флакон хуже любой медленной прокрутки
 */

/** столько рисующих кадров набирается, прежде чем решать */
const SAMPLES = 90
/** медиана длиннее - меньше сорока кадров в секунду, и тогда пора экономить */
const SLOW_MS = 25

let low = false
let frames: number[] = []
const listeners: Array<() => void> = []

export function onLowPower(fn: () => void): void {
  if (low) fn()
  else listeners.push(fn)
}

/** кадр, в котором что-то нарисовано; deltaMs - от прошлого кадра */
export function sampleFrame(deltaMs: number): void {
  if (low) return
  // первый кадр после паузы приходит с разрывом в секунды - это не цена отрисовки
  if (deltaMs > 250) return
  frames.push(deltaMs)
  if (frames.length < SAMPLES) return
  const sorted = frames.sort((a, b) => a - b)
  const median = sorted[sorted.length >> 1]
  frames = []
  if (median > SLOW_MS) lower()
}

function lower(): void {
  low = true
  for (const fn of listeners.splice(0)) fn()
}
