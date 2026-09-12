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
})
