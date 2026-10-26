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

The one exception is `public/og.jpg`, the link preview for social networks and messengers.
The page never shows it: crawlers can't render WebGL, so they have to be handed a snapshot
of the scene ready-made.

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
- **Frost without staircases.** three blurs what's behind the glass with a single mip level, where one
  buffer pixel is sixteen screen pixels, and the slanted edge of the liquid behind the glass followed
  that grid in a wave. Here the lookup is replaced by a 24-tap disk from a level twice as fine,
  with Gaussian weights: the same blur, but the grid is gone.
- **The liquid** is opaque on purpose: transparent liquid inside transparent glass disappears from
  the transmission buffer. The surface sloshes on a spring driven by angular *acceleration*: during a steady
  turn it stays still, and it splashes when rotation starts and stops. The meniscus rises only at the
  wall; the surface itself is flat and split into rings — the ripple is computed per vertex.
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
  else. Both canvases move with the slab on their own, with no script: while the sun stands still,
  the peak scene doesn't draw a single WebGL frame.
- **A backdrop for the glass.** A piece of the 2D slab under the bottle is copied into a texture and
  hangs behind it, so the glass refracts the real shadow and not empty space.
- **Arrival within one screen.** The bottle comes out from behind the top edge of the window exactly when the
  section appears at the bottom, and lands on the slab as the slab arrives. The curve is smootherstep:
  zero velocity and acceleration at both ends.
- **Five formulas on one slab.** The arrows on the sides are visible while the scene is pinned, with the
  names of the neighbouring formulas under them; on first show they swing once toward their sides;
  from the keyboard — ← and →. The bottle makes a full turn, the label changes on the far side, and the day changes with it.
  The bottle stays the same — four colors and one line of text change.
- **Formulas in the Index menu** lead into the scene, not to the table: the scroll stops exactly on
  the harvest minute of the chosen formula, and only then does the bottle turn to it by the short
  way round.
- **The bottle in your hands.** Under the cursor it lifts, floats on three incommensurate sines
  and turns away from the cursor. Everything runs on critically damped springs, so any
  interruption is seamless. On a phone your finger spins the model, all listeners are passive, and
  vertical scrolling isn't hijacked by a single millimeter.
- **Layout around the text.** On a phone the day's text is measured by its longest line
  across all formulas, and the scene is built above it. Shadows and the dashed line fade out at the edge with a mask instead of
  being cropped.
- **The preloader** doesn't wait for the network — there's nothing to wait for. It waits for work: fonts, shader
  compilation and one frame of the bottle "after landing", which pays in advance for the transmission buffer and the shadow map.

## The through-scene

The bottle doesn't live in one section — it's the lead of the whole page. One transparent canvas
with a long-lens camera lies over the layout, and the bottle moves from act to act without
vanishing and reappearing.

- **The layout holds the bottle's places.** The markup has empty blocks — by the hero, the index,
  the formula bench, the shutters, the prices, the footer. The canvas lies over the text, and the text
  doesn't run into the bottle not because it's hidden, but because the space under the bottle is
  empty at any width.
- **The director is a pure function of scroll.** Acts are counted from their own sections, not from
  page percentages. Between neighbours the whole frame blends: place, angle, light, glass colour,
  how many bottles are drawn.
- **Acts.** Intro — the bottle is drawn in madder and the glass grows along the drawing. Noon — the
  bottle in the column by the window. Index — five formulas line up, and the bottle of the row under
  the cursor lifts. On a wide screen the formula bench pins whole for a screen and a half of scroll:
  the bottle is taken apart, the layers pour one by one, the current layer's row answers with its
  figure, then the bottle is reassembled and carried in an arc to "on skin" — to where its place
  will be by the end of the carry. On a phone the bench is a full-window scene: the bottle on top,
  one row at a time below it, and scrolling swaps the rows in place while their layer pours.
  "On skin" lights up the layers that are sounding on the skin right now. Then the bottle leaves past
  the top of the window and descends onto the noon slab from above — the same object, handed over
  through the edge. Then the shutter room, three volumes by the prices (scale is the cube root of the
  volume) and dusk in the footer, where the shadow stretches toward the signature.
- **Layers are a shader, not meshes.** The liquid is cut into fractions along the column height, each
  joint darkened by a thin line, and the "on skin" highlight is a bitmask. All bottles share one
  program, and the layers cost not a single recompile.
- **One geometry for all eight bottles**, indexed: about 10k triangles and 5k vertices per bottle.
  Profile roundings are subdivided to a quarter-pixel tolerance at the largest close-up, and the
  cap's flat faces aren't subdivided at all.
- **Places are computed by projection.** The bottle is set in the middle of its place by what's
  visible on screen with tilt and turn — so the margins around it are equal on all four sides.
- **Shot size is distance, not scale.** three computes the ray path through glass with the model's
  scale, and an enlarged bottle would thicken into blue plastic.
- **The glass backdrop** — the colour of the section under the bottle, read through a canvas:
  the browser returns the background in oklch, and parsing the string as rgb gave a bright blue wall.
- **Phone** — the same direction in portrait. The formula bench and the prices pin: the bottle in the
  top of the window, one row under it, and when the row changes, the bottles by the prices change
  formula. Text never passes under the glass.
- **The meridian is drawn along the page**, not the window: over a dark field it's lighter, on the
  noon slab it goes behind the bottle, and the shutter light and the bottles' shadows end before
  reaching it.
- A frame is drawn in the same tick as the scroll, and only if something in it moved. The canvas lies
  in the page itself, with margin above and below the window: on a phone the browser moves the page
  in its own thread, and the canvas travels with the text even when a frame is late. While the
  bottle's place is stuck to the window, the canvas holds on to the window.

## Scrolling and reveals

Lenis and ScrollTrigger. Each reveal is tied to its own element, not to the section, and
replays every time it comes back into view — in both directions and as many times as you like.

## When something is missing

- **Weak hardware** is recognised by its frames: if the median drawing frame is longer than 25 ms,
  the shadow map halves at the same penumbra width, and the frost gets half as many taps. Canvas
  density is never touched — the bottle doesn't pixelate.
- **WebGL context loss.** A phone takes it from a tab in the background. three rebuilds its buffers
  itself, and the scenes reshoot the reflection room — otherwise the glass would come back black.
- **Without JavaScript** the whole page is still readable, and the peak scene turns into a text
  transcript of the day with all the numbers.
- **`prefers-reduced-motion`** gets a different cut of the same film: no Lenis, no pin and no
  through-scene, the peak draws one frame at the harvest minute, reveals become short fade-ins.
- **Narrow screens** — the meridian moves to the left edge, tables rebuild into labeled
  rows, the Index button moves from the bookmark in the left margin to the top right corner.
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
  cinema/              the through-scene: actor, stage, director
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

Единственное исключение — `public/og.jpg`, превью ссылки для соцсетей и мессенджеров.
Страница его не показывает: краулеры не умеют рендерить WebGL, и снимок сцены приходится
отдать им готовым.

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
- **Фрост без лесенок.** three размывает то, что за стеклом, одним уровнем мипмапа, где точка
  буфера — шестнадцать точек экрана, и наклонная кромка настоя за стеклом шла по этой сетке
  волной. Здесь выборка заменена диском из 24 отсчётов с уровня вдвое мельче и весом по
  гауссу: размытие то же, а сетки не видно.
- **Настой** непрозрачный намеренно: прозрачная жидкость в прозрачном стекле пропадает из
  буфера просвета. Поверхность колышется на пружине от углового *ускорения*: на ровном
  повороте стоит, на старте и остановке плещет. Мениск поднимается только у стенки, само
  зеркало плоское и разбито на кольца — рябь считается по вершинам.
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
  нигде. Оба холста едут с плитой сами, без скрипта: пока солнце стоит, сцена пика не
  рисует ни одного кадра WebGL.
- **Подложка для стекла.** Кусок двумерной плиты под флаконом копируется в текстуру и
  висит за ним, так что стекло преломляет настоящую тень, а не пустоту.
- **Появление за один экран.** Флакон выходит из-за верхней кромки окна ровно тогда, когда
  секция показывается снизу, и садится на плиту вместе с её приходом. Кривая — smootherstep:
  нулевые скорость и ускорение на обоих концах.
- **Пять формул на одной плите.** Стрелки по бокам видны, пока сцена стоит на пине, под
  ними имена соседних формул, при первом показе они один раз качаются в свои стороны; с
  клавиатуры — ← и →. Флакон делает полный оборот, этикетка меняется на дальней стороне, вместе с ним меняется
  день. Бутылка остаётся той же — меняются четыре цвета и строка текста.
- **Формулы из меню Index** ведут не к таблице, а в сцену: прокрутка останавливается ровно
  на минуте среза выбранной формулы, и уже после этого флакон поворачивается к ней коротким
  путём по кругу.
- **Флакон в руках.** Под курсором он приподнимается, парит на трёх несоизмеримых синусах
  и отворачивается от курсора. Всё на критически задемпфированных пружинах, поэтому любые
  прерывания бесшовны. На телефоне палец крутит модель, а все слушатели пассивные, и
  вертикальная прокрутка не перехватывается ни на миллиметр.
- **Раскладка вокруг текста.** На телефоне текст дня меряется по самой длинной своей строке
  из всех формул, и сцена строится над ним. Тени и пунктир у кромки гаснут маской, а не
  обрезаются.
- **Прелоадер** не ждёт сеть — ждать нечего. Он ждёт работу: шрифты, сборку шейдеров и один
  кадр флакона «после посадки», который заранее оплачивает буфер просвета и карту теней.

## Сквозная сцена

Флакон не живёт в одной секции — это главный герой всей страницы. Поверх вёрстки лежит один
прозрачный холст с длиннофокусной камерой, и флакон переходит из акта в акт, не пропадая и
не появляясь заново.

- **Места под флакон держит вёрстка.** В разметке стоят пустые блоки — у героя, у указателя,
  у стола формулы, у ставней, у цен, в подвале. Холст лежит над текстом, и текст на флакон
  не наезжает не потому, что его прячут, а потому, что под флаконом пусто на любой ширине.
- **Режиссёр — чистая функция прокрутки.** Акты отсчитываются от своих секций, а не от
  процентов страницы. Между соседями кадр смешивается целиком: место, ракурс, свет, цвет
  стекла, сколько флаконов начерчено.
- **Акты.** Заставка — флакон чертится мареной и по чертежу нарастает стекло. Полдень —
  флакон в колонке у окна. Указатель — пять формул встают строем, под курсором строки
  поднимается её флакон. Стол формулы на широком экране встаёт целиком на полтора экрана
  прокрутки: флакон разбирают, слои льются по очереди, строка текущего слоя отзывается
  цифрой, потом флакон собирают и переносят дугой к «on skin» — туда, где место окажется к
  концу переноса. На телефоне стол — сцена на всё окно: флакон сверху, под ним одна строка
  за раз, и прокрутка сменяет строки на месте, пока льётся их слой. «On skin» подсвечивает те слои, что сейчас звучат на коже. Дальше флакон уходит за верх окна, а на плиту полудня
  спускается сверху — это тот же предмет, переданный через кромку. Потом комната ставней,
  три объёма у цен (масштаб — кубический корень из объёма) и закат в подвале, где тень
  тянется к подписи.
- **Слои — это шейдер, а не меши.** Настой режется на доли по высоте столба, стык
  затемнён тонкой чертой, а подсветка «на коже» — битовая маска. Программа у всех флаконов
  одна, и слои не стоят ни одной пересборки.
- **Геометрия одна на все восемь флаконов** и лежит с индексом: около 10 тыс. треугольников
  и 5 тыс. вершин на флакон. Скругления профиля дробятся по допуску в четверть пикселя на
  самом крупном плане, плоские грани крышки не дробятся вовсе.
- **Места считаются по проекции.** Флакон ставится посередине своего места по тому, что
  видно на экране с наклоном и поворотом, — поэтому поля вокруг него равны с четырёх сторон.
- **Крупность — расстояние, а не масштаб.** three считает путь луча сквозь стекло с учётом
  масштаба модели, и увеличенный флакон густел бы до синего пластика.
- **Подложка под стекло** — цвет секции под флаконом, прочитанный через холст: браузер
  отдаёт фон в oklch, и разбор строки как rgb давал ярко-синюю стену.
- **Телефон** — та же режиссура в портрете. Стол формулы и цены встают в пин: флакон в
  верхней части окна, под ним одна строка, а при смене строки флаконы у цен меняют формулу.
  Текст под стекло не заходит нигде.
- **Меридиан прочерчен по странице**, а не по окну: над тёмным полем он светлее, на плите
  полудня уходит за флакон, а свет ставней и тени флаконов кончаются, не доходя до него.
- Кадр рисуется в том же тике, что и прокрутка, и только если в нём что-то сдвинулось. Холст
  лежит в самой странице, с запасом над окном и под ним: на телефоне страницу двигает браузер
  в своём потоке, и холст едет вместе с текстом, даже когда кадр запаздывает. Пока место
  флакона прилипло к окну, холст держится за окно.

## Прокрутка и появления

Lenis и ScrollTrigger. Каждое появление привязано к своему элементу, а не к секции, и
проигрывается при каждом возвращении в кадр — в обе стороны и сколько угодно раз.

## Когда чего-то нет

- **Слабое железо** узнаётся по кадрам: если медиана рисующих кадров длиннее 25 мс, карта
  теней становится вдвое меньше при той же ширине полутени, а у фроста вдвое меньше
  отсчётов. Плотность холста не трогается никогда — флакон не пикселится.
- **Потеря контекста WebGL.** Телефон отбирает его у вкладки в фоне. three заводит буферы
  заново сам, а комнату для отражений сцены снимают повторно — иначе стекло вернулось бы
  чёрным.
- **Без JavaScript** страница целиком читается, а пиковая сцена превращается в текстовую
  расшифровку дня со всеми числами.
- **`prefers-reduced-motion`** — другой монтаж того же фильма: без Lenis, пина и сквозной
  сцены, пик рисует один кадр в минуту среза, появления становятся короткими проявлениями.
- **Узкий экран** — меридиан уходит к левому краю, таблицы перестраиваются в подписанные
  строки, кнопка Index — из закладки на левом поле в правый верхний угол.
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
  cinema/              сквозная сцена: актёр, площадка, режиссёр
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
