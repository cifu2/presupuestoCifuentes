import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DoorPreview } from './door-preview'
import { buildPreviewGeometry, type PreviewConfig } from './model'

const BASE: PreviewConfig = {
  type: 'abatible-1-hoja',
  widthMm: 825,
  heightMm: 2030,
  hingeSide: 'derecha',
  glazing: 'franja-superior',
  ventilation: 'inferior',
  finishKind: 'lacado',
  colorCode: 'RAL 7016',
  colorHex: '#383E42',
  withinSeriesRange: true,
}

const LABELS = { region: 'Vista previa 2D', colorUndefined: 'Color a definir' }

const render = (overrides: Partial<PreviewConfig> = {}): string =>
  renderToStaticMarkup(
    <DoorPreview
      geometry={buildPreviewGeometry({ ...BASE, ...overrides })}
      labels={LABELS}
      className="h-full"
    />,
  )

/**
 * Congelado del SVG de `main @ 8b63b39` (hallazgo 7/A2 de CIF-240). El traslado de la definición de
 * los patrones al modelo no puede cambiar ni un byte: `DEFS_BASELINE` fija todos los patrones y su
 * orden, y `MARKUP_BASELINE` la cadena completa de dos casos (veta procedural y color indefinido).
 */
const BASELINE_CASES: Record<string, Partial<PreviewConfig>> = {
  baseLacado: {},
  chapaNatural: { finishKind: 'chapa-natural' },
  aluminio: { finishKind: 'aluminio' },
  acero: { finishKind: 'acero' },
  corredera: { type: 'corredera' },
  sinAcabado: { finishKind: 'sin-acabado', colorHex: null, withinSeriesRange: false },
}

const DEFS_BASELINE: Record<string, string> = {
  baseLacado:
    '<defs><linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient></defs>',
  chapaNatural:
    '<defs><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient><pattern id="grain" width="100" height="100" patternUnits="objectBoundingBox"><path d="M5.95 0 C 7.15 30, 5.95 70, 6.55 100" stroke="rgba(0,0,0,.10)" stroke-width="1.35" fill="none" vector-effect="non-scaling-stroke"/><path d="M14.29 0 C 15.49 30, 14.29 70, 14.89 100" stroke="rgba(0,0,0,.10)" stroke-width="0.85" fill="none" vector-effect="non-scaling-stroke"/><path d="M22.62 0 C 23.82 30, 22.62 70, 23.22 100" stroke="rgba(0,0,0,.10)" stroke-width="1.60" fill="none" vector-effect="non-scaling-stroke"/><path d="M30.95 0 C 32.15 30, 30.95 70, 31.55 100" stroke="rgba(0,0,0,.10)" stroke-width="1.10" fill="none" vector-effect="non-scaling-stroke"/><path d="M39.29 0 C 40.49 30, 39.29 70, 39.89 100" stroke="rgba(0,0,0,.10)" stroke-width="0.60" fill="none" vector-effect="non-scaling-stroke"/><path d="M47.62 0 C 48.82 30, 47.62 70, 48.22 100" stroke="rgba(0,0,0,.10)" stroke-width="1.35" fill="none" vector-effect="non-scaling-stroke"/><path d="M55.95 0 C 57.15 30, 55.95 70, 56.55 100" stroke="rgba(0,0,0,.10)" stroke-width="0.85" fill="none" vector-effect="non-scaling-stroke"/><path d="M64.29 0 C 65.49 30, 64.29 70, 64.89 100" stroke="rgba(0,0,0,.10)" stroke-width="1.60" fill="none" vector-effect="non-scaling-stroke"/><path d="M72.62 0 C 73.82 30, 72.62 70, 73.22 100" stroke="rgba(0,0,0,.10)" stroke-width="1.10" fill="none" vector-effect="non-scaling-stroke"/><path d="M80.95 0 C 82.15 30, 80.95 70, 81.55 100" stroke="rgba(0,0,0,.10)" stroke-width="0.60" fill="none" vector-effect="non-scaling-stroke"/><path d="M89.29 0 C 90.49 30, 89.29 70, 89.89 100" stroke="rgba(0,0,0,.10)" stroke-width="1.35" fill="none" vector-effect="non-scaling-stroke"/><path d="M97.62 0 C 98.82 30, 97.62 70, 98.22 100" stroke="rgba(0,0,0,.10)" stroke-width="0.85" fill="none" vector-effect="non-scaling-stroke"/></pattern></defs>',
  aluminio:
    '<defs><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient><pattern id="anodized" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="none"/><rect width="1.2" height="6" fill="rgba(255,255,255,.10)"/><rect x="3" width="0.8" height="6" fill="rgba(0,0,0,.06)"/></pattern></defs>',
  acero:
    '<defs><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient><linearGradient id="metalFinish" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>',
  corredera:
    '<defs><linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient><linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient></defs>',
  sinAcabado:
    '<defs><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient></defs>',
}

const MARKUP_BASELINE: Record<string, string> = {
  baseLacado:
    '<svg role="img" aria-label="Vista previa 2D" class="h-full" viewBox="-30 -30 885 2090" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" data-testid="door-preview" data-out-of-range="false"><defs><linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient></defs><g stroke-linejoin="round"><rect data-shape-kind="frame" x="0" y="0" width="825" height="60" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="frame" x="0" y="1970" width="825" height="60" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="frame" x="0" y="60" width="60" height="1910" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="frame" x="765" y="60" width="60" height="1910" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="leaf" x="60" y="60" width="705" height="1910" fill="#383E42" stroke="rgba(255,255,255,.25)" stroke-width="2" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="finish" x="60" y="60" width="705" height="1910" fill="url(#sheen)"></rect><rect data-shape-kind="hinge" x="757" y="259.2" width="16" height="96" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="hinge" x="757" y="985" width="16" height="96" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="hinge" x="757" y="1710.8" width="16" height="96" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="handle" x="102" y="980" width="12" height="200" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="glazing" x="116.4" y="171.6" width="592.2" height="502.6" fill="url(#glass)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="louver" x="165.75" y="1435.2" width="493.5" height="343.8" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect></g></svg>',
  sinAcabado:
    '<svg role="img" aria-label="Vista previa 2D" class="h-full" viewBox="-30 -30 885 2090" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" data-testid="door-preview" data-out-of-range="true"><defs><linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dbe8f0" stop-opacity="1"/><stop offset="1" stop-color="#b9cddd" stop-opacity="1"/></linearGradient><linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f5" stop-opacity="1"/><stop offset=".45" stop-color="#c6ccd1" stop-opacity="1"/><stop offset="1" stop-color="#9aa2a9" stop-opacity="1"/></linearGradient></defs><g stroke-linejoin="round"><rect data-shape-kind="frame" x="0" y="0" width="825" height="60" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="frame" x="0" y="1970" width="825" height="60" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="frame" x="0" y="60" width="60" height="1910" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="frame" x="765" y="60" width="60" height="1910" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="leaf" x="60" y="60" width="705" height="1910" fill="#D9D9D9" stroke="rgba(23,32,42,.25)" stroke-width="2" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="hinge" x="757" y="259.2" width="16" height="96" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="hinge" x="757" y="985" width="16" height="96" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="hinge" x="757" y="1710.8" width="16" height="96" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="handle" x="102" y="980" width="12" height="200" rx="6" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="glazing" x="116.4" y="171.6" width="592.2" height="502.6" fill="url(#glass)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="louver" x="165.75" y="1435.2" width="493.5" height="343.8" fill="url(#metal)" stroke="rgba(23,32,42,.25)" stroke-width="1.5" vector-effect="non-scaling-stroke"></rect><rect data-shape-kind="outline" x="-28" y="-28" width="881" height="2086" fill="none" stroke="rgba(179,38,30,.9)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="10 8"></rect></g><text x="412.5" y="1015" text-anchor="middle" fill="#5b6773" font-size="26.55">Color a definir</text></svg>',
}

const defsOf = (markup: string): string =>
  markup.slice(markup.indexOf('<defs>'), markup.indexOf('</defs>') + '</defs>'.length)

/** El único cambio permitido es el relleno del texto de color indefinido (hex → token). */
const withoutColorLabel = (markup: string): string =>
  markup.replace(/<text[\s\S]*?<\/text>/, '<text/>')

describe('DoorPreview', () => {
  it('pinta un SVG accesible con el viewBox del modelo', () => {
    const geometry = buildPreviewGeometry(BASE)
    const markup = render()

    expect(markup).toContain('role="img"')
    expect(markup).toContain('aria-label="Vista previa 2D"')
    expect(markup).toContain('data-testid="door-preview"')
    expect(markup).toContain(`viewBox="${geometry.viewBox.join(' ')}"`)
    expect(markup).toContain('class="h-full"')
  })

  it('pinta una forma por cada forma de la geometría resuelta', () => {
    const geometry = buildPreviewGeometry(BASE)
    const markup = render()
    const rects = markup.match(/<rect /g) ?? []
    const circles = markup.match(/<circle /g) ?? []
    const lines = markup.match(/<line /g) ?? []

    const expectedRects = geometry.shapes.filter(
      (shape) => shape.kind !== 'peephole' && shape.kind !== 'pivot' && shape.kind !== 'axis',
    ).length
    const expectedCircles = geometry.shapes.filter(
      (shape) => shape.kind === 'peephole' || shape.kind === 'pivot',
    ).length
    const expectedLines = geometry.shapes.filter((shape) => shape.kind === 'axis').length

    expect(rects).toHaveLength(expectedRects)
    expect(circles).toHaveLength(expectedCircles)
    expect(lines).toHaveLength(expectedLines)
  })

  it('no deduce patrones: solo declara los <defs> que la geometría pide', () => {
    const lacado = render({ finishKind: 'lacado' })
    const madera = render({ finishKind: 'decorado-madera' })

    expect(lacado).toContain('id="sheen"')
    expect(lacado).not.toContain('id="grain"')
    expect(madera).toContain('id="grain"')
    expect(madera).toContain('url(#grain)')
  })

  it('usa trazo de grosor constante al escalar (non-scaling-stroke)', () => {
    expect(render()).toContain('vector-effect="non-scaling-stroke"')
  })

  it('etiqueta la hoja cuando el color no tiene hexadecimal y marca el fuera de rango', () => {
    const markup = render({ colorHex: null, finishKind: 'sin-acabado', withinSeriesRange: false })

    expect(markup).toContain('Color a definir')
    expect(markup).toContain('fill="#D9D9D9"')
    expect(markup).toContain('data-out-of-range="true"')
    expect(markup).toContain('stroke-dasharray="10 8"')
  })

  it('pinta el rodamiento de las pivotantes como círculo de radio r (H12)', () => {
    const geometry = buildPreviewGeometry({ ...BASE, type: 'pivotante-1-hoja' })
    const pivot = geometry.shapes.find((shape) => shape.kind === 'pivot')
    const markup = render({ type: 'pivotante-1-hoja' })

    expect(pivot).toBeDefined()

    if (pivot) {
      expect(markup).toContain(`r="${pivot.w / 2}"`)
    }
  })

  it('emite los <defs> byte a byte como en 8b63b39, con el orden canónico (A2/B2)', () => {
    const failures: string[] = []

    for (const [name, overrides] of Object.entries(BASELINE_CASES)) {
      const defs = defsOf(render(overrides))

      if (defs !== DEFS_BASELINE[name]) {
        failures.push(`${name}:\n  actual   ${defs}\n  esperado ${DEFS_BASELINE[name]}`)
      }
    }

    expect(failures).toEqual([])
  })

  it('no cambia el SVG completo salvo el relleno del texto de color indefinido', () => {
    const failures: string[] = []

    for (const name of ['baseLacado', 'sinAcabado']) {
      const markup = withoutColorLabel(render(BASELINE_CASES[name]))
      const expected = withoutColorLabel(MARKUP_BASELINE[name] ?? '')

      if (markup !== expected) {
        failures.push(`${name}:\n  actual   ${markup}\n  esperado ${expected}`)
      }
    }

    expect(failures).toEqual([])
  })

  it('pinta el texto de color indefinido con el token de la UI, sin hex propio (A2)', () => {
    const text = render({ colorHex: null, finishKind: 'sin-acabado' }).match(/<text[^>]*>/) ?? ['']

    expect(text[0]).toContain('fill:var(--color-ink-muted)')
    expect(text[0]).not.toMatch(/#[0-9a-fA-F]{{3,8}}\b/)
  })
})
