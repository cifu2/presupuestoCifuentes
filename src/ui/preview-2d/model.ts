/**
 * Modelo visual 2D del configurador (CIF-6) — módulo puro y determinista.
 *
 * Traducción directa del artefacto de referencia de Diseño (CIF-5):
 * - Bloque `MODELO-2D` de `prototipo-configurador.html` (v3, tipos ya aprobados, contrato
 *   `PreviewGeometry`/`PreviewPaint` y reglas B1/B3/M11).
 * - `modelo-2d-catalogo.mjs` v5.1 (CIF-116/CIF-131): tipos nuevos —`pivotante-1-hoja`,
 *   `pivotante-2-hojas`—, capas `planking`/`aperturas`/`moulding`/bicolor, `alcance` y el cierre
 *   de H9 (los pivotantes respetan `hingeSide` con la regla de espejo M11 completa, C1 incluido).
 *   Las hojas simples (`abatible-1-hoja`, `entrada-acorazada`) también se construyen en mano
 *   derecha canónica y pasan por M11 cuando la mano es izquierda (CIF-158).
 *
 * Reglas del contrato (`modelo-visual-2d` §1):
 * - Sin DOM, sin red, sin i18n y sin precios: solo geometría y pintura ya resueltas.
 * - Toda la geometría en milímetros reales; el `viewBox` escala solo (`-M -M W+2M H+2M`).
 * - `colorHex === null` → relleno neutro + `paint.label = 'colorUndefined'` (lo traduce la UI).
 * - Mismo `PreviewConfig` → misma `PreviewGeometry` (el veteado usa un hash del código de color).
 */

export const TIPOS_2D_MVP = [
  'abatible-1-hoja',
  'abatible-2-hojas',
  'entrada-acorazada',
  'pivotante-1-hoja',
  'pivotante-2-hojas',
] as const

export const TIPOS_2D_REFERENCIA = [
  'corredera',
  'garaje-seccional',
  'garaje-basculante',
  'garaje-enrollable',
] as const

export type MvpDoorType = (typeof TIPOS_2D_MVP)[number]
export type ReferenceDoorType = (typeof TIPOS_2D_REFERENCIA)[number]
export type DoorType = MvpDoorType | ReferenceDoorType

/** Kinds que el modelo puede emitir (`PREVIEW_SHAPE_KINDS` de la v5 + los del contrato v3). */
export const PREVIEW_SHAPE_KINDS = [
  'frame',
  'leaf',
  'finish',
  'hinge',
  'handle',
  'pivot',
  'axis',
  'lock',
  'peephole',
  'rail',
  'wall',
  'plank',
  'strip',
  'moulding',
  'glazing',
  'louver',
  'outline',
] as const

export type PreviewShapeKind = (typeof PREVIEW_SHAPE_KINDS)[number]

export type HingeSide = 'izquierda' | 'derecha'
export type Glazing = 'ninguno' | 'franja-superior' | 'total'
export type Ventilation = 'ninguno' | 'inferior'

/**
 * Acabado para la textura del 2D. `decorado-madera`, `anodizado` y `corten` son los nombres del
 * catálogo real (v5); `chapa-natural` y `aluminio` se mantienen porque la referencia v3 los usa y
 * mapean al mismo patrón.
 */
export type FinishKind =
  | 'lacado'
  | 'chapa-natural'
  | 'decorado-madera'
  | 'aluminio'
  | 'anodizado'
  | 'acero'
  | 'corten'
  | 'sin-acabado'

export type Planking =
  | 'tablones-36'
  | 'tablones-54'
  | 'tablones-curvos-36'
  | 'tablones-curvos-54'
  | 'duelas-verticales'
  | 'duelas-horizontales'

export type PreviewPaintPattern =
  'sheen' | 'grain' | 'anodized' | 'metalFinish' | 'glass' | 'metal' | 'wall'

export type PreviewTone =
  'base' | 'frame' | 'glass' | 'metal' | 'shadow' | 'wall' | 'danger' | 'second'

/** Hueco de cristal (H4): fracción relativa a la hoja (`0..1` desde su borde izquierdo). */
export interface GlassAperture {
  readonly hoja?: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly forma: 'rect' | 'redondo' | 'luna'
}

export interface PreviewConfig {
  readonly type: DoorType
  readonly widthMm: number
  readonly heightMm: number
  readonly hingeSide: HingeSide
  readonly glazing: Glazing
  readonly ventilation: Ventilation
  readonly finishKind: FinishKind
  readonly colorHex: string | null
  /** Código de color del catálogo: alimenta el hash determinista del veteado. */
  readonly colorCode: string
  readonly withinSeriesRange: boolean
  readonly planking?: Planking | null
  readonly aperturas?: readonly GlassAperture[]
  readonly twoToneFrame?: boolean
  readonly secondColorHex?: string | null
  readonly moulding?: boolean
}

/** Pintura ya resuelta por el módulo: el componente no decide ningún color ni textura. */
export interface PreviewPaint {
  readonly fill: string
  readonly stroke: string | null
  readonly strokeWidth: number
  readonly opacity: number
  readonly pattern: PreviewPaintPattern | null
  readonly veins: number
  readonly seed: number
  readonly dash: string | null
  readonly label: 'colorUndefined' | null
}

export interface PreviewShape {
  readonly kind: PreviewShapeKind
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly rx?: number
  readonly tone: PreviewTone
  readonly paint: PreviewPaint
}

export interface PreviewPatternSpec {
  readonly kind: PreviewPaintPattern
  readonly id: string
  readonly veins: number
  readonly seed: number
}

export interface PreviewGeometry {
  readonly viewBox: readonly [number, number, number, number]
  readonly shapes: readonly PreviewShape[]
  readonly outOfRange: boolean
  readonly finishPattern: PreviewPaintPattern | null
  readonly patternSpecs: readonly PreviewPatternSpec[]
  readonly alcance: 'mvp' | 'referencia'
  /** Los tipos de referencia (`garaje-*`, `corredera`) no se publican en el configurador del MVP. */
  readonly notImplemented: boolean
}

type MutablePreviewShape = { -readonly [Key in keyof PreviewShape]: PreviewShape[Key] }

export const NEUTRAL_FILL = '#D9D9D9'
export const LEAF_STROKE = 'rgba(23,32,42,.25)'
export const LEAF_STROKE_ON_DARK = 'rgba(255,255,255,.25)'
export const DANGER_STROKE = 'rgba(179,38,30,.9)'
/** Contorno de la moldura perimetral y de los tablones curvos (SVG v5.1 de Diseño). */
export const MOULDING_STROKE = '#98a2ab'
/** Eje de giro de las pivotantes: guía de revisión, va oculto en el producto real. */
export const AXIS_STROKE = '#f7f7f5'

const PATTERN_KINDS: readonly PreviewPaintPattern[] = [
  'sheen',
  'grain',
  'anodized',
  'metalFinish',
  'glass',
  'metal',
  'wall',
]

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

export function hashString(value: string): number {
  let hash = 0

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 100003
  }

  return hash
}

/** Luminancia relativa WCAG de un `#RRGGBB` (elige el contorno claro u oscuro de la hoja). */
export function luminance(hex: string | null): number {
  if (!hex) {
    return 1
  }

  const parsed = Number.parseInt(hex.slice(1), 16)
  const channels = [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255].map((channel) => {
    const normalized = channel / 255

    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
  })

  const [red = 1, green = 1, blue = 1] = channels

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function patternForFinish(finishKind: FinishKind): PreviewPaintPattern | null {
  const patterns: Partial<Record<FinishKind, PreviewPaintPattern>> = {
    lacado: 'sheen',
    'chapa-natural': 'grain',
    'decorado-madera': 'grain',
    aluminio: 'anodized',
    anodizado: 'anodized',
    acero: 'metalFinish',
    corten: 'metalFinish',
  }

  return patterns[finishKind] ?? null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

interface PushOptions {
  readonly tone?: PreviewTone
  readonly rx?: number
}

export function buildPreviewGeometry(config: PreviewConfig): PreviewGeometry {
  const { type, widthMm: W, heightMm: H } = config
  const finish = config.finishKind
  const hex = config.colorHex
  const neutral = hex === null || finish === 'sin-acabado'
  const fillHex = neutral ? NEUTRAL_FILL : hex
  const second = config.secondColorHex ?? fillHex

  const F = Math.round(
    clamp(0.06 * Math.min(W, H), 60, 110) * (type === 'entrada-acorazada' ? 1.4 : 1),
  )
  const s = Math.max(2, Math.round(0.004 * Math.min(W, H)))
  const railH = Math.max(40, Math.round(0.04 * H))
  const M = Math.round(
    type === 'corredera'
      ? Math.max(clamp(0.03 * Math.min(W, H), 30, 90), railH + 10)
      : clamp(0.03 * Math.min(W, H), 30, 90),
  )
  const abW = Math.max(0, W - 2 * F)
  const abH = Math.max(0, H - 2 * F)
  const hingeLeft = config.hingeSide === 'izquierda'
  const isMvp = (TIPOS_2D_MVP as readonly string[]).includes(type)

  const shapes: MutablePreviewShape[] = []
  const overlayShapes: MutablePreviewShape[] = []
  const leafRects: [number, number, number, number][] = []
  const patternSpecs = new Map<PreviewPaintPattern, PreviewPatternSpec>()
  const seed = hashString(config.colorCode || 'x')
  let insertAt = 0

  const patternFill = (kind: PreviewPaintPattern): string => {
    if (!PATTERN_KINDS.includes(kind)) {
      return 'none'
    }

    if (!patternSpecs.has(kind)) {
      patternSpecs.set(kind, { kind, id: kind, veins: kind === 'grain' ? 12 : 0, seed })
    }

    return `url(#${kind})`
  }

  const makeShape = (
    kind: PreviewShapeKind,
    x: number,
    y: number,
    w: number,
    h: number,
    options: PushOptions = {},
  ): MutablePreviewShape => {
    const tone = options.tone ?? 'base'
    let fill = 'none'
    let pattern: PreviewPaintPattern | null = null

    if (tone === 'base') {
      fill = fillHex
    } else if (tone === 'glass') {
      fill = patternFill('glass')
    } else if (tone === 'metal') {
      fill = patternFill('metal')
    } else if (tone === 'frame') {
      /* v5: el cerco se pinta con el mismo tono metal que el herraje; el bicolor lo cambia a `second`. */
      fill = patternFill('metal')
    } else if (tone === 'wall') {
      fill = patternFill('wall')
    } else if (tone === 'second') {
      fill = second
    }

    if (kind === 'finish' && !neutral) {
      const finishPattern = patternForFinish(finish)

      if (finishPattern) {
        pattern = finishPattern
        fill = patternFill(finishPattern)
      }
    }

    if (kind === 'moulding' || kind === 'axis') {
      /* Molduras y eje son contornos: nunca relleno (SVG v5.1 de Diseño). */
      fill = 'none'
    }

    const darkLeaf = tone === 'base' && !neutral && hex !== null && luminance(hex) < 0.05
    let stroke: string | null

    if (kind === 'finish') {
      stroke = null
    } else if (kind === 'moulding') {
      stroke = MOULDING_STROKE
    } else if (kind === 'axis') {
      stroke = AXIS_STROKE
    } else if (tone === 'danger') {
      stroke = DANGER_STROKE
    } else if (darkLeaf) {
      stroke = LEAF_STROKE_ON_DARK
    } else {
      stroke = LEAF_STROKE
    }

    const dash = kind === 'axis' ? '5 5' : tone === 'danger' ? '10 8' : null

    return {
      kind,
      tone,
      x: round2(x),
      y: round2(y),
      w: round2(Math.max(0, w)),
      h: round2(Math.max(0, h)),
      ...(options.rx === undefined ? {} : { rx: options.rx }),
      paint: {
        fill,
        stroke,
        strokeWidth: kind === 'leaf' ? 2 : 1.5,
        opacity: tone === 'wall' ? 0.1 : 1,
        pattern,
        veins: pattern === 'grain' ? 12 : 0,
        seed,
        dash,
        label: tone === 'base' && neutral ? 'colorUndefined' : null,
      },
    }
  }

  const push = (
    kind: PreviewShapeKind,
    x: number,
    y: number,
    w: number,
    h: number,
    options: PushOptions = {},
  ): void => {
    shapes.push(makeShape(kind, x, y, w, h, options))
  }

  const overlay = (
    kind: PreviewShapeKind,
    x: number,
    y: number,
    w: number,
    h: number,
    options: PushOptions = {},
  ): void => {
    overlayShapes.push(makeShape(kind, x, y, w, h, options))
  }

  const frame = (x: number, y: number, w: number, h: number): void => {
    push('frame', x, y, w, h, { tone: config.twoToneFrame ? 'second' : 'frame' })
  }
  const hingeAt = (hingeX: number, centerY: number): void => {
    push('hinge', hingeX - 8, centerY - 30, 16, Math.max(60, Math.round(0.05 * abH)), {
      rx: 6,
      tone: 'metal',
    })
  }
  const hingeRows = (): number[] => {
    const count = H > 2200 ? 4 : 3

    return Array.from(
      { length: count },
      (_, index) => F + abH * (0.12 + (0.76 * index) / (count - 1)),
    )
  }

  /* B1: el tirador y la mirilla se acotan al hueco real de la hoja, también con alturas pequeñas. */
  const mv = Math.min(s, Math.floor(abH / 2))
  const largoUtil = (length: number): number => Math.min(length, Math.max(0, abH - 2 * mv))
  const tiradorL = clamp(Math.round(0.1 * H), 110, 200)
  const tiradorT = Math.max(10, Math.round(0.014 * W))
  const tiradorY = (length: number): number =>
    clamp(
      H - clamp(Math.round(0.42 * H), 950, 1100) - length / 2,
      F + mv,
      Math.max(F + mv, F + abH - length - mv),
    )

  const markLeaf = (x: number, y: number, w: number, h: number): void => {
    leafRects.push([x, y, w, h])
    insertAt = shapes.length
  }

  /* Regla de espejo M11: refleja TODA la geometría (formas y hojas) sobre el eje vertical central.
     `aperturas` es relativa a la hoja, así que después hay que voltear su fracción `x` (C1). */
  let mirrored = false
  const mirrorM11 = (): void => {
    mirrored = true

    for (const shape of shapes) {
      shape.x = round2(W - shape.x - shape.w)
    }

    for (let index = 0; index < leafRects.length; index += 1) {
      const rect = leafRects[index]

      if (rect) {
        leafRects[index] = [round2(W - rect[0] - rect[2]), rect[1], rect[2], rect[3]]
      }
    }
  }

  if (type === 'corredera') {
    push('rail', -M / 2, -railH, W + M / 2, railH, { tone: 'metal' })
    const leafW = Math.min(Math.max(0, W - F), Math.round(0.92 * abW))
    const leafH = Math.max(0, abH - railH - s)
    push('leaf', F, railH + s, leafW, leafH)
    if (!neutral) {
      push('finish', F, railH + s, leafW, leafH)
    }
    markLeaf(F, railH + s, leafW, leafH)
    push('wall', F + leafW, 0, Math.max(0, W - F - leafW), H, { tone: 'wall' })
    frame(F - s, 0, s, H)
    frame(W - F, 0, Math.min(s, W - F), H)
    const handleHeight = Math.max(0, Math.min(clamp(Math.round(0.18 * H), 200, 350), leafH))
    push(
      'handle',
      F + leafW - tiradorT - Math.round(0.04 * W),
      clamp(
        H / 2 - handleHeight / 2,
        railH + s,
        Math.max(railH + s, railH + s + leafH - handleHeight),
      ),
      tiradorT,
      handleHeight,
      { rx: tiradorT / 2, tone: 'metal' },
    )
  } else if (
    type === 'garaje-seccional' ||
    type === 'garaje-basculante' ||
    type === 'garaje-enrollable'
  ) {
    frame(0, 0, W, F)
    frame(0, H - F, W, F)
    frame(0, F, F, abH)
    frame(W - F, F, F, abH)
    push('leaf', F, F, abW, abH)
    if (!neutral) {
      push('finish', F, F, abW, abH)
    }
    markLeaf(F, F, abW, abH)

    if (type === 'garaje-seccional') {
      for (let index = 1; index < 5; index += 1) {
        push('rail', F, F + (abH * index) / 5 - s / 2, abW, s, { tone: 'metal' })
      }
    } else if (type === 'garaje-basculante') {
      push('rail', F, F + abH * 0.34, abW, s, { tone: 'metal' })
    } else {
      for (let index = 1; index < 22; index += 1) {
        push('rail', F, F + (abH * index) / 22 - 1, abW, 2, { tone: 'metal' })
      }
    }

    push('handle', W - F - tiradorT - Math.round(0.06 * abW), H - F - 120, tiradorT, 100, {
      tone: 'metal',
    })
  } else if (type === 'pivotante-1-hoja' || type === 'pivotante-2-hojas') {
    frame(0, 0, W, F)
    frame(0, H - F, W, F)
    frame(0, F, F, abH)
    frame(W - F, F, F, abH)

    const radius = Math.max(22, Math.round(0.018 * W))
    const axisOffset = clamp(Math.round(0.1 * abW), 50, 180)

    /* H9: en las pivotantes `hingeSide` es el lado del eje de giro. Se construye en mano derecha
       (eje hacia el cerco derecho) y se refleja con M11, igual que la abatible de dos hojas.
       H12: el rodamiento es una caja 2r × 2r y el SVG pinta un círculo de radio r. */
    const pivot = (pivotX: number): void => {
      push('axis', pivotX - 1, F, 2, abH, { tone: 'metal' })
      push('pivot', pivotX - radius, F, 2 * radius, 2 * radius, { tone: 'metal' })
      push('pivot', pivotX - radius, H - F - 2 * radius, 2 * radius, 2 * radius, { tone: 'metal' })
    }

    if (type === 'pivotante-1-hoja') {
      push('leaf', F, F, abW, abH)
      if (!neutral) {
        push('finish', F, F, abW, abH)
      }
      markLeaf(F, F, abW, abH)
      pivot(W - F - axisOffset)
      const handleLength = largoUtil(tiradorL)
      push('handle', F + Math.round(0.06 * abW), tiradorY(handleLength), tiradorT, handleLength, {
        rx: tiradorT / 2,
        tone: 'metal',
      })
    } else {
      const overlap = Math.max(15, Math.round(0.02 * abW))
      const activeW = Math.round(abW * 0.52)
      const passiveW = abW - activeW + overlap
      const passiveX = F
      const activeX = F + passiveW - overlap
      const mullionX = F + passiveW - overlap / 2

      push('leaf', passiveX, F, passiveW, abH)
      if (!neutral) {
        push('finish', passiveX, F, passiveW, abH)
      }
      push('leaf', activeX, F, activeW, abH)
      if (!neutral) {
        push('finish', activeX, F, activeW, abH)
      }
      markLeaf(passiveX, F, passiveW, abH)
      markLeaf(activeX, F, activeW, abH)

      pivot(passiveX + clamp(Math.round(0.1 * passiveW), 50, 180))
      pivot(activeX + activeW - clamp(Math.round(0.1 * activeW), 50, 180))

      const handleLength = largoUtil(clamp(Math.round(0.18 * H), 200, 350))
      push(
        'handle',
        mullionX - tiradorT / 2,
        clamp(H / 2 - handleLength / 2, F + mv, Math.max(F + mv, F + abH - handleLength - mv)),
        tiradorT,
        handleLength,
        { rx: tiradorT / 2, tone: 'metal' },
      )
      const secondaryLength = largoUtil(120)
      push(
        'handle',
        passiveX + passiveW - 40,
        clamp(H / 2 - 60, F + mv, Math.max(F + mv, F + abH - 120 - mv)),
        20,
        secondaryLength,
        { rx: 4, tone: 'metal' },
      )
    }

    if (hingeLeft) {
      mirrorM11()
    }
  } else {
    frame(0, 0, W, F)
    frame(0, H - F, W, F)
    frame(0, F, F, abH)
    frame(W - F, F, F, abH)

    if (type === 'abatible-2-hojas') {
      const overlap = Math.max(15, Math.round(0.02 * abW))
      const activeW = Math.round(abW * 0.52)
      const passiveW = abW - activeW + overlap
      const passiveX = F
      const activeX = F + passiveW - overlap
      const mullionX = F + passiveW - overlap / 2

      push('leaf', passiveX, F, passiveW, abH)
      if (!neutral) {
        push('finish', passiveX, F, passiveW, abH)
      }
      push('leaf', activeX, F, activeW, abH)
      if (!neutral) {
        push('finish', activeX, F, activeW, abH)
      }
      markLeaf(passiveX, F, passiveW, abH)
      markLeaf(activeX, F, activeW, abH)

      /* 6 bisagras (3 por hoja, 4 si H > 2200) en el borde exterior de cada hoja. */
      for (const centerY of hingeRows()) {
        hingeAt(F, centerY)
        hingeAt(W - F, centerY)
      }

      const handleLength = largoUtil(clamp(Math.round(0.18 * H), 200, 350))
      push('handle', mullionX - tiradorT / 2, tiradorY(handleLength), tiradorT, handleLength, {
        rx: tiradorT / 2,
        tone: 'metal',
      })
      const secondaryLength = largoUtil(120)
      push('handle', passiveX + passiveW - 40, tiradorY(secondaryLength), 20, secondaryLength, {
        rx: 4,
        tone: 'metal',
      })

      if (hingeLeft) {
        mirrorM11()
      }
    } else {
      push('leaf', F, F, abW, abH)
      if (!neutral) {
        push('finish', F, F, abW, abH)
      }
      markLeaf(F, F, abW, abH)

      /* Hojas simples: se construyen en mano derecha canónica (bisagras en el cerco derecho,
         tirador/cerradura en el lado opuesto, B3) y se reflejan enteras con M11 si la mano es
         izquierda; así C1 también recoloca `aperturas`. Nada de ternarios por mano aquí dentro:
         los ternarios doblarían el reflejo. */
      for (const centerY of hingeRows()) {
        hingeAt(W - F, centerY)
      }

      if (type === 'entrada-acorazada') {
        const barW = 200
        const barH = largoUtil(30)
        const barX = F + Math.round(0.06 * abW)
        push('handle', barX, tiradorY(barH), barW, barH, { rx: 6, tone: 'metal' })

        /* Cerradura de 3 puntos: lado del tirador / borde de cierre (opuesto a las bisagras). */
        const lockX = F
        for (const position of [0.18, 0.5, 0.82]) {
          push('lock', lockX, F + abH * position - 45, 24, 90, { rx: 4, tone: 'metal' })
        }

        /* Mirilla: radio y altura acotados al hueco real de la hoja (B1). */
        const radius = Math.max(14, Math.round(0.012 * W))
        const effectiveRadius = Math.min(radius, Math.max(0, Math.floor((abH - 2 * mv) / 2)))
        const eyeY = clamp(
          H - clamp(Math.round(0.62 * H), 1500, 1650) - effectiveRadius,
          F + mv,
          Math.max(F + mv, F + abH - 2 * effectiveRadius - mv),
        )
        push('peephole', W / 2 - effectiveRadius, eyeY, 2 * effectiveRadius, 2 * effectiveRadius, {
          tone: 'metal',
        })
      } else {
        const handleLength = largoUtil(tiradorL)
        const handleX = F + Math.round(0.06 * abW)
        push('handle', handleX, tiradorY(handleLength), tiradorT, handleLength, {
          rx: tiradorT / 2,
          tone: 'metal',
        })
      }

      if (hingeLeft) {
        mirrorM11()
      }
    }
  }

  /* Capas superpuestas (v5): se insertan justo encima de la última hoja y por debajo del herraje. */
  if (config.planking) {
    const kind = config.planking
    const vertical = kind === 'duelas-verticales'
    const curved = kind.startsWith('tablones-curvos')
    let board = 180

    if (kind === 'tablones-36' || kind === 'tablones-curvos-36') {
      board = 360
    }
    if (kind === 'tablones-54' || kind === 'tablones-curvos-54') {
      board = 540
    }

    for (const [leafX, leafY, leafW, leafH] of leafRects) {
      overlay('plank', leafX, leafY, leafW, leafH)
      const count = Math.max(1, Math.round((vertical ? leafW : leafH) / board))

      for (let index = 1; index < count; index += 1) {
        if (vertical) {
          overlay('strip', round2(leafX + (leafW * index) / count - 1), leafY, 2, leafH, {
            tone: 'metal',
          })
        } else {
          const stripY = round2(leafY + (leafH * index) / count - 1)
          overlay('strip', leafX, stripY, leafW, 2, { tone: 'metal' })

          if (curved) {
            overlay('moulding', leafX, round2(stripY - 6), leafW, 3, { tone: 'metal' })
          }
        }
      }
    }
  }

  for (const aperture of config.aperturas ?? []) {
    const rect = leafRects[aperture.hoja ?? 0]

    if (!rect) {
      continue
    }

    const [leafX, leafY, leafW, leafH] = rect
    /* `aperturas` es relativa a la hoja: al reflejar hay que voltear la fracción `x` (1 − x − w). */
    const glazingX = mirrored
      ? leafX + leafW * (1 - aperture.x - aperture.w)
      : leafX + leafW * aperture.x
    overlay(
      'glazing',
      round2(glazingX),
      round2(leafY + leafH * aperture.y),
      round2(leafW * aperture.w),
      round2(leafH * aperture.h),
      { tone: 'glass' },
    )
  }

  if (config.moulding) {
    for (const [leafX, leafY, leafW, leafH] of leafRects) {
      const inset = Math.max(20, Math.round(0.06 * Math.min(leafW, leafH)))
      overlay(
        'moulding',
        leafX + inset,
        leafY + inset,
        Math.max(0, leafW - 2 * inset),
        Math.max(0, leafH - 2 * inset),
      )
      overlay(
        'moulding',
        leafX + inset + 8,
        leafY + inset + 8,
        Math.max(0, leafW - 2 * inset - 16),
        Math.max(0, leafH - 2 * inset - 16),
      )
    }
  }

  shapes.splice(insertAt, 0, ...overlayShapes)

  if (config.glazing === 'franja-superior') {
    push('glazing', F + 0.08 * abW, F + 0.06 * abH - s, 0.84 * abW, 0.26 * abH + 2 * s, {
      tone: 'glass',
    })
  } else if (config.glazing === 'total' && type !== 'entrada-acorazada') {
    const bastidor = Math.max(80, Math.round(0.1 * abW))
    push(
      'glazing',
      F + bastidor,
      F + bastidor,
      Math.max(0, abW - 2 * bastidor),
      Math.max(0, abH - 2 * bastidor),
      {
        tone: 'glass',
      },
    )
  }

  if (config.ventilation === 'inferior') {
    push('louver', F + 0.15 * abW, F + 0.72 * abH, 0.7 * abW, 0.18 * abH, { tone: 'metal' })
  }

  if (!config.withinSeriesRange) {
    push('outline', -M + 2, -M + 2, W + 2 * M - 4, H + 2 * M - 4, { tone: 'danger' })
  }

  return {
    viewBox: [-M, -M, W + 2 * M, H + 2 * M],
    shapes,
    outOfRange: !config.withinSeriesRange,
    finishPattern: neutral ? null : patternForFinish(finish),
    patternSpecs: [...patternSpecs.values()],
    alcance: isMvp ? 'mvp' : 'referencia',
    notImplemented: !isMvp,
  }
}
