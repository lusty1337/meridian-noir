/**
 * меридиан и кнопка Index закреплены на экране и переезжают через тёмную секцию,
 * а марена на индиго не читается - на время пересечения им выдаётся светлый набор.
 * считаем не intersectionRatio, а долю ЭКРАНА под тёмным полем: секция выше вьюпорта,
 * и её собственный ratio до порога никогда бы не дошёл
 */
export function initInversion(): void {
  const dark = document.querySelector('[data-scene="index"]')
  if (!dark) return

  const observer = new IntersectionObserver(
    ([entry]) => {
      const covered = entry.intersectionRect.height / window.innerHeight
      document.documentElement.classList.toggle('is-inverted', covered > 0.6)
    },
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  )

  observer.observe(dark)
}
