/**
 * Vista previa 2D (CIF-6): componente de presentación que solo pinta la geometría resuelta.
 *
 * No decide colores, texturas ni geometría — todo viene de `buildPreviewGeometry`. Los textos
 * visibles llegan ya traducidos por props (ADR-0005: la UI resuelve i18n, el modelo no).
 */

import type { PreviewGeometry, PreviewPatternSpec, PreviewShape } from './model'

export interface DoorPreviewLabels {
  /** Etiqueta accesible del SVG (`role="img"`). */
  readonly region: string
  /** Se pinta sobre la hoja cuando el color no tiene hexadecimal de catálogo. */
  readonly colorUndefined: string
}

export interface DoorPreviewProps {
  readonly geometry: PreviewGeometry
  readonly labels: DoorPreviewLabels
  readonly className?: string
}

/** Serializa un patrón tal y como lo resolvió el modelo: aquí no se deduce ningún color. */
function patternMarkup(spec: PreviewPatternSpec): string {
  const { paint } = spec

  if (paint.variant === 'linearGradient') {
    const stops = paint.stops
      .map(
        ({ offset, color, opacity }) =>
          `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`,
      )
      .join('')

    return `<linearGradient id="${spec.id}" x1="${paint.x1}" y1="${paint.y1}" x2="${paint.x2}" y2="${paint.y2}">${stops}</linearGradient>`
  }

  if (paint.variant === 'veins') {
    const veins = paint.veins
      .map(
        ({ d, width }) =>
          `<path d="${d}" stroke="${paint.stroke}" stroke-width="${width}" fill="none" vector-effect="non-scaling-stroke"/>`,
      )
      .join('')

    return `<pattern id="${spec.id}" width="${paint.width}" height="${paint.height}" patternUnits="${paint.patternUnits}">${veins}</pattern>`
  }

  const tiles = paint.tiles
    .map(
      ({ x, y, w, h, fill }) =>
        `<rect${x === undefined ? '' : ` x="${x}"`}${y === undefined ? '' : ` y="${y}"`} width="${w}" height="${h}" fill="${fill}"/>`,
    )
    .join('')

  return `<pattern id="${spec.id}" width="${paint.width}" height="${paint.height}" patternUnits="${paint.patternUnits}">${tiles}</pattern>`
}

/** `<defs>`: solo los patrones que la geometría declara, en su orden canónico y con su pintura. */
function PreviewDefs({ geometry }: { readonly geometry: PreviewGeometry }): React.JSX.Element {
  const defs = geometry.patternSpecs.map(patternMarkup).join('')

  return <defs dangerouslySetInnerHTML={{ __html: defs }} />
}

/** Cada forma se pinta tal y como la resolvió el modelo (relleno, trazo, opacidad y patrón). */
function shapeElement(shape: PreviewShape): React.JSX.Element {
  const common = {
    fill: shape.paint.fill,
    ...(shape.paint.stroke === null
      ? {}
      : {
          stroke: shape.paint.stroke,
          strokeWidth: shape.paint.strokeWidth,
          vectorEffect: 'non-scaling-stroke' as const,
        }),
    ...(shape.paint.dash === null ? {} : { strokeDasharray: shape.paint.dash }),
    ...(shape.paint.opacity === 1 ? {} : { opacity: shape.paint.opacity }),
  }

  if (shape.kind === 'peephole' || shape.kind === 'pivot') {
    return (
      <circle
        key={`${shape.kind}-${shape.x}-${shape.y}`}
        data-shape-kind={shape.kind}
        cx={shape.x + shape.w / 2}
        cy={shape.y + shape.h / 2}
        r={shape.w / 2}
        {...common}
      />
    )
  }

  if (shape.kind === 'axis') {
    const axisX = shape.x + shape.w / 2

    return (
      <line
        key={`${shape.kind}-${shape.x}-${shape.y}`}
        data-shape-kind={shape.kind}
        x1={axisX}
        y1={shape.y}
        x2={axisX}
        y2={shape.y + shape.h}
        {...common}
      />
    )
  }

  return (
    <rect
      key={`${shape.kind}-${shape.x}-${shape.y}`}
      data-shape-kind={shape.kind}
      x={shape.x}
      y={shape.y}
      width={Math.max(0, shape.w)}
      height={Math.max(0, shape.h)}
      {...(shape.rx === undefined ? {} : { rx: shape.rx })}
      {...common}
    />
  )
}

export function DoorPreview({ geometry, labels, className }: DoorPreviewProps): React.JSX.Element {
  const [minX, minY, width, height] = geometry.viewBox
  const colorUndefined = geometry.shapes.find((shape) => shape.paint.label === 'colorUndefined')

  return (
    <svg
      role="img"
      aria-label={labels.region}
      className={className}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="geometricPrecision"
      data-testid="door-preview"
      data-out-of-range={String(geometry.outOfRange)}
    >
      <PreviewDefs geometry={geometry} />
      <g strokeLinejoin="round">{geometry.shapes.map(shapeElement)}</g>
      {colorUndefined ? (
        <text
          x={colorUndefined.x + colorUndefined.w / 2}
          y={colorUndefined.y + colorUndefined.h / 2}
          textAnchor="middle"
          style={{ fill: 'var(--color-ink-muted)' }}
          fontSize={Math.max(14, width * 0.03)}
        >
          {labels.colorUndefined}
        </text>
      ) : null}
    </svg>
  )
}
