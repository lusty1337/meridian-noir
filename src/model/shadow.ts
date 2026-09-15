import { MeshDepthMaterial, RGBADepthPacking } from 'three'

/**
 * тень от стекла. карта теней в three знает только "закрыто" или "открыто", поэтому
 * стеклянный флакон кладёт на стол ровно такое же чёрное пятно, как чугунный. на деле
 * сквозь пустое стекло проходит почти весь свет, и тень от него - бледная, с ярким ядром
 * там, где стенки собрали луч.
 *
 * честного решения нет: для него нужны каустики, а это отдельный проход и деньги,
 * которых у сцены нет. зато есть приём: в проходе тени выбрасывать часть пикселей
 * по упорядоченной матрице. закрытыми остаётся заданная доля текселей, размытие
 * PCF усредняет их в равномерную полутень, и стекло начинает пропускать свет.
 * настой при этом отбрасывает тень целиком - он и правда непрозрачный, и на столе
 * видно, что тёмное пятно кончается там же, где линия налива
 */
export function createGlassShadow(density: number): MeshDepthMaterial {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDensity = { value: density }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        /* glsl */ `
        uniform float uDensity;

        // матрица Байера 4x4 без таблицы: две вложенные 2x2 дают тот же порядок
        // обхода, а динамическая индексация массива в GLSL стоит дороже
        float bayer2( vec2 a ) {
          a = floor( a );
          return fract( a.x * 0.5 + a.y * a.y * 0.75 );
        }
        float bayer4( vec2 a ) {
          return bayer2( a * 0.5 ) * 0.25 + bayer2( a );
        }

        void main() {
      `,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `
        #include <clipping_planes_fragment>
        // координата берётся в пространстве карты теней, а не экрана, поэтому
        // узор стоит на месте при повороте модели и не мерцает
        if ( bayer4( gl_FragCoord.xy ) >= uDensity ) discard;
      `,
      )
  }

  material.customProgramCacheKey = () => `meridian-glass-shadow-${density}`
  return material
}
