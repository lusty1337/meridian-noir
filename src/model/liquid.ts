import { Color, MeshPhysicalMaterial, Vector2 } from 'three'

import { createTint, type FlaconTint } from './tint'

/**
 * настой и его поверхность. непрозрачный намеренно, хотя жидкость прозрачна. transmission в
 * three читает буфер, куда прозрачные меши не попадают: прозрачный настой внутри
 * прозрачного стекла просто не увидит стекло перед собой и пропадёт. непрозрачный в этот
 * буфер попадает, и стекло показывает его с преломлением и своим цветом - то есть так, как
 * надо. цвет задан ярче итогового: стенка перед ним всё равно съест часть
 */

/**
 * потолок наклона зеркала. на 0.09 подъём у стенки - около 2.5% высоты флакона:
 * видно, что качнулось, и жидкость не лезет за стекло
 */
const MAX_TILT = 0.09

export type LiquidMotion = {
  /** толкнуть поверхность. x и z - направление в плоскости флакона */
  nudge(x: number, z: number): void
  /** dt в секундах, spin - угловая скорость модели вокруг вертикали */
  update(dt: number, spin: number): void
}

/** больше слоёв, чем строк в самой длинной формуле, не бывает */
export const STRATA_MAX = 8

/**
 * настой, разложенный на слои формулы. массивы в юниформах заведены у всех флаконов сразу,
 * а включает их одно число mix: так у сцены полудня и у разобранного флакона одна и та же
 * программа, и слои не стоят ни одной пересборки шейдера
 */
export type LiquidStrata = {
  /** 0 - настой одним цветом, 1 - по слоям */
  mix: { value: number }
  /** верхняя граница каждого слоя в долях столба, по возрастанию */
  edges: { value: number[] }
  colors: { value: Color[] }
  /**
   * насколько каждый слой сейчас на коже, от нуля до единицы. доля, а не маска: строки
   * "on skin" сменяют друг друга по прокрутке, и маска переключала бы цвета скачком
   */
  lit: { value: number[] }
  /** насколько гаснут слои, которых сейчас нет на коже: 0 - все одинаково */
  dim: { value: number }
}

export function createLiquid(
  fillLevel: number,
  tint: FlaconTint = createTint(),
): {
  material: MeshPhysicalMaterial
  motion: LiquidMotion
  strata: LiquidStrata
} {
  const tilt = { value: new Vector2() }
  const ripple = { value: 0 }
  const time = { value: 0 }
  const strata: LiquidStrata = {
    mix: { value: 0 },
    edges: { value: Array.from({ length: STRATA_MAX }, () => 1) },
    colors: { value: Array.from({ length: STRATA_MAX }, () => new Color()) },
    lit: { value: Array.from({ length: STRATA_MAX }, () => 0) },
    dim: { value: 0 },
  }

  const material = new MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.07,
    // мокрая поверхность: лак поверх даёт тот самый блик на мениске
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.2,
  })

  /**
   * цвет ставится присваиванием, а не через конструктор. setValues в three не подменяет
   * объект, а копирует в уже существующий: цвет, переданный в конструктор, оказался бы
   * копией, и перекрасить формулу через него было бы нельзя. три читает material.color
   * каждый кадр, поэтому подменённая ссылка работает, а копия - нет
   */
  material.color = tint.liquid

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTilt = tilt
    shader.uniforms.uRipple = ripple
    shader.uniforms.uTime = time
    shader.uniforms.uFill = { value: fillLevel }

    /**
     * двигаем только свободную поверхность. наклонять весь меш нельзя - он тут же выйдет за
     * стенку по линии налива. aSurface равен единице на зеркале и падает до нуля на ладонь
     * ниже, поэтому стенки стоят на месте, а поверхность ведёт себя как поверхность
     */
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute float aSurface;
        uniform vec2 uTilt;
        uniform float uRipple;
        uniform float uTime;
        varying vec3 vLocal;
      `,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        #include <beginnormal_vertex>
        objectNormal = normalize( objectNormal + vec3( -uTilt.x, 0.0, -uTilt.y ) * aSurface * 2.2 );
      `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vLocal = position;
        float slosh = dot( transformed.xz, uTilt );
        float wave = uRipple * sin( uTime * 7.4 + transformed.x * 26.0 + transformed.z * 17.0 );
        transformed.y += aSurface * ( slosh + wave );
      `,
      )

    // глубина цвета по высоте столба: у дна слой толще, и света доходит меньше
    shader.uniforms.uDeep = { value: tint.deep }
    shader.uniforms.uStrataMix = strata.mix
    shader.uniforms.uStrataEdge = strata.edges
    shader.uniforms.uStrataColor = strata.colors
    shader.uniforms.uStrataLit = strata.lit
    shader.uniforms.uStrataDim = strata.dim
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform vec3 uDeep;
        uniform float uFill;
        uniform float uStrataMix;
        uniform float uStrataEdge[ ${STRATA_MAX} ];
        uniform vec3 uStrataColor[ ${STRATA_MAX} ];
        uniform float uStrataLit[ ${STRATA_MAX} ];
        uniform float uStrataDim;
        varying vec3 vLocal;
      `,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        diffuseColor.rgb = mix( uDeep, diffuseColor.rgb, smoothstep( 0.0, uFill, vLocal.y ) );

        // высота берётся из позиции до матрицы модели: столб сжимают масштабом, когда
        // формулу наливают, а слои обязаны делить его на доли, как бы низко он ни стоял
        float column = clamp( ( vLocal.y - 0.03 ) / ( uFill - 0.03 ), 0.0, 1.0 );
        vec3 layer = uStrataColor[ ${STRATA_MAX - 1} ];
        float lit = uStrataLit[ ${STRATA_MAX - 1} ];
        float below = 0.0;
        float above = 1.0;
        for ( int i = 0; i < ${STRATA_MAX}; i ++ ) {
          if ( column <= uStrataEdge[ i ] ) {
            layer = uStrataColor[ i ];
            lit = uStrataLit[ i ];
            above = uStrataEdge[ i ];
            break;
          }
          below = uStrataEdge[ i ];
        }
        // тонкая тёмная черта по стыку: без неё соседние слои близкого цвета
        // сливаются, и видно пятна, а не разлив по долям
        float seam = min( column - below, above - column );
        layer *= mix( 0.62, 1.0, smoothstep( 0.0, 0.012, seam ) );
        layer = mix( layer, uDeep, 0.6 * uStrataDim * ( 1.0 - lit ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, layer, uStrataMix );
      `,
      )
  }

  material.customProgramCacheKey = () => 'meridian-liquid'

  const velocity = new Vector2()
  const target = new Vector2()
  let lastSpin = 0

  const motion: LiquidMotion = {
    nudge(x, z) {
      velocity.x += x
      velocity.y += z
      ripple.value = 0.004
    },
    update(dt, spin) {
      /**
       * шаг обязательно ограничен. пружина считается явным методом Эйлера, а он при большом
       * шаге расходится: первый кадр после загрузки приходил с dt в несколько секунд,
       * множитель затухания уходил в минус три десятка, и поверхность улетала за пределы
       * флакона огромной плитой. 1/30 - потолок, за которым это начинается
       */
      const step = Math.min(dt, 1 / 30)
      time.value += step

      /**
       * толкает жидкость не скорость вращения, а её изменение. на ровном повороте
       * поверхность стоит горизонтально - это верно и физически, и на глаз. плещется она на
       * старте, на остановке и на рывке, поэтому цель наклона берётся от углового УСКОРЕНИЯ
       */
      const accel = step > 0 ? (spin - lastSpin) / step : 0
      lastSpin = spin
      target.set(clamp(-accel * 0.015, -MAX_TILT, MAX_TILT), 0)

      // 52 и 7.4 дают пару качков и покой примерно за секунду
      velocity.x += (target.x - tilt.value.x) * 52 * step - velocity.x * 7.4 * step
      velocity.y += (target.y - tilt.value.y) * 52 * step - velocity.y * 7.4 * step
      tilt.value.x = clamp(tilt.value.x + velocity.x * step, -MAX_TILT, MAX_TILT)
      tilt.value.y = clamp(tilt.value.y + velocity.y * step, -MAX_TILT, MAX_TILT)

      ripple.value *= Math.max(0, 1 - step * 2.6)
    },
  }

  return { material, motion, strata }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
