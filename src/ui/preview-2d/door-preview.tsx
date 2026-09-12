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

const INK_MUTED = '#5b6773'

function patternSpec(
  geometry: PreviewGeometry,
  kind: PreviewPatternSpec['kind'],
): PreviewPatternSpec | undefined {
  return geometry.patternSpecs.find((spec) => spec.kind === kind)
}

function grainPaths(spec: PreviewPatternSpec): string {
  const paths: string[] = []

  for (let index = 0; index < spec.veins; index += 1) {
    const x = ((index + (spec.seed % 7) / 7) * 100) / spec.veins
    const width = 0.6 + ((spec.seed + index * 13) % 5) / 4

    paths.push(
      `<path d="M${x.toFixed(2)} 0 C ${(x + 1.2).toFixed(2)} 30, ${x.toFixed(2)} 70, ${(x + 0.6).toFixed(2)} 100" stroke="rgba(0,0,0,.10)" stroke-width="${width.toFixed(2)}" fill="none" vector-effect="non-scaling-stroke"/>`,
    )
  }

  return paths.join('')
}

/** `<defs>`: solo los patrones que la geometría declara, nada se deduce aquí. */
function PreviewDefs({ geometry }: { readonly geometry: PreviewGeometry }): React.JSX.Element {
  const linearGradient = (
    id: string,
    stops: readonly (readonly [string, string, string])[],
  ): string =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops
      .map(
        ([offset, color, opacity]) =>
          `<stop offset="${offset}" stop-color="${color}" stop-opacity="${opacity}"/>`,
      )
      .join('')}</linearGradient>`

  const grain = patternSpec(geometry, 'grain')

  const defs = [
    patternSpec(geometry, 'sheen')
      ? '<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>'
      : '',
    patternSpec(geometry, 'glass')
      ? linearGradient('glass', [
          ['0', '#dbe8f0', '1'],
          ['1', '#b9cddd', '1'],
        ])
      : '',
    patternSpec(geometry, 'metal')
      ? linearGradient('metal', [
          ['0', '#f2f4f5', '1'],
          ['.45', '#c6ccd1', '1'],
          ['1', '#9aa2a9', '1'],
        ])
      : '',
    patternSpec(geometry, 'wall')
      ? linearGradient('wall', [
          ['0', '#000', '.10'],
          ['1', '#000', '.05'],
        ])
      : '',
    patternSpec(geometry, 'metalFinish')
      ? '<linearGradient id="metalFinish" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>'
      : '',
    patternSpec(geometry, 'anodized')
      ? '<pattern id="anodized" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="none"/><rect width="1.2" height="6" fill="rgba(255,255,255,.10)"/><rect x="3" width="0.8" height="6" fill="rgba(0,0,0,.06)"/></pattern>'
      : '',
    grain
      ? `<pattern id="grain" width="100" height="100" patternUnits="objectBoundingBox">${grainPaths(grain)}</pattern>`
      : '',
  ].join('')

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
          fill={INK_MUTED}
          fontSize={Math.max(14, width * 0.03)}
        >
          {labels.colorUndefined}
        </text>
      ) : null}
    </svg>
  )
}
