import { describe, expect, it } from 'vitest'

import { createFixtureAdminCatalogReader } from './admin-catalog.fixtures'

describe('lector de fixtures del panel (fase 1)', () => {
  it('traduce los nombres de demostración al idioma pedido', async () => {
    const spanish = await createFixtureAdminCatalogReader('es').listSeries()
    const english = await createFixtureAdminCatalogReader('en').listSeries()

    expect(spanish.map((series) => series.name)).toEqual([
      'Serie A',
      'Serie B',
      'Serie C',
      'Serie D',
    ])
    expect(english.map((series) => series.name)).toEqual([
      'Series A',
      'Series B',
      'Serie C',
      'Series D',
    ])
  })

  it('sirve los cuatro estados del catálogo, con sus medidas y su tarifa', async () => {
    const series = await createFixtureAdminCatalogReader('es').listSeries()

    expect(series.map((item) => item.status)).toEqual([
      'published',
      'published',
      'draft',
      'archived',
    ])
    expect(series[0]?.limits).toEqual({
      minWidthMm: 400,
      maxWidthMm: 2400,
      minHeightMm: 500,
      maxHeightMm: 2100,
    })
    expect(series[2]?.tariffVersionNumber).toBeNull()
  })

  it('marca en qué idiomas falta la traducción de cada serie', async () => {
    const reader = createFixtureAdminCatalogReader('es')

    expect((await reader.listSeries()).map((item) => item.missingLocales)).toEqual([
      [],
      ['en'],
      ['en'],
      [],
    ])
    expect((await reader.getSeries('serie-a'))?.translatedLocales).toEqual(['es', 'en'])
    expect((await reader.getSeries('serie-b'))?.translatedLocales).toEqual(['es'])
  })

  it('devuelve el detalle por identificador web y null si no existe', async () => {
    const reader = createFixtureAdminCatalogReader('es')

    expect((await reader.getSeries('serie-c'))?.names).toEqual({ es: 'Serie C', en: 'Serie C' })
    expect(await reader.getSeries('no-existe')).toBeNull()
  })

  it('liga cada versión de tarifa a su serie y traduce el nombre de la serie', async () => {
    const versions = await createFixtureAdminCatalogReader('en').listTariffVersions()

    expect(versions.map((version) => version.seriesName)).toEqual([
      'Series A',
      'Series A',
      'Series B',
      'Series D',
    ])
    expect(versions.every((version) => version.seriesId.startsWith('demo-serie-'))).toBe(true)
    expect(versions.filter((version) => version.status === 'draft')).toEqual([
      expect.objectContaining({ versionNumber: 4, effectiveFrom: null, priceCount: 0 }),
    ])
  })

  it('resume los idiomas del catálogo con las series que les faltan', async () => {
    expect(await createFixtureAdminCatalogReader('es').listLanguages()).toEqual([
      { code: 'es', isActive: true, missingSeries: 0 },
      { code: 'en', isActive: true, missingSeries: 2 },
    ])
  })

  it('solo devuelve datos de demostración, nunca catálogo real', async () => {
    const series = await createFixtureAdminCatalogReader('es').listSeries()
    const tariffs = await createFixtureAdminCatalogReader('es').listTariffVersions()

    expect([...series, ...tariffs].every((item) => item.id.startsWith('demo-'))).toBe(true)
  })
})
