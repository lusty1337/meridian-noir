**English** · [Русский](#ru)

# MERIDIAN NOIR — a perfume house website

A single-page site for a fictional perfume house from Marseille, directed by scroll
like a film. The house has five fragrances, and each is tied to one place, one day and one minute
of harvesting the raw material — in true solar time.

At the center of the page is a working sundial. The bottle stands on a marked slab as the gnomon,
scrolling carries the sun from sunrise to sunset, and the shadow falls exactly on the hour line
it would fall on that day at that latitude. The brand, formulas and prices are made up. The astronomy isn't.

Live version: **https://egordev.com/meridian-noir/**

## Running

```bash
npm install
npm run dev
```

| command | what it does |
|---|---|
| `npm run dev` | Vite dev server on `:5173` |
| `npm run build` | type check and production build into `dist/` |
| `npm run preview` | the finished build on `:4173` |
| `npm run preview:lan` | the same, but reachable from a phone on the same network |
| `npm run typecheck` | `tsc --noEmit` |

## The rule everything grew from

**Not a single image file.** No photos, no video, no textures, no HDRI, no `.glb`.
Everything on the page is typography, CSS, SVG, canvas and geometry the code builds
on load. The 3D bottle isn't modeled either — it's written.

It started as a constraint and became the project's best feature: you can look at the page
as closely as you like, nothing in it can go stale or return a 404, and the assets weigh exactly two fonts.

## Stack

Vite and TypeScript, no framework. GSAP ScrollTrigger and Lenis for scrolling, three.js for the bottle.
A framework wouldn't have added anything here: there's one page, almost no state, and all the interesting work
lives in the scroll timeline and in geometry — both easier to direct with plain code.

The fonts are self-hosted, not from a CDN: **Newsreader** and **Schibsted Grotesk**, both under the SIL Open Font License.

## The sundial — a calculation, not an animation

`src/lib/solar.ts` is a pure function with no rendering. The sun's altitude above the horizon and its azimuth
are computed from declination and hour angle:

```
sin h = sin φ · sin δ + cos φ · cos δ · cos H
```

where φ is latitude, δ is the sun's declination on that day, H is the hour angle (15° per hour from noon).
Shadow length is the cotangent of altitude, in gnomon heights. The hour lines on the slab sit where
the shadow would really fall; the dashed line is the curve the tip of the shadow traces over the day.

- **Five sites — five different days.** Latitude and declination come from the formula, and everything else
  follows: the sun's arc rises or flattens, the day grows longer or shorter,
  the fan of hour lines opens wider or narrower.
- **Southern hemisphere.** Three of the five sites are south of the equator, and there the viewer stands on the other
  side of the gnomon. The azimuth is rotated by 180° — not mirrored — and the hours on the dial
  start running counterclockwise on their own, as on real southern sundials.
- **The sky is normalized to the sun's altitude, not to local noon.** Otherwise January in Ohara
  would look like August in Marseille.
- **The transition between formulas** blends latitude, declination, harvest minute and air proportionally,
  and the glass color in Oklab. The day doesn't switch — it flows into another.

## A bottle written in code

- **The body is a loft.** A faceted cross-section with chamfers swept along a profile. The corner rounding
  is Blender's bevel, written in two dimensions. Normals come from the surface itself
  (tangent along the ring × tangent along the profile), not from an angle threshold: this way the chamfers
  catch a narrow highlight like real glass does, and there's no seam anywhere.
- **Cap, collar, pump, dip tube.** The cap follows the body's cross-section, the pump is a solid of revolution
  with proportions taken from a reference, the tube leans toward the deepest point of the bottom.
- **Glass.** `MeshPhysicalMaterial` with transmission and roughness; color is Beer–Lambert
  absorption. The gradient from madder to indigo and a wall thickness that depends on the viewing angle
  are patched into `ShaderChunk` — three only has a single constant per material for this.
- **The liquid** is opaque on purpose: transparent liquid inside transparent glass disappears from
  the transmission buffer. The surface sloshes on a spring driven by angular *acceleration*: during a steady
  turn it stays still, and it splashes when rotation starts and stops.
- **The label** is a canvas texture in the same fonts as the page, with mipmaps.
- **The studio** is a gradient sphere and glowing panels, run once through
  `PMREMGenerator`. A room for reflections without a single `.hdr`.
- **The glass shadow.** A shadow map only knows "blocked" and "open", so the glass discards
  some fragments in the depth pass using an ordered dither matrix, and VSM blurs that into an even
  penumbra. The near and far planes are fitted tightly to the slab — otherwise half precision isn't enough
  and the slab gets covered in a grid pattern.

## The peak scene

- **The browser holds the pin.** The scene sits on `position: sticky`: switching to `fixed` from
  the main thread arrives on a phone one frame after the scroll.
- **Two canvases inside the scene.** The shadow gets a full-frame canvas at screen density. The bottle gets a small
  canvas fitted to its bounds, at twice screen density: that's where the edges, the lettering and the transmission are, and nowhere
  else. Both canvases move with the slab on their own, with no script. During normal scrolling not a single
  WebGL frame is drawn.
- **A backdrop for the glass.** A piece of the 2D slab under the bottle is copied into a texture and
  hangs behind it, so the glass refracts the real shadow and not empty space.
- **Arrival within one screen.** The bottle comes out from behind the top edge of the window exactly when the
  section appears at the bottom, and lands on the slab as the slab arrives. The curve is smootherstep:
  zero velocity and acceleration at both ends.
- **Five formulas on one slab.** Arrows on the sides appear once the scroll settles.
  The bottle makes a full turn, the label changes on the far side, and the day changes with it.
  The bottle stays the same — four colors and one line of text change.
- **The bottle in your hands.** Under the cursor it lifts, floats on three incommensurate sines
  and turns away from the cursor. Everything runs on critically damped springs, so any
  interruption is seamless. On a phone your finger spins the model, all listeners are passive, and
  vertical scrolling isn't hijacked by a single millimeter.
- **Layout around the text.** On a phone the day's text is measured by its longest line
  across all formulas, and the scene is built above it. Shadows and the dashed line fade out at the edge with a mask instead of
  being cropped.
- **The preloader** doesn't wait for the network — there's nothing to wait for. It waits for work: fonts, shader
  compilation and one frame of the bottle "after landing", which pays in advance for the transmission buffer and the shadow map.

## Scrolling and reveals

Lenis and ScrollTrigger. Each reveal is tied to its own element, not to the section, and
replays every time it comes back into view — in both directions and as many times as you like.

## When something is missing

- **Without JavaScript** the whole page is still readable, and the peak scene turns into a text
  transcript of the day with all the numbers.
- **`prefers-reduced-motion`** gets a different cut of the same film: no Lenis and no pin, the scene
  draws one frame at the harvest minute, reveals become short fade-ins.
- **Narrow screens** — the meridian moves to the left edge, tables rebuild into labeled
  rows, the Index button moves to the top right corner.
- **Screen notch.** `viewport-fit=cover`: the page is drawn all the way to the top of the phone, while
  text, buttons and the sun sit below the Dynamic Island.

## Accessibility

Contrast is chosen by the numbers: body text is 13:1 on paper and 10.8:1 on the dark field; the madder
accent exists in three lightness levels to hold 4.5:1 on any surface. The Index panel is a
native `<dialog>`, tables are real tables with `scope` and tabular figures, and every
control has a visible focus.

## Lab

`/lab/bottle.html` is the model-building page: orbit, wireframe, normals, fixed camera angles.
The site doesn't link to it, and it's closed to indexing.

## Source layout

```
index.html             all the page text and the static SVG
src/
  main.ts              load order
  data/formulas.ts     five formulas: coordinates, days, colors, day lines
  lib/                 scrolling, reveals, parallax, sun, color, preloader
  model/               the bottle: geometry, glass, liquid, pump, label, studio
  scenes/              page scenes, the sundial and the bottle's 3D scene
  styles/              tokens, base, scenes
  lab/                 the model lab
```

## Deployment

GitHub Pages via Actions: `.github/workflows/deploy.yml` builds the project with
`--base=/meridian-noir/` and publishes `dist/` on every push to `main`.

## License

[All Rights Reserved](LICENSE) — the code, 3D geometry and design are protected by copyright.
Copying, modification and use without written permission are prohibited.
Fonts are distributed under SIL OFL 1.1, third-party libraries under their own licenses.

---

<a name="ru"></a>

[English](#readme) · **Русский**

# MERIDIAN NOIR — сайт парфюмерного дома

Одностраничный сайт вымышленного парфюмерного дома из Марселя, срежиссированный прокруткой
как фильм. У дома пять ароматов, и каждый привязан к одному месту, одному дню и одной минуте
среза сырья — в истинном солнечном времени.

В центре страницы — работающие солнечные часы. Флакон стоит на размеченной плите гномоном,
прокрутка ведёт солнце от рассвета до заката, и тень ложится ровно на тот часовой луч, на
который легла бы в этот день на этой широте. Бренд, формулы и цены выдуманы. Астрономия — нет.

Живая версия: **https://egordev.com/meridian-noir/**

## Запуск

```bash
npm install
npm run dev
```

| команда | что делает |
|---|---|
| `npm run dev` | дев-сервер Vite на `:5173` |
| `npm run build` | проверка типов и продакшен-сборка в `dist/` |
| `npm run preview` | готовая сборка на `:4173` |
| `npm run preview:lan` | то же, но видно с телефона в той же сети |
| `npm run typecheck` | `tsc --noEmit` |

## Правило, из которого выросло всё

**Ни одного файла изображений.** Ни фотографий, ни видео, ни текстур, ни HDRI, ни `.glb`.
Всё, что есть на странице, — типографика, CSS, SVG, canvas и геометрия, которую код строит
при загрузке. 3D-флакон тоже не смоделирован, а написан.

Началось как ограничение, а стало лучшим свойством проекта: страницу можно рассматривать
сколь угодно близко, в ней нечему устареть или отдать 404, а ассеты весят ровно два шрифта.

## Стек

Vite и TypeScript без фреймворка. GSAP ScrollTrigger и Lenis — прокрутка, three.js — флакон.
Фреймворк здесь ничего бы не дал: страница одна, состояния почти нет, а вся интересная работа
лежит в таймлайне прокрутки и в геометрии — и то и другое проще режиссировать простым кодом.

Шрифты свои, не с CDN: **Newsreader** и **Schibsted Grotesk**, оба под SIL Open Font License.

## Солнечные часы — расчёт, а не анимация

`src/lib/solar.ts` — чистая функция без рендера. Высота солнца над горизонтом и его азимут
считаются по склонению и часовому углу:

```
sin h = sin φ · sin δ + cos φ · cos δ · cos H
```

где φ — широта, δ — склонение солнца в этот день, H — часовой угол (15° в час от полудня).
Длина тени — котангенс высоты в высотах гномона. Часовые лучи на плите стоят там, где
действительно упала бы тень, пунктир — кривая, которую кончик тени чертит за день.

- **Пять площадок — пять разных дней.** Широта и склонение берутся из формулы, дальше всё
  следует само: дуга солнца поднимается или сплющивается, день удлиняется или короче,
  веер лучей раскрывается шире или уже.
- **Южное полушарие.** Три площадки из пяти южнее экватора, и там зритель стоит с другой
  стороны гномона. Азимут поворачивается на 180° — не отражается, — и часы на циферблате
  сами начинают идти против часовой стрелки, как на настоящих южных солнечных часах.
- **Небо нормировано на высоту солнца, а не на местный полдень.** Иначе январь в Охаре
  выглядел бы как август в Марселе.
- **Переход между формулами** смешивает долями широту, склонение, минуту среза и воздух,
  а цвет стекла — в Oklab. День не переключается, а перетекает в другой.

## Флакон, написанный кодом

- **Корпус — лофт.** Гранёное сечение с фасками протянуто вдоль профиля. Скругление углов —
  это bevel из Blender, записанный в двух измерениях. Нормали берутся из самой поверхности
  (касательная вдоль кольца × касательная вдоль профиля), а не по порогу угла: так фаски
  ловят узкий блик, как на настоящем стекле, и нигде нет шва.
- **Крышка, кольцо, помпа, трубка.** Крышка повторяет сечение корпуса, помпа — тело вращения
  с пропорциями, снятыми с референса, трубка наклонена к самой глубокой точке дна.
- **Стекло.** `MeshPhysicalMaterial` с transmission и шероховатостью, цвет — поглощение по
  Беру — Ламберту. Градиент от марены к индиго и толщина стенки, зависящая от угла взгляда,
  вписаны патчем в `ShaderChunk` — у three на это одна константа на материал.
- **Настой** непрозрачный намеренно: прозрачная жидкость в прозрачном стекле пропадает из
  буфера просвета. Поверхность колышется на пружине от углового *ускорения*: на ровном
  повороте стоит, на старте и остановке плещет.
- **Этикетка** — canvas-текстура теми же шрифтами, что и страница, с мип-уровнями.
- **Студия** — сфера с градиентом и светящиеся панели, прогнанные один раз через
  `PMREMGenerator`. Комната для отражений без единого `.hdr`.
- **Тень стекла.** Карта теней знает только «закрыто» и «открыто», поэтому стекло выбрасывает
  часть фрагментов в проходе глубины по упорядоченной матрице, а VSM размывает это в ровную
  полутень. Ближняя и дальняя плоскости обжаты по плите — иначе половинной точности не хватает
  и плита покрывается решёткой.

## Сцена пика

- **Пин держит браузер.** Сцена стоит на `position: sticky`: переключение в `fixed` из
  главного потока на телефоне приходит на кадр позже прокрутки.
- **Два холста внутри сцены.** Тень — на весь кадр в плотности экрана. Флакон — в маленьком
  холсте по габариту бутылки, вдвое плотнее экрана: там края, надпись и просвет, и больше
  нигде. Оба холста едут с плитой сами, без скрипта. На обычной прокрутке не рисуется ни
  одного кадра WebGL.
- **Подложка для стекла.** Кусок двумерной плиты под флаконом копируется в текстуру и
  висит за ним, так что стекло преломляет настоящую тень, а не пустоту.
- **Появление за один экран.** Флакон выходит из-за верхней кромки окна ровно тогда, когда
  секция показывается снизу, и садится на плиту вместе с её приходом. Кривая — smootherstep:
  нулевые скорость и ускорение на обоих концах.
- **Пять формул на одной плите.** Стрелки по бокам появляются, когда прокрутка затихает.
  Флакон делает полный оборот, этикетка меняется на дальней стороне, вместе с ним меняется
  день. Бутылка остаётся той же — меняются четыре цвета и строка текста.
- **Флакон в руках.** Под курсором он приподнимается, парит на трёх несоизмеримых синусах
  и отворачивается от курсора. Всё на критически задемпфированных пружинах, поэтому любые
  прерывания бесшовны. На телефоне палец крутит модель, а все слушатели пассивные, и
  вертикальная прокрутка не перехватывается ни на миллиметр.
- **Раскладка вокруг текста.** На телефоне текст дня меряется по самой длинной своей строке
  из всех формул, и сцена строится над ним. Тени и пунктир у кромки гаснут маской, а не
  обрезаются.
- **Прелоадер** не ждёт сеть — ждать нечего. Он ждёт работу: шрифты, сборку шейдеров и один
  кадр флакона «после посадки», который заранее оплачивает буфер просвета и карту теней.

## Прокрутка и появления

Lenis и ScrollTrigger. Каждое появление привязано к своему элементу, а не к секции, и
проигрывается при каждом возвращении в кадр — в обе стороны и сколько угодно раз.

## Когда чего-то нет

- **Без JavaScript** страница целиком читается, а пиковая сцена превращается в текстовую
  расшифровку дня со всеми числами.
- **`prefers-reduced-motion`** — другой монтаж того же фильма: без Lenis и пина, сцена
  рисует один кадр в минуту среза, появления становятся короткими проявлениями.
- **Узкий экран** — меридиан уходит к левому краю, таблицы перестраиваются в подписанные
  строки, кнопка Index — в правый верхний угол.
- **Вырез экрана.** `viewport-fit=cover`: страница рисуется до самого верха телефона, а
  текст, кнопки и солнце стоят ниже Dynamic Island.

## Доступность

Контраст подобран по числам: основной текст 13:1 на бумаге и 10.8:1 на тёмном поле, акцент
марены существует в трёх светлотах, чтобы держать 4.5:1 на любой поверхности. Панель Index —
нативный `<dialog>`, таблицы — настоящие таблицы со `scope` и табличными цифрами, у каждого
элемента управления видимый фокус.

## Стенд

`/lab/bottle.html` — страница сборки модели: орбита, каркас, нормали, фиксированные ракурсы.
С сайта на неё нет ссылок, и она закрыта от индексации.

## Устройство исходников

```
index.html             весь текст страницы и статичный SVG
src/
  main.ts              порядок загрузки
  data/formulas.ts     пять формул: координаты, дни, цвета, строки дня
  lib/                 прокрутка, появления, параллакс, солнце, цвет, прелоадер
  model/               флакон: геометрия, стекло, настой, помпа, этикетка, студия
  scenes/              сцены страницы, солнечные часы и 3D-сцена флакона
  styles/              токены, база, сцены
  lab/                 стенд модели
```

## Деплой

GitHub Pages через Actions: `.github/workflows/deploy.yml` собирает проект с
`--base=/meridian-noir/` и выкладывает `dist/` при каждом пуше в `main`.

## Лицензия

[All Rights Reserved](LICENSE) — код, 3D-геометрия и дизайн защищены авторским правом.
Копирование, модификация и использование без письменного разрешения запрещены.
Шрифты распространяются под SIL OFL 1.1, сторонние библиотеки — под своими лицензиями.
