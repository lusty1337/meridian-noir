/**
 * бэкенда у витрины нет, поэтому отправка честно останавливается на клиенте
 * и говорит об этом словами. валидация своя, а не нативная: нужен один и тот же
 * текст ошибки во всех браузерах и своё место, куда его положить
 */
export function initLetter(): void {
  const form = document.querySelector<HTMLFormElement>('[data-letter]')
  const error = document.querySelector<HTMLElement>('[data-letter-error]')
  const input = form?.querySelector<HTMLInputElement>('input[type="email"]')
  if (!form || !error || !input) return

  const say = (message: string, ok = false) => {
    error.textContent = message
    error.hidden = !message
    error.classList.toggle('is-ok', ok)
    input.setAttribute('aria-invalid', message && !ok ? 'true' : 'false')
  }

  input.addEventListener('input', () => {
    if (!error.hidden) say('')
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const value = input.value.trim()

    if (!value) {
      say('An address, and we will write in August.')
      input.focus()
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      say('That address is missing something. Check it and send it again.')
      input.focus()
      return
    }

    say(`Noted. ${value} goes on the list — this is a demonstration, so nothing is sent.`, true)
    form.reset()
  })
}
