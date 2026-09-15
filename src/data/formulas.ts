import { HOUSE_TINT, type TintRecipe } from '../model/tint'

/**
 * пять формул дома - и пять разных дней. до этого сцена пика знала один день: Марсель, 4
 * августа, склонение 17°. отсюда она берёт широту и склонение для каждой формулы, и вся
 * солнечная математика едет следом сама: высота дуги, длина дня, разворот часовых лучей,
 * минута среза на красном луче и длина тени. три площадки из пяти в южном полушарии, где
 * солнце стоит на севере и тень уходит от зрителя - формулы это считают без оговорок.
 *
 * склонения не выдуманы: каждое отвечает своей дате, а дата - тому, что на этой
 * широте даёт полуденную высоту, нарисованную в глифе указателя. пересчитывать
 * глифы поэтому не пришлось
 */

export type Formula = {
  id: string
  /** имя на этикетке */
  name: string
  /** минута среза в видимом солнечном времени */
  cut: number
  /** она же строкой - на этикетке и в указателе */
  clock: string
  /** дата сбора, для строки HUD */
  date: string
  /** широта площадки; юг отрицательный */
  latitude: number
  /** широта строкой, как в указателе */
  coordinates: string
  /** склонение солнца в этот день */
  declination: number
  /** воздух на площадке: ночной минимум и дневной максимум, °C */
  air: [number, number]
  tint: TintRecipe
  /** что говорит сцена и в какой час */
  lines: Array<{ at: number; text: string }>
}

export const FORMULAS: Formula[] = [
  {
    id: 'cypress',
    name: 'Cypress',
    cut: 12 + 4 / 60,
    clock: '12:04',
    date: '4 August',
    latitude: 43.2872,
    coordinates: '43°17′14″ N',
    declination: 17,
    air: [19, 33],
    // цвет дома он и есть: марена у дна, индиго у плеча. остальные четыре
    // отмерены от него, а не сами по себе
    tint: HOUSE_TINT,
    lines: [
      { at: 5, text: 'First light. The stomata are shut. Nothing is leaving the plant.' },
      { at: 6.33, text: 'The resin is still hard. Nothing will move for another two hours.' },
      { at: 8.67, text: 'The shadow is halving every forty minutes.' },
      { at: 10.83, text: 'Warm enough to work on the terrace. Nothing is cut yet.' },
      { at: 12, text: 'Transit. The shadow is 0.49 × height and will not get shorter this year.' },
      { at: 12 + 4 / 60, text: 'The cut.' },
      { at: 12.35, text: 'Twelve kilos of wood into the still, and the door shut behind it.' },
      { at: 15.17, text: 'The lighter fractions are already gone. What is left is the base.' },
      { at: 17.5, text: 'The stone gives back what it took.' },
      { at: 19, text: 'Everything after this hour belongs to a different formula.' },
    ],
  },
  {
    id: 'halite',
    name: 'Halite',
    cut: 11 + 52 / 60,
    clock: '11:52',
    date: '21 June',
    latitude: -20.1394,
    coordinates: '20°08′22″ S',
    declination: 23.44,
    air: [2, 20],
    tint: {
      base: { l: 0.42, c: 0.062, h: 236 },
      top: { l: 0.4, c: 0.028, h: 200 },
      liquid: { l: 0.665, c: 0.052, h: 216 },
      deep: { l: 0.46, c: 0.06, h: 232 },
    },
    lines: [
      { at: 6.6, text: 'Sunrise on the flat. The crust is at minus four and the brine under it is not.' },
      { at: 7.8, text: 'The shortest day of the year here, and the longest shadow at noon.' },
      { at: 9.2, text: 'Air at three thousand six hundred metres holds nothing. The light arrives undiluted.' },
      { at: 10.8, text: 'Borax at the edge of the polygon, where the water came up last.' },
      { at: 11 + 52 / 60, text: 'The cut. Two hours before the crust begins to give.' },
      { at: 13.2, text: 'Nothing evaporates at this altitude. It goes straight to air.' },
      { at: 15.4, text: 'Twenty degrees was the whole of it, and it is already going.' },
      { at: 17.4, text: 'Last light. By morning the surface will have closed over the cut.' },
    ],
  },
  {
    id: 'vetiver',
    name: 'Vetiver',
    cut: 12 + 31 / 60,
    clock: '12:31',
    date: '5 October',
    latitude: -21.1153,
    coordinates: '21°06′55″ S',
    declination: -6.02,
    air: [18, 28],
    tint: {
      base: { l: 0.4, c: 0.078, h: 75 },
      top: { l: 0.385, c: 0.05, h: 155 },
      liquid: { l: 0.565, c: 0.1, h: 82 },
      deep: { l: 0.395, c: 0.092, h: 72 },
    },
    lines: [
      { at: 5.85, text: 'First light in the cirque. The root has been in the ground two years and four months.' },
      { at: 7.3, text: 'They dig. Nothing here is cut — everything that matters is under the soil.' },
      { at: 9.1, text: 'Wet earth on the blade, and the smell is already in it.' },
      { at: 11, text: 'Washed, chopped, and left in the shade to give up its water.' },
      { at: 12 + 31 / 60, text: 'The cut. The root reaches the still in the hour it left the ground.' },
      { at: 14.6, text: 'Six hours of steam and the first fraction is still green.' },
      { at: 16.6, text: 'Twenty hours more before the smoke arrives. It always does.' },
      { at: 18.15, text: 'Last light over the cirque. The still runs through the night.' },
    ],
  },
  {
    id: 'hinoki',
    name: 'Hinoki',
    cut: 13 + 7 / 60,
    clock: '13:07',
    date: '24 January',
    latitude: 35.0114,
    coordinates: '35°00′41″ N',
    declination: -19.4,
    air: [0, 10],
    tint: {
      base: { l: 0.5, c: 0.058, h: 78 },
      top: { l: 0.44, c: 0.04, h: 168 },
      liquid: { l: 0.7, c: 0.075, h: 88 },
      deep: { l: 0.52, c: 0.08, h: 80 },
    },
    lines: [
      { at: 6.95, text: 'Sunrise at Ohara. Frost on the moss, and none of it will lift today.' },
      { at: 8.4, text: 'Nine degrees is the whole day. The wood gives nothing until it is opened.' },
      { at: 10.4, text: 'Heartwood only. The sapwood goes back to the forest floor.' },
      { at: 12, text: 'Transit, and the shadow is still longer than the tree is tall.' },
      { at: 13 + 7 / 60, text: 'The cut. Four hours of light left.' },
      { at: 15, text: 'The resin sets the moment the temperature drops. Everything is done before dark.' },
      { at: 16.3, text: 'The moss holds the water, and that is half of what this smells like.' },
      { at: 17.05, text: 'Last light. In January the cut has to be finished by four.' },
    ],
  },
  {
    id: 'orris',
    name: 'Orris',
    cut: 12 + 18 / 60,
    clock: '12:18',
    date: '25 July',
    latitude: 43.7694,
    coordinates: '43°46′10″ N',
    declination: 19.4,
    air: [21, 35],
    tint: {
      base: { l: 0.455, c: 0.055, h: 55 },
      top: { l: 0.42, c: 0.03, h: 265 },
      liquid: { l: 0.685, c: 0.07, h: 62 },
      deep: { l: 0.47, c: 0.075, h: 52 },
    },
    lines: [
      { at: 4.7, text: 'First light on the hill. The rhizomes have been in the ground three years.' },
      { at: 6.5, text: 'They come up by hand. A machine breaks them, and a broken one is worth nothing.' },
      { at: 8.5, text: 'Washed, peeled, halved, laid out. Six years of drying starts today.' },
      { at: 10.5, text: 'At this point it smells of soil and nothing else. That is correct.' },
      { at: 12.3, text: 'The cut. Thirty-three degrees, and the ground is too hot to kneel on.' },
      { at: 15, text: 'Six years from now this will be the most expensive thing the house buys.' },
      { at: 17.5, text: 'Two kilos of butter to the tonne of root. That is the entire yield.' },
      { at: 19.3, text: 'Last light. The rest of it is patience.' },
    ],
  },
]
