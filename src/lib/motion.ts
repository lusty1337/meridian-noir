const query = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return window.matchMedia(query).matches
}

/** перезагрузка вместо горячего пересбора сцен: смена этой настройки - редкое событие */
export function watchMotionPreference(): void {
  window.matchMedia(query).addEventListener('change', () => window.location.reload())
}

export function isCoarsePointer(): boolean {
  return window.matchMedia('(hover: none), (pointer: coarse)').matches
}
