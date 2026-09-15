import { MeshPhysicalMaterial, MeshStandardMaterial, ShaderChunk } from 'three'

import { createTint, type FlaconTint } from './tint'

/**
 * стекло флакона. матовое и полупрозрачное: transmission даёт настоящее преломление, а
 * roughness его размывает - это и есть фрост. цвет живёт не на поверхности, а в объёме:
 * закон Бугера гасит свет по пути сквозь стекло, поэтому толстые места набирают плотность
 * сами, без единой текстуры
 */

/**
 * доли высоты, на которых идёт переход. вынесены наружу, потому что по этой же
 * полосе красится трубка помпы: она обязана попадать в цвет стекла ровно, иначе
 * её видно тёмной чертой вместо того, чтобы она пропала в градиенте
 */
export const TINT_BAND: [number, number] = [0.36, 0.74]

export type GlassOptions = {
  /** верх модели в мировых единицах - по нему считается доля высоты для градиента */
  height: number
  /** шероховатость поверхности. 0.28 - фрост, 0.05 - полированное стекло */
  roughness?: number
  /**
   * толщина стенки. она же длина луча преломления, и в этом всё дело. первая сборка стояла
   * на 0.32 - треть высоты флакона, сантиметра три стекла. цвет от такой толщины выходил
   * верный, а картинка за стеклом уезжала: линия налива относительно надписи на фасаде
   * гуляла на глазах при повороте камеры, потому что смещение преломления растёт вместе с
   * толщиной. настоящая стенка тонкая, и цвет ей набирают не толщиной, а плотностью
   * красителя - тем же занимаемся и мы
   */
  thickness?: number
  /**
   * на какой длине пути цвет гаснет в e раз - ручка плотности, и она узкая.
   * важно не само число, а его отношение к толщине: поглощение считается от
   * длины луча, и пара 0.075/0.16 даёт ровно ту же плотность, что прежняя
   * 0.32/0.68, только без уезжающей картинки
   */
  attenuation?: number
  /** доли высоты, между которыми идёт переход от марены к индиго */
  band?: [number, number]
  /** общий на весь флакон набор цветов; поменять его - поменять формулу */
  tint?: FlaconTint
}

export function createGlass(options: GlassOptions): MeshPhysicalMaterial {
  const tint = options.tint ?? createTint()
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: options.roughness ?? 0.33,
    transmission: 1,
    thickness: options.thickness ?? 0.075,
    ior: 1.52,
    attenuationDistance: options.attenuation ?? 0.16,
    envMapIntensity: 1,
    specularIntensity: 1,
    // полировка поверх фроста. ровно этот финиш у флаконов, с которых снят
    // референс: стекло пескоструено, а сверху лаковый слой, и он даёт по фаскам
    // жёсткий узкий блик, которого у одного только rough-стекла не бывает
    clearcoat: 0.32,
    clearcoatRoughness: 0.06,
  })

  // ссылкой, а не через конструктор: setValues копирует цвет в существующий объект.
  // сам градиент идёт мимо этого поля, но пусть материал знает свой цвет честно
  material.attenuationColor = tint.base

  gradeByHeight(material, tint, options.height, options.band ?? TINT_BAND)
  return material
}

/**
 * градиент цвета по высоте. attenuationColor в three - одна константа на весь материал,
 * поэтому уходим в шейдер: во вершинный кладём долю высоты, во фрагментном подменяем
 * присваивание на смесь. это единственный способ получить в объёме два цвета, не заводя ни
 * одной текстуры
 */
function gradeByHeight(
  material: MeshPhysicalMaterial,
  tint: FlaconTint,
  height: number,
  band: [number, number],
): void {
  material.onBeforeCompile = (shader) => {
    // юниформа держит сам объект Color, а не его копию: перекрасить формулу
    // значит записать в него другие числа, и шейдер увидит это на том же кадре
    shader.uniforms.uBaseTint = { value: tint.base }
    shader.uniforms.uTopTint = { value: tint.top }
    shader.uniforms.uHeight = { value: height }
    // градиент сжат в полосу над линией налива: ниже её стекло закрыто настоем,
    // и растянутый на всю высоту переход попросту не виден
    shader.uniforms.uFrom = { value: band[0] }
    shader.uniforms.uTo = { value: band[1] }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLevel;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLevel = position.y;',
      )

    /**
     * править приходится сам чанк, а не собранный шейдер. onBeforeCompile отдаёт исходник,
     * в котором #include ещё не раскрыты, поэтому строки "material.attenuationColor =
     * attenuationColor;" в нём просто нет - первая версия молча не срабатывала, и цвет
     * оставался ровным. берём чанк из ShaderChunk, подменяем присваивание в нём и ставим на
     * место директивы. перехватить цвет можно только здесь: ниже по чанку он уже уходит в
     * расчёт преломления
     */
    const marker = 'material.attenuationColor = attenuationColor;'
    const chunk = ShaderChunk.transmission_fragment
    if (!chunk.includes(marker)) {
      console.warn('glass: three сменил чанк transmission_fragment, градиент не применён')
      return
    }

    /**
     * толщина в three - одно число на материал, и стекло от этого выходит ровным по всей
     * площади. на деле путь луча зависит от угла: в лоб он идёт через стенку, у силуэта -
     * вдоль неё, и там стекло обязано быть заметно гуще. разброс держим узким. на 1.9/0.75
     * флакон с верхней точки заливало красным целиком: под наклоном плотность росла вдвое
     * разом, и градиент пропадал
     */
    const withDepth = chunk.replace(
      'material.thickness = thickness;',
      /* glsl */ `
        float facing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
        material.thickness = thickness * mix( 1.45, 0.8, facing );
      `,
    )

    const graded = withDepth.replace(
      marker,
      /* glsl */ `
        float level = clamp( ( vLevel - uHeight * uFrom ) / ( uHeight * ( uTo - uFrom ) ), 0.0, 1.0 );
        material.attenuationColor = mix( uBaseTint, uTopTint, smoothstep( 0.0, 1.0, level ) );
      `,
    )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying float vLevel;
        uniform vec3 uBaseTint;
        uniform vec3 uTopTint;
        uniform float uHeight;
        uniform float uFrom;
        uniform float uTo;
      `,
      )
      .replace('#include <transmission_fragment>', graded)
  }

  // без этого three переиспользует скомпилированную программу другого материала
  // с теми же настройками и патч не попадает в шейдер
  material.customProgramCacheKey = () => 'meridian-glass'
}

/**
 * обжимное кольцо: воронёная сталь, а не золото.
 * золото - первое, что делает любой парфюмерный бренд, и палитра дома его не знает
 */
export function createCollarMetal(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0x2c3a47,
    metalness: 1,
    roughness: 0.31,
    envMapIntensity: 1.1,
  })
}
