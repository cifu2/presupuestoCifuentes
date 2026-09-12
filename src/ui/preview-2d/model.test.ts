import { describe, expect, it } from 'vitest'

import {
  PATTERN_SPEC_ORDER,
  PREVIEW_SHAPE_KINDS,
  TIPOS_2D_MVP,
  TIPOS_2D_REFERENCIA,
  buildPreviewGeometry,
  clamp,
  type DoorType,
  type FinishKind,
  type GlassAperture,
  type PreviewConfig,
  type PreviewGeometry,
  type PreviewPaintPattern,
} from './model'

/**
 * Invariantes del modelo 2D, portadas de los arneses normativos de Diseño (CIF-5):
 * `validacion-modelo-2d.mjs` (v3, tipos aprobados) y `validacion-catalogo-2d.mjs` (v5.1, tipos
 * nuevos, capas y H9/H12). Si el diseño amplía el modelo, se amplían estas aserciones en el
 * mismo cambio.
 */

const ALL_TYPES: readonly DoorType[] = [...TIPOS_2D_MVP, ...TIPOS_2D_REFERENCIA]
/** Relleno que apunta a un patrón del `<defs>`; el tono deja `paint.pattern` a `null` (H3-b de CIF-267). */
const URL_REF = /url\(#([^)]+)\)/g
const W = 825
const H = 2030

const BASE: PreviewConfig = {
  type: 'abatible-1-hoja',
  widthMm: W,
  heightMm: H,
  hingeSide: 'derecha',
  glazing: 'franja-superior',
  ventilation: 'inferior',
  finishKind: 'lacado',
  colorCode: 'RAL 7016',
  colorHex: '#383E42',
  withinSeriesRange: true,
}

const geometryOf = (overrides: Partial<PreviewConfig> = {}): PreviewGeometry =>
  buildPreviewGeometry({ ...BASE, ...overrides })

/** Hueco de reproducción de CIF-158: relativo a la hoja, así que la mano debe recolocarlo (C1). */
const APERTURAS_HOJA_SIMPLE: readonly GlassAperture[] = [
  { x: 0.15, y: 0.2, w: 0.25, h: 0.3, forma: 'rect' },
]

const marginFor = (type: DoorType, width: number, height: number): number =>
  Math.round(
    type === 'corredera'
      ? Math.max(
          clamp(0.03 * Math.min(width, height), 30, 90),
          Math.max(40, Math.round(0.04 * height)) + 10,
        )
      : clamp(0.03 * Math.min(width, height), 30, 90),
  )

const isInsideViewBox = (geometry: PreviewGeometry): boolean => {
  const [minX, minY, width, height] = geometry.viewBox

  return geometry.shapes.every(
    (shape) =>
      shape.x >= minX - 0.01 &&
      shape.y >= minY - 0.01 &&
      shape.x + shape.w <= minX + width + 0.01 &&
      shape.y + shape.h <= minY + height + 0.01,
  )
}

const isInsideLeaf = (
  shape: { x: number; y: number; w: number; h: number },
  leaf: { x: number; y: number; w: number; h: number },
): boolean =>
  shape.x >= leaf.x - 0.01 &&
  shape.x + shape.w <= leaf.x + leaf.w + 0.01 &&
  shape.y >= leaf.y - 0.01 &&
  shape.y + shape.h <= leaf.y + leaf.h + 0.01

const signature = (geometry: PreviewGeometry): string =>
  geometry.shapes
    .map(
      (shape) =>
        `${shape.kind}|${Math.round(shape.x * 100)}|${Math.round(shape.y * 100)}|${Math.round(shape.w * 100)}|${Math.round(shape.h * 100)}`,
    )
    .sort()
    .join(';')

/** La mano izquierda debe ser el espejo exacto (M11), tolerando 0,02 mm de redondeo por eje. */
const expectMirrored = (type: DoorType, overrides: Partial<PreviewConfig> = {}): void => {
  const right = geometryOf({ ...overrides, type, hingeSide: 'derecha' })
  const left = geometryOf({ ...overrides, type, hingeSide: 'izquierda' })

  expect(left.shapes.length, `${type}: nº de formas`).toBe(right.shapes.length)

  const pending = [...left.shapes]

  for (const shape of right.shapes) {
    const mirrorX = W - shape.x - shape.w
    const index = pending.findIndex(
      (candidate) =>
        candidate.kind === shape.kind &&
        candidate.tone === shape.tone &&
        candidate.paint.fill === shape.paint.fill &&
        Math.abs(candidate.x - mirrorX) <= 0.02 &&
        Math.abs(candidate.y - shape.y) <= 0.02 &&
        Math.abs(candidate.w - shape.w) <= 0.02 &&
        Math.abs(candidate.h - shape.h) <= 0.02,
    )

    expect(index, `${type}: espejo de ${shape.kind} en x=${shape.x}`).toBeGreaterThanOrEqual(0)
    pending.splice(index, 1)
  }
}

const leafRects = (geometry: PreviewGeometry): readonly PreviewGeometry['shapes'][number][] =>
  geometry.shapes.filter((shape) => shape.kind === 'leaf').sort((a, b) => a.x - b.x)

describe('modelo 2D · geometría dentro del lienzo', () => {
  const sizes: readonly (readonly [number, number])[] = [
    [400, 400],
    [400, 600],
    [600, 800],
    [825, 1200],
    [825, 2030],
    [1200, 2400],
    [3200, 3200],
  ]

  it('todas las formas caen dentro del viewBox y sin dimensiones negativas', () => {
    for (const type of ALL_TYPES) {
      for (const [width, height] of sizes) {
        const geometry = geometryOf({ type, widthMm: width, heightMm: height })

        expect(isInsideViewBox(geometry), `${type} ${width}×${height}`).toBe(true)
        expect(
          geometry.shapes.every((shape) => shape.w >= 0 && shape.h >= 0),
          `${type} ${width}×${height}: dimensiones`,
        ).toBe(true)
      }
    }
  })

  it('el viewBox conserva la escala en milímetros', () => {
    for (const type of ALL_TYPES) {
      const [, , width, height] = geometryOf({ type }).viewBox
      const margin = marginFor(type, W, H)

      expect(width, `${type}: ancho`).toBeCloseTo(W + 2 * margin, 9)
      expect(height, `${type}: alto`).toBeCloseTo(H + 2 * margin, 9)
    }
  })

  it('el carril de la corredera amplía el margen (única excepción documentada)', () => {
    expect(marginFor('corredera', W, H)).toBeGreaterThan(clamp(0.03 * Math.min(W, H), 30, 90))
  })

  it('ancla jambas, cabecera y suelo, y la hoja ocupa la abertura', () => {
    const geometry = geometryOf()
    const frames = geometry.shapes.filter((shape) => shape.kind === 'frame')
    const frame = frames[0]
    const leaf = geometry.shapes.find((shape) => shape.kind === 'leaf')

    expect(frame).toBeDefined()
    expect(leaf).toBeDefined()
    if (!frame || !leaf) {
      return
    }

    expect(frames.some((shape) => shape.x === 0)).toBe(true)
    expect(frames.some((shape) => shape.x + shape.w === W)).toBe(true)
    expect(frames.some((shape) => shape.y === 0)).toBe(true)
    expect(frames.some((shape) => shape.y + shape.h === H)).toBe(true)
    expect(leaf.x).toBe(frame.h)
    expect(leaf.y).toBe(frame.h)
    expect(leaf.w).toBe(W - 2 * frame.h)
    expect(leaf.h).toBe(H - 2 * frame.h)
  })

  it('crecer el ancho solo mueve el borde derecho', () => {
    const frames = geometryOf({ widthMm: 1000 }).shapes.filter((shape) => shape.kind === 'frame')

    expect(frames.some((shape) => shape.x === 0)).toBe(true)
    expect(frames.some((shape) => shape.x + shape.w === 1000)).toBe(true)
  })
})

describe('modelo 2D · mano y herraje', () => {
  it('el tirador y la cerradura van al lado opuesto a las bisagras (B3)', () => {
    for (const type of ['abatible-1-hoja', 'entrada-acorazada'] as const) {
      for (const hingeSide of ['derecha', 'izquierda'] as const) {
        const geometry = geometryOf({ type, hingeSide })
        const hinge = geometry.shapes.find((shape) => shape.kind === 'hinge')
        const handle = geometry.shapes.find((shape) => shape.kind === 'handle')
        const lock = geometry.shapes.find((shape) => shape.kind === 'lock')

        expect(hinge, `${type} ${hingeSide}: bisagra`).toBeDefined()
        expect(handle, `${type} ${hingeSide}: tirador`).toBeDefined()
        if (!hinge || !handle) {
          continue
        }

        expect(Math.sign(hinge.x - W / 2), `${type} ${hingeSide}`).not.toBe(
          Math.sign(handle.x - W / 2),
        )

        if (lock) {
          expect(Math.sign(lock.x - W / 2), `${type} ${hingeSide}: cerradura`).not.toBe(
            Math.sign(hinge.x - W / 2),
          )
        }
      }
    }
  })

  it('la abatible de dos hojas reparte 3+3 bisagras y cierra la abertura', () => {
    const geometry = geometryOf({ type: 'abatible-2-hojas' })
    const leaves = leafRects(geometry)
    const hinges = geometry.shapes.filter((shape) => shape.kind === 'hinge')

    expect(leaves).toHaveLength(2)
    expect(leaves[0]?.w).toBe(353)
    expect(leaves[1]?.w).toBe(367)
    expect(hinges).toHaveLength(6)
    expect(hinges.filter((shape) => shape.x < W / 2)).toHaveLength(3)
    expect(hinges.filter((shape) => shape.x > W / 2)).toHaveLength(3)
  })

  it('la entrada acorazada lleva cerradura de 3 puntos, mirilla y cerco más grueso', () => {
    const geometry = geometryOf({ type: 'entrada-acorazada' })
    const plainFrame = geometryOf().shapes.find((shape) => shape.kind === 'frame')

    expect(geometry.shapes.filter((shape) => shape.kind === 'lock')).toHaveLength(3)
    expect(geometry.shapes.filter((shape) => shape.kind === 'peephole')).toHaveLength(1)
    expect(geometry.shapes.find((shape) => shape.kind === 'frame')?.h).toBeGreaterThan(
      plainFrame?.h ?? 0,
    )
  })

  it('la corredera lleva carril, franja de pared y ninguna bisagra', () => {
    const geometry = geometryOf({ type: 'corredera' })

    expect(geometry.shapes.some((shape) => shape.kind === 'rail')).toBe(true)
    expect(geometry.shapes.some((shape) => shape.kind === 'wall')).toBe(true)
    expect(geometry.shapes.some((shape) => shape.kind === 'hinge')).toBe(false)
  })
})

describe('modelo 2D · tirador y mirilla acotados (B1)', () => {
  const types = TIPOS_2D_MVP

  it('nunca salen de la hoja ni del viewBox en alturas de catálogo', () => {
    for (const type of types) {
      for (const height of [400, 600, 1000, 1200, 2030, 3200]) {
        const geometry = geometryOf({ type, heightMm: height })
        const leaf = leafRects(geometry)[0]
        const handle = geometry.shapes.find((shape) => shape.kind === 'handle')
        const peephole = geometry.shapes.find((shape) => shape.kind === 'peephole')

        expect(leaf, `${type} ${height}: hoja`).toBeDefined()
        expect(handle, `${type} ${height}: tirador`).toBeDefined()
        if (!leaf || !handle) {
          continue
        }

        expect(isInsideLeaf(handle, leaf), `${type} H=${height}: tirador en la hoja`).toBe(true)
        expect(
          peephole === undefined || isInsideLeaf(peephole, leaf),
          `${type} H=${height}: mirilla`,
        ).toBe(true)
      }
    }
  })

  it('barre H ∈ [200, 10000] mm sin que nada se salga', () => {
    for (const type of types) {
      for (let height = 200; height <= 10000; height += 10) {
        const geometry = geometryOf({ type, heightMm: height })
        const leaf = leafRects(geometry)[0]
        const handle = geometry.shapes.find((shape) => shape.kind === 'handle')

        if (!isInsideViewBox(geometry) || !leaf || !handle || !isInsideLeaf(handle, leaf)) {
          throw new Error(`${type}: geometría fuera de rango con H=${height}`)
        }
      }
    }
  })

  it('con H < 200 mm la geometría sigue siendo finita y no negativa', () => {
    for (const type of types) {
      for (const height of [1, 5, 19, 31, 60, 85, 141, 169, 199]) {
        const geometry = geometryOf({ type, heightMm: height })

        expect(
          geometry.shapes.every(
            (shape) =>
              [shape.x, shape.y, shape.w, shape.h].every(Number.isFinite) &&
              shape.w >= 0 &&
              shape.h >= 0,
          ),
          `${type} H=${height}`,
        ).toBe(true)
      }
    }
  })
})

describe('modelo 2D · determinismo, espejo y rango', () => {
  it('es determinista para el mismo PreviewConfig', () => {
    expect(JSON.stringify(geometryOf({ colorCode: 'ROBLE' }))).toBe(
      JSON.stringify(geometryOf({ colorCode: 'ROBLE' })),
    )
  })

  it('la mano izquierda es el espejo exacto, también con capas superpuestas (M11 + C1)', () => {
    for (const type of TIPOS_2D_MVP) {
      expectMirrored(type)
    }

    expectMirrored('abatible-2-hojas', { planking: 'duelas-verticales' })
    expectMirrored('pivotante-1-hoja', {
      moulding: true,
      twoToneFrame: true,
      secondColorHex: '#9aa2a9',
    })
    expectMirrored('pivotante-2-hojas', {
      planking: 'tablones-curvos-54',
      aperturas: [
        { x: 0.3, y: 0.1, w: 0.2, h: 0.2, forma: 'rect' },
        { x: 0.55, y: 0.5, w: 0.15, h: 0.2, forma: 'luna' },
      ],
      moulding: true,
    })
    /* C1/CIF-158: los huecos de cristal de la hoja simple también se recolocan con la mano. */
    expectMirrored('abatible-1-hoja', { aperturas: APERTURAS_HOJA_SIMPLE })
    expectMirrored('entrada-acorazada', { aperturas: APERTURAS_HOJA_SIMPLE })
  })

  it('el hueco de cristal de la hoja simple se recoloca con la mano (CIF-158)', () => {
    const glazingCenter = (type: DoorType, hingeSide: 'derecha' | 'izquierda'): number => {
      const glazing = geometryOf({
        type,
        widthMm: 900,
        hingeSide,
        aperturas: APERTURAS_HOJA_SIMPLE,
      }).shapes.find((shape) => shape.kind === 'glazing')

      expect(glazing, `${type} ${hingeSide}: hueco de cristal`).toBeDefined()

      return glazing === undefined ? Number.NaN : glazing.x + glazing.w / 2
    }

    /* Tabla de CIF-158: sin espejo, la columna izquierda repetía la derecha. */
    expect(glazingCenter('abatible-1-hoja', 'derecha')).toBeCloseTo(274.5, 2)
    expect(glazingCenter('abatible-1-hoja', 'izquierda')).toBeCloseTo(625.5, 2)
    expect(glazingCenter('entrada-acorazada', 'derecha')).toBeCloseTo(285.3, 2)
    expect(glazingCenter('entrada-acorazada', 'izquierda')).toBeCloseTo(614.7, 2)
  })

  it('la corredera no tiene mano', () => {
    const right = signature(geometryOf({ type: 'corredera', hingeSide: 'derecha' }))
    const left = signature(geometryOf({ type: 'corredera', hingeSide: 'izquierda' }))

    expect(right).toBe(left)
  })

  it('fuera de rango se propaga y se dibuja con contorno discontinuo (no solo color)', () => {
    const geometry = geometryOf({ withinSeriesRange: false })
    const outline = geometry.shapes.find((shape) => shape.kind === 'outline')

    expect(geometry.outOfRange).toBe(true)
    expect(outline?.tone).toBe('danger')
    expect(outline?.paint.dash).toBe('10 8')
  })
})

describe('modelo 2D · acabados y capas', () => {
  it('el color sin hexadecimal pinta neutro, sin textura y con etiqueta', () => {
    const geometry = geometryOf({ finishKind: 'sin-acabado', colorHex: null })
    const leaf = geometry.shapes.find((shape) => shape.kind === 'leaf')

    expect(leaf?.paint.fill).toBe('#D9D9D9')
    expect(leaf?.paint.label).toBe('colorUndefined')
    expect(geometry.finishPattern).toBeNull()
    expect(geometry.shapes.some((shape) => shape.kind === 'finish')).toBe(false)
  })

  it('resuelve el patrón del acabado en el módulo (el componente no deduce nada)', () => {
    expect(geometryOf({ finishKind: 'lacado' }).finishPattern).toBe('sheen')
    expect(geometryOf({ finishKind: 'chapa-natural' }).finishPattern).toBe('grain')
    expect(geometryOf({ finishKind: 'decorado-madera' }).finishPattern).toBe('grain')
    expect(geometryOf({ finishKind: 'aluminio' }).finishPattern).toBe('anodized')
    expect(geometryOf({ finishKind: 'anodizado' }).finishPattern).toBe('anodized')
    expect(geometryOf({ finishKind: 'acero' }).finishPattern).toBe('metalFinish')
    expect(geometryOf({ finishKind: 'corten' }).finishPattern).toBe('metalFinish')
  })

  it('toda forma lleva pintura resuelta y solo se declaran los patrones usados', () => {
    for (const type of ALL_TYPES) {
      const geometry = geometryOf({ type })

      expect(
        geometry.shapes.every((shape) => shape.paint.fill.length > 0),
        type,
      ).toBe(true)
      expect(
        geometry.patternSpecs.every((spec) => spec.kind && spec.id),
        type,
      ).toBe(true)
    }
  })

  it('el acristalamiento y la ventilación dibujan formas distintas', () => {
    const withStrip = geometryOf({ glazing: 'franja-superior' })
    const total = geometryOf({ glazing: 'total' })
    const base = geometryOf({ glazing: 'ninguno', ventilation: 'ninguno' })

    expect(withStrip.shapes.some((shape) => shape.kind === 'glazing')).toBe(true)
    expect(
      geometryOf({ ventilation: 'inferior' }).shapes.some((shape) => shape.kind === 'louver'),
    ).toBe(true)
    expect(signature(total)).not.toBe(signature(withStrip))
    expect(withStrip.shapes.length).toBeGreaterThan(base.shapes.length)
  })

  it('las capas del catálogo real (v5) emiten sus formas', () => {
    const planks = geometryOf({ planking: 'tablones-36' })
    const curved = geometryOf({ planking: 'tablones-curvos-54' })
    const glazed = geometryOf({
      aperturas: [{ x: 0.3, y: 0.1, w: 0.2, h: 0.2, forma: 'rect' }],
    })
    const bicolor = geometryOf({ twoToneFrame: true, secondColorHex: '#9aa2a9' })
    const moulded = geometryOf({ moulding: true })
    const twoLeaves = geometryOf({ type: 'abatible-2-hojas', planking: 'tablones-36' })
    const vertical = geometryOf({ planking: 'duelas-verticales' })

    expect(planks.shapes.some((shape) => shape.kind === 'plank')).toBe(true)
    expect(planks.shapes.some((shape) => shape.kind === 'strip')).toBe(true)
    expect(curved.shapes.some((shape) => shape.kind === 'moulding')).toBe(true)
    expect(vertical.shapes.filter((shape) => shape.kind === 'strip').length).toBeGreaterThan(0)
    expect(glazed.shapes.some((shape) => shape.kind === 'glazing')).toBe(true)
    expect(
      bicolor.shapes.some((shape) => shape.kind === 'frame' && shape.paint.fill === '#9aa2a9'),
    ).toBe(true)
    expect(moulded.shapes.some((shape) => shape.kind === 'moulding')).toBe(true)
    expect(
      twoLeaves.shapes.filter((shape) => shape.kind === 'plank').length,
    ).toBeGreaterThanOrEqual(2)
  })

  it('las capas superpuestas van por encima de la hoja y por debajo del herraje', () => {
    const geometry = geometryOf({ planking: 'duelas-verticales' })
    const kinds = geometry.shapes.map((shape) => shape.kind)
    const leafIndex = kinds.lastIndexOf('leaf')
    const plankIndex = kinds.indexOf('plank')
    const stripIndex = kinds.indexOf('strip')
    const hingeIndex = kinds.indexOf('hinge')

    expect(plankIndex).toBeGreaterThan(leafIndex)
    expect(stripIndex).toBeGreaterThan(plankIndex)
    expect(hingeIndex).toBeGreaterThan(stripIndex)
  })
})

describe('modelo 2D · pivotantes (H9 y H12)', () => {
  it('el rodamiento se emite como caja 2r × 2r con r = max(22, round(0.018·W))', () => {
    const geometry = geometryOf({ type: 'pivotante-1-hoja' })
    const pivots = geometry.shapes.filter((shape) => shape.kind === 'pivot')
    const expectedRadius = Math.max(22, Math.round(0.018 * W))

    expect(pivots).toHaveLength(2)
    expect(
      pivots.every((shape) => shape.w === 2 * expectedRadius && shape.h === 2 * expectedRadius),
    ).toBe(true)
  })

  it('hingeSide cambia la geometría y no hay bisagras en las pivotantes (H9)', () => {
    for (const type of ['pivotante-1-hoja', 'pivotante-2-hojas'] as const) {
      const right = signature(geometryOf({ type, hingeSide: 'derecha' }))
      const left = signature(geometryOf({ type, hingeSide: 'izquierda' }))

      expect(right, type).not.toBe(left)
      expect(
        geometryOf({ type }).shapes.some((shape) => shape.kind === 'hinge'),
        type,
      ).toBe(false)
    }
  })

  it('la pivotante de dos hojas lleva un par de rodamientos por hoja', () => {
    const geometry = geometryOf({ type: 'pivotante-2-hojas' })

    expect(geometry.shapes.filter((shape) => shape.kind === 'pivot')).toHaveLength(4)
    expect(leafRects(geometry)).toHaveLength(2)
  })
})

describe('modelo 2D · pintura de los patrones (B2/§4, hallazgo 7 de CIF-240)', () => {
  const specOf = (
    overrides: Partial<PreviewConfig>,
    kind: PreviewPaintPattern,
  ): PreviewGeometry['patternSpecs'][number] | undefined =>
    geometryOf(overrides).patternSpecs.find((spec) => spec.kind === kind)

  const linearStops = (
    overrides: Partial<PreviewConfig>,
    kind: PreviewPaintPattern,
  ): readonly { offset: string; color: string; opacity: string }[] | null => {
    const paint = specOf(overrides, kind)?.paint

    return paint?.variant === 'linearGradient' ? paint.stops : null
  }

  it('declara los patrones en el orden canónico con el que se emite el <defs>', () => {
    const kindsOf = (overrides: Partial<PreviewConfig>): readonly string[] =>
      geometryOf(overrides).patternSpecs.map((spec) => spec.kind)

    expect(kindsOf({ type: 'corredera' })).toEqual(['sheen', 'glass', 'metal', 'wall'])
    expect(kindsOf({})).toEqual(['sheen', 'glass', 'metal'])
    expect(kindsOf({ finishKind: 'decorado-madera' })).toEqual(['glass', 'metal', 'grain'])
    expect(kindsOf({ finishKind: 'aluminio' })).toEqual(['glass', 'metal', 'anodized'])
    expect(kindsOf({ finishKind: 'acero' })).toEqual(['glass', 'metal', 'metalFinish'])
    expect(kindsOf({ finishKind: 'sin-acabado', colorHex: null })).toEqual(['glass', 'metal'])
  })

  it('resuelve el brillo del lacado con sus paradas y su orden', () => {
    expect(linearStops({}, 'sheen')).toEqual([
      { offset: '0', color: '#fff', opacity: '.16' },
      { offset: '.35', color: '#fff', opacity: '0' },
    ])
  })

  it('resuelve el cristal, el metal, la pared y el acabado metálico en el modelo', () => {
    const glass = specOf({}, 'glass')?.paint
    const metal = specOf({}, 'metal')?.paint
    const wall = specOf({ type: 'corredera' }, 'wall')?.paint
    const metalFinish = specOf({ finishKind: 'acero' }, 'metalFinish')?.paint

    expect(glass).toMatchObject({ variant: 'linearGradient', x1: '0', y1: '0', x2: '0', y2: '1' })
    expect(metal).toMatchObject({ variant: 'linearGradient', x1: '0', y1: '0', x2: '0', y2: '1' })
    expect(wall).toMatchObject({ variant: 'linearGradient', x1: '0', y1: '0', x2: '0', y2: '1' })
    expect(metalFinish).toMatchObject({
      variant: 'linearGradient',
      x1: '0',
      y1: '0',
      x2: '1',
      y2: '0',
    })

    expect(linearStops({}, 'glass')).toEqual([
      { offset: '0', color: '#dbe8f0', opacity: '1' },
      { offset: '1', color: '#b9cddd', opacity: '1' },
    ])
    expect(linearStops({}, 'metal')).toEqual([
      { offset: '0', color: '#f2f4f5', opacity: '1' },
      { offset: '.45', color: '#c6ccd1', opacity: '1' },
      { offset: '1', color: '#9aa2a9', opacity: '1' },
    ])
    expect(linearStops({ type: 'corredera' }, 'wall')).toEqual([
      { offset: '0', color: '#000', opacity: '.10' },
      { offset: '1', color: '#000', opacity: '.05' },
    ])
    expect(linearStops({ finishKind: 'acero' }, 'metalFinish')).toEqual([
      { offset: '0', color: '#000', opacity: '.12' },
      { offset: '.5', color: '#fff', opacity: '.12' },
      { offset: '1', color: '#000', opacity: '.12' },
    ])
  })

  it('el anodizado declara sus tres rects en orden (variante tile)', () => {
    expect(specOf({ finishKind: 'anodizado' }, 'anodized')?.paint).toEqual({
      variant: 'tile',
      width: '6',
      height: '6',
      patternUnits: 'userSpaceOnUse',
      tiles: [
        { w: '6', h: '6', fill: 'none' },
        { w: '1.2', h: '6', fill: 'rgba(255,255,255,.10)' },
        { x: '3', w: '0.8', h: '6', fill: 'rgba(0,0,0,.06)' },
      ],
    })
  })

  it('el veteado viaja resuelto y sigue siendo determinista por colorCode', () => {
    const paint = specOf({ finishKind: 'decorado-madera' }, 'grain')?.paint

    expect(paint?.variant).toBe('veins')

    if (paint?.variant !== 'veins') {
      return
    }

    expect(paint.stroke).toBe('rgba(0,0,0,.10)')
    expect(paint.veins).toHaveLength(12)
    expect(paint.veins[0]).toEqual({ d: 'M5.95 0 C 7.15 30, 5.95 70, 6.55 100', width: '1.35' })
    expect(paint.veins.at(-1)?.d).toMatch(/^M[\d.]+ 0 C /)
    expect(specOf({ finishKind: 'decorado-madera' }, 'grain')?.paint).toEqual(paint)
    expect(
      specOf({ finishKind: 'decorado-madera', colorCode: 'RAL 9010' }, 'grain')?.paint,
    ).not.toEqual(paint)
  })

  it('el orden canónico no repite ningún kind (H3)', () => {
    expect(new Set(PATTERN_SPEC_ORDER).size).toBe(PATTERN_SPEC_ORDER.length)
  })

  it('todo kind de patternSpecs pertenece al orden canónico y respeta su orden (H3)', () => {
    const finishes: readonly FinishKind[] = [
      'lacado',
      'chapa-natural',
      'decorado-madera',
      'aluminio',
      'anodizado',
      'acero',
      'corten',
      'sin-acabado',
    ]
    const configs: readonly Partial<PreviewConfig>[] = [
      ...ALL_TYPES.map((type) => ({ type })),
      ...finishes.map((finishKind) => ({ finishKind })),
      { type: 'corredera', finishKind: 'chapa-natural', twoToneFrame: true, moulding: true },
      { colorHex: null, colorCode: 'a-definir', withinSeriesRange: false },
      {
        type: 'garaje-seccional',
        finishKind: 'anodizado',
        glazing: 'total',
        ventilation: 'inferior',
      },
    ]
    const failures: string[] = []

    for (const overrides of configs) {
      const geometry = geometryOf(overrides)
      const kinds = geometry.patternSpecs.map((spec) => spec.kind)
      const declared = new Set(geometry.patternSpecs.map((spec) => spec.id))
      const positions = kinds.map((kind) => PATTERN_SPEC_ORDER.indexOf(kind))
      const label = JSON.stringify(overrides)
      const painted = new Set<string>()

      if (new Set(kinds).size !== kinds.length) {
        failures.push(`${label}: patternSpecs repite kinds (${kinds.join(', ')})`)
      }

      if (
        positions.some((position) => position < 0) ||
        positions.some((p, i) => i > 0 && p < (positions[i - 1] ?? 0))
      ) {
        failures.push(`${label}: ${kinds.join(', ')} no sigue ${PATTERN_SPEC_ORDER.join(', ')}`)
      }

      for (const shape of geometry.shapes) {
        if (shape.paint.pattern !== null && !kinds.includes(shape.paint.pattern)) {
          failures.push(`${label}: la forma ${shape.kind} usa ${shape.paint.pattern} sin <defs>`)
        }

        /* H3-b de CIF-267: el relleno real de los tonos (`glass`, `metal`, `wall`) viaja en
           `paint.fill` como `url(#…)` y deja `paint.pattern` a `null`; hay que mirarlo también. */
        for (const [, id = ''] of shape.paint.fill.matchAll(URL_REF)) {
          painted.add(id)

          if (!declared.has(id)) {
            failures.push(`${label}: la forma ${shape.kind} pinta ${shape.paint.fill} sin <defs>`)
          }
        }
      }

      for (const id of declared) {
        if (!painted.has(id)) {
          failures.push(
            `${label}: el patrón ${id} se declara en <defs> pero ninguna forma lo pinta`,
          )
        }
      }
    }

    expect(failures).toEqual([])
  })
})

describe('modelo 2D · alcance y contrato', () => {
  it('marca el alcance MVP y los tipos de referencia que no se publican', () => {
    for (const type of TIPOS_2D_MVP) {
      expect(geometryOf({ type }).alcance, type).toBe('mvp')
      expect(geometryOf({ type }).notImplemented, type).toBe(false)
    }

    for (const type of TIPOS_2D_REFERENCIA) {
      expect(geometryOf({ type }).alcance, type).toBe('referencia')
      expect(geometryOf({ type }).notImplemented, type).toBe(true)
    }
  })

  it('solo emite kinds declarados en PREVIEW_SHAPE_KINDS', () => {
    for (const type of ALL_TYPES) {
      for (const shape of geometryOf({ type }).shapes) {
        expect(PREVIEW_SHAPE_KINDS).toContain(shape.kind)
      }
    }
  })

  it('es rápido: 1000 geometrías por debajo de 1 ms de media', () => {
    const start = performance.now()

    for (let index = 0; index < 1000; index += 1) {
      buildPreviewGeometry({ ...BASE, widthMm: 800 + (index % 50) })
    }

    const elapsed = performance.now() - start

    expect(elapsed / 1000).toBeLessThan(1)
  })
})
