import { resolve } from 'node:path'

import { defineConfig } from 'vite'

export default defineConfig({
  // корень для дева и локального превью. GitHub Pages собирает с --base=/meridian-noir/
  // из воркфлоу, и vite сам переписывает под подпапку и preload шрифтов, и url() в css
  base: '/',
  build: {
    // вторая страница - стенд для модели. с сайта на неё нет ссылок и она закрыта
    // от индексации, но собирается вместе со всем: смотреть её надо и с телефона
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        lab: resolve(__dirname, 'lab/bottle.html'),
      },
    },
    target: 'es2022',
    cssTarget: 'chrome111',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
  },
})
