/**
 * у страницы нет закреплённой шапки, единственная навигация - эта панель.
 * она построена на нативном <dialog>: ловушка фокуса, Escape, inert для остальной
 * страницы и возврат фокуса кнопке достаются от браузера и работают вернее,
 * чем всё, что можно навесить на div руками
 */
export function initNav(): void {
  const toggle = document.querySelector<HTMLButtonElement>('[data-index-open]')
  const panel = document.querySelector<HTMLDialogElement>('[data-index-panel]')
  const close = document.querySelector<HTMLButtonElement>('[data-index-close]')
  if (!toggle || !panel || !close) return

  toggle.addEventListener('click', () => {
    // панель длиннее экрана на ноутбучных высотах, и без сброса она открылась бы там,
    // где её оставили в прошлый раз
    panel.scrollTop = 0
    panel.showModal()
    toggle.setAttribute('aria-expanded', 'true')
  })

  close.addEventListener('click', () => panel.close())

  panel.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false')
  })

  panel.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) panel.close()
  })
}
