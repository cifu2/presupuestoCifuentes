import { describe, expect, it } from 'vitest'

import { makeSeries } from '@/domain/catalog/testing/factories'

import { makeTestWorld } from '@/infrastructure/testing/fixtures'
import { getPublishedSeries } from './get-published-series'

describe('getPublishedSeries', () => {
  it('devuelve las series publicadas con los textos del idioma pedido', async () => {
    const world = makeTestWorld()

    const series = await getPublishedSeries(
      { seriesRepository: world.seriesRepository },
      { locale: 'en' },
    )

    expect(series.map((item) => item.slug)).toEqual(['ci-100', 'ci-400'])
    expect(series[0]?.name).toBe('CI-100 series')
    expect(series[0]?.sizeRange).toEqual({
      minWidthMm: 600,
      maxWidthMm: 1000,
      minHeightMm: 1800,
      maxHeightMm: 2200,
    })
  })

  it('usa el idioma por defecto cuando falta la traducción', async () => {
    const world = makeTestWorld()

    const series = await getPublishedSeries(
      { seriesRepository: world.seriesRepository },
      { locale: 'en' },
    )

    expect(series[1]?.name).toBe('Serie CI-100')
  })

  it('no publica series en borrador', async () => {
    const draft = makeSeries({
      id: 'series-draft',
      code: 'CI-999',
      slug: 'borrador',
      status: 'draft',
    })
    const world = makeTestWorld({ extraSeries: [draft] })

    const series = await getPublishedSeries(
      { seriesRepository: world.seriesRepository },
      { locale: 'es' },
    )

    expect(series.map((item) => item.slug)).not.toContain('borrador')
  })
})
