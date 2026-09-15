import './styles/tokens.css'
import './styles/base.css'
import './styles/scenes.css'

import { bindAnchors, initScroll } from './lib/scroll'
import { watchMotionPreference } from './lib/motion'
import { initPreloader } from './lib/preloader'
import { initReveals } from './lib/reveal'
import { initParallax } from './lib/parallax'
import { initHero } from './scenes/hero'
import { initInversion } from './scenes/inversion'
import { initLetter } from './scenes/letter'
import { initNav } from './scenes/nav'
import { initShutter } from './scenes/shutter'
import { initSweep } from './scenes/sweep'

initScroll()
bindAnchors()
watchMotionPreference()

initNav()
initLetter()
initInversion()
initShutter()
initHero()
initParallax()

// заставка держит прокрутку до тех пор, пока сцена полудня не соберёт свои
// программы: компиляция просвета идёт в главном потоке, и на первое движение
// колеса она приходить не должна
initPreloader(initSweep(), initReveals)
