import { describe, expect, it } from 'vitest'

import { LocalizedText } from '@/domain/catalog/catalog-text'

import type {
  AdminCatalogReadPort,
  AdminCatalogSnapshot,
  AdminSeriesRecord,
} from '@/application/ports/admin-catalog-reader'
import type { Clock } from '@/application/ports/clock'

import { createAdminCatalogUseCase } from './get-admin-catalog'

const NOW = new Date('2026-09-11T10:00:00.000Z')

class FixedClock implements Clock {
  constructor(private readonly instant: Date = NOW) {}

  now(): Date {
    return this.instant
  }
}

function readerOf(snapshot: AdminCatalogSnapshot): AdminCatalogReadPort {
  return { loadAdminCatalog: async () => snapshot }
}

function seriesRecord(overrides: Partial<AdminSeriesRecord> = {}): AdminSeriesRecord {
  return {
    id: 'series-ci-100',
    code: 'CI-100',
    slug: 'ci-100',
    status: 'published',
    name: LocalizedText.of({ es: 'Serie CI-100', en: 'CI-100 series' }),
    description: LocalizedText.of({ es: 'Puerta interior', en: 'Interior door' }),
    limits: { minWidthMm: 600, maxWidthMm: 1000, minHeightMm: 1800, maxHeightMm: 2200 },
    allowedFinishIds: ['finish-lacado', 'finish-madera'],
    allowedAccessoryIds: ['accessory-manilla'],
    sortOrder: 1,
    ...overrides,
  }
}

function snapshot(overrides: Partial<AdminCatalogSnapshot> = {}): AdminCatalogSnapshot {
  return {
    series: [seriesRecord()],
    finishes: [],
    colors: [],
    accessories: [],
    tariffVersions: [],
    ...overrides,
  }
}

const useCaseOf = (port: AdminCatalogReadPort, locale: 'es' | 'en' = 'es') =>
  createAdminCatalogUseCase({ reader: port, clock: new FixedClock(), locale })

describe('get-admin-catalog: lista de series', () => {
  it('resuelve el nombre en el idioma pedido y cae al idioma por defecto', async () => {
    const port = readerOf(
      snapshot({
        series: [
          seriesRecord({
            name: LocalizedText.of({ es: 'Serie CI-100' }),
            description: null,
          }),
        ],
      }),
    )

    const [spanish] = await useCaseOf(port, 'es').listSeries()
    const [english] = await useCaseOf(port, 'en').listSeries()

    expect(spanish?.name).toBe('Serie CI-100')
    expect(english?.name).toBe('Serie CI-100')
  })

  it('ordena por sortOrder y expone las medidas máximas de la serie', async () => {
    const port = readerOf(
      snapshot({
        series: [
          seriesRecord({ id: 'b', slug: 'b', name: LocalizedText.single('B'), sortOrder: 2 }),
          seriesRecord({ id: 'a', slug: 'a', name: LocalizedText.single('A'), sortOrder: 1 }),
        ],
      }),
    )

    const series = await useCaseOf(port).listSeries()

    expect(series.map((item) => item.slug)).toEqual(['a', 'b'])
    expect(series[0]?.limits).toEqual({
      minWidthMm: 600,
      maxWidthMm: 1000,
      minHeightMm: 1800,
      maxHeightMm: 2200,
    })
    expect(series[0]?.finishCount).toBe(2)
  })

  it('marca como pendiente el idioma sin nombre o sin descripción', async () => {
    const port = readerOf(
      snapshot({
        series: [
          seriesRecord({ id: 'sin-descripcion', description: null, sortOrder: 1 }),
          seriesRecord({
            id: 'sin-ingles',
            name: LocalizedText.of({ es: 'Solo español' }),
            description: LocalizedText.of({ es: 'Descripción' }),
            sortOrder: 2,
          }),
        ],
      }),
    )

    const series = await useCaseOf(port).listSeries()

    expect(series[0]?.missingLocales).toEqual(['es', 'en'])
    expect(series[1]?.missingLocales).toEqual(['en'])
  })

  it('solo da número de tarifa cuando hay una versión publicada y vigente', async () => {
    const port = readerOf(
      snapshot({
        series: [
          seriesRecord({ id: 'vigente', slug: 'vigente', sortOrder: 1 }),
          seriesRecord({ id: 'futura', slug: 'futura', sortOrder: 2 }),
          seriesRecord({ id: 'sin-tarifa', slug: 'sin-tarifa', sortOrder: 3 }),
        ],
        tariffVersions: [
          {
            id: 't-vigente-v2',
            seriesId: 'vigente',
            versionNumber: 2,
            status: 'published',
            strategy: 'per_square_metre',
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            validUntil: null,
            priceCount: 4,
          },
          {
            id: 't-vigente-v3-borrador',
            seriesId: 'vigente',
            versionNumber: 3,
            status: 'draft',
            strategy: 'per_square_metre',
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            validUntil: null,
            priceCount: 0,
          },
          {
            id: 't-futura-v1',
            seriesId: 'futura',
            versionNumber: 1,
            status: 'published',
            strategy: 'fixed',
            validFrom: new Date('2027-01-01T00:00:00.000Z'),
            validUntil: null,
            priceCount: 1,
          },
        ],
      }),
    )

    const series = await useCaseOf(port).listSeries()

    expect(series.map((item) => item.tariffVersionNumber)).toEqual([2, null, null])
  })

  it('deja de considerar vigente una tarifa caducada', async () => {
    const port = readerOf(
      snapshot({
        tariffVersions: [
          {
            id: 't-caducada',
            seriesId: 'series-ci-100',
            versionNumber: 1,
            status: 'published',
            strategy: 'fixed',
            validFrom: new Date('2024-01-01T00:00:00.000Z'),
            validUntil: new Date('2025-01-01T00:00:00.000Z'),
            priceCount: 2,
          },
        ],
      }),
    )

    const [item] = await useCaseOf(port).listSeries()

    expect(item?.tariffVersionNumber).toBeNull()
  })
})

describe('get-admin-catalog: detalle de serie', () => {
  it('devuelve el detalle con nombres por idioma y los idiomas traducidos', async () => {
    const port = readerOf(
      snapshot({
        series: [
          seriesRecord({
            id: 'sin-ingles',
            slug: 'sin-ingles',
            name: LocalizedText.of({ es: 'Serie CI-100' }),
            description: null,
          }),
        ],
      }),
    )

    const detail = await useCaseOf(port, 'en').getSeries('sin-ingles')

    expect(detail).not.toBeNull()
    expect(detail?.names).toEqual({ es: 'Serie CI-100', en: 'Serie CI-100' })
    expect(detail?.translatedLocales).toEqual([])
    expect(detail?.finishCount).toBe(2)
  })

  it('devuelve null si la serie no existe', async () => {
    expect(await useCaseOf(readerOf(snapshot())).getSeries('no-existe')).toBeNull()
  })

  it('también sirve series en borrador o archivadas', async () => {
    const port = readerOf(
      snapshot({ series: [seriesRecord({ status: 'archived', slug: 'archivada' })] }),
    )

    const detail = await useCaseOf(port).getSeries('archivada')

    expect(detail?.status).toBe('archived')
  })
})

describe('get-admin-catalog: versiones de tarifa', () => {
  it('publica la vigencia solo cuando no es borrador y cuenta las filas de precio', async () => {
    const port = readerOf(
      snapshot({
        tariffVersions: [
          {
            id: 'v4-borrador',
            seriesId: 'series-ci-100',
            versionNumber: 4,
            status: 'draft',
            strategy: 'size_bands',
            validFrom: new Date('2026-06-01T00:00:00.000Z'),
            validUntil: null,
            priceCount: 0,
          },
          {
            id: 'v3-archivada',
            seriesId: 'series-ci-100',
            versionNumber: 3,
            status: 'archived',
            strategy: 'per_square_metre',
            validFrom: new Date('2025-01-01T00:00:00.000Z'),
            validUntil: new Date('2026-01-01T00:00:00.000Z'),
            priceCount: 6,
          },
        ],
      }),
    )

    const versions = await useCaseOf(port, 'en').listTariffVersions()

    expect(versions).toEqual([
      {
        id: 'v3-archivada',
        seriesId: 'series-ci-100',
        seriesName: 'CI-100 series',
        versionNumber: 3,
        status: 'archived',
        effectiveFrom: '2025-01-01',
        priceCount: 6,
      },
      {
        id: 'v4-borrador',
        seriesId: 'series-ci-100',
        seriesName: 'CI-100 series',
        versionNumber: 4,
        status: 'draft',
        effectiveFrom: null,
        priceCount: 0,
      },
    ])
  })

  it('agrupa por serie en el orden del catálogo', async () => {
    const port = readerOf(
      snapshot({
        series: [
          seriesRecord({
            id: 'segunda',
            slug: 'segunda',
            name: LocalizedText.single('Segunda'),
            sortOrder: 2,
          }),
          seriesRecord({
            id: 'primera',
            slug: 'primera',
            name: LocalizedText.single('Primera'),
            sortOrder: 1,
          }),
        ],
        tariffVersions: [
          {
            id: 'segunda-v1',
            seriesId: 'segunda',
            versionNumber: 1,
            status: 'published',
            strategy: 'fixed',
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            validUntil: null,
            priceCount: 1,
          },
          {
            id: 'primera-v1',
            seriesId: 'primera',
            versionNumber: 1,
            status: 'published',
            strategy: 'fixed',
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            validUntil: null,
            priceCount: 1,
          },
        ],
      }),
    )

    const versions = await useCaseOf(port).listTariffVersions()

    expect(versions.map((version) => version.id)).toEqual(['primera-v1', 'segunda-v1'])
  })

  it('usa el id de serie como nombre si la serie ya no está en el catálogo', async () => {
    const port = readerOf(
      snapshot({
        series: [],
        tariffVersions: [
          {
            id: 'huerfana',
            seriesId: 'series-borrada',
            versionNumber: 1,
            status: 'published',
            strategy: 'fixed',
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            validUntil: null,
            priceCount: 0,
          },
        ],
      }),
    )

    const [version] = await useCaseOf(port).listTariffVersions()

    expect(version?.seriesName).toBe('series-borrada')
  })
})

describe('get-admin-catalog: idiomas', () => {
  it('cuenta las series a las que les falta cada idioma', async () => {
    const port = readerOf(
      snapshot({
        series: [
          seriesRecord({ id: 'completa', sortOrder: 1 }),
          seriesRecord({
            id: 'sin-ingles',
            name: LocalizedText.of({ es: 'Solo español' }),
            sortOrder: 2,
          }),
          seriesRecord({ id: 'sin-descripcion', description: null, sortOrder: 3 }),
        ],
      }),
    )

    const languages = await useCaseOf(port).listLanguages()

    expect(languages).toEqual([
      { code: 'es', isActive: true, missingSeries: 1 },
      { code: 'en', isActive: true, missingSeries: 2 },
    ])
  })
})

describe('get-admin-catalog: acabados y complementos', () => {
  it('agrupa los colores por acabado en el idioma pedido y por orden', async () => {
    const port = readerOf(
      snapshot({
        finishes: [
          {
            id: 'finish-madera',
            code: 'MADERA',
            status: 'draft',
            name: LocalizedText.of({ es: 'Chapa natural', en: 'Natural wood' }),
            description: null,
            sortOrder: 2,
          },
          {
            id: 'finish-lacado',
            code: 'LACADO',
            status: 'published',
            name: LocalizedText.of({ es: 'Lacado', en: 'Lacquered' }),
            description: LocalizedText.of({ es: 'Liso', en: 'Smooth' }),
            sortOrder: 1,
          },
        ],
        colors: [
          {
            id: 'color-2',
            finishId: 'finish-lacado',
            code: 'RAL-7016',
            status: 'published',
            name: LocalizedText.of({ es: 'Gris antracita', en: 'Anthracite' }),
            hex: '#383E42',
            sortOrder: 2,
          },
          {
            id: 'color-1',
            finishId: 'finish-lacado',
            code: 'RAL-9010',
            status: 'archived',
            name: LocalizedText.of({ es: 'Blanco puro', en: 'Pure white' }),
            hex: null,
            sortOrder: 1,
          },
          {
            id: 'color-3',
            finishId: 'finish-madera',
            code: 'ROBLE',
            status: 'published',
            name: LocalizedText.of({ es: 'Roble', en: 'Oak' }),
            hex: '#B98A54',
            sortOrder: 1,
          },
        ],
      }),
    )

    const finishes = await useCaseOf(port, 'en').listFinishes()

    expect(finishes.map((finish) => finish.id)).toEqual(['finish-lacado', 'finish-madera'])
    expect(finishes[0]?.name).toBe('Lacquered')
    expect(finishes[0]?.description).toBe('Smooth')
    expect(finishes[0]?.colors.map((color) => color.id)).toEqual(['color-1', 'color-2'])
    expect(finishes[1]?.description).toBeNull()
    expect(finishes[1]?.colors.map((color) => color.name)).toEqual(['Oak'])
  })

  it('resuelve los complementos en el idioma pedido con su categoría y estado', async () => {
    const port = readerOf(
      snapshot({
        accessories: [
          {
            id: 'accessory-manilla',
            code: 'MANILLA-A',
            category: 'hardware',
            status: 'published',
            name: LocalizedText.of({ es: 'Manilla de acero', en: 'Steel handle' }),
            description: null,
            sortOrder: 1,
          },
        ],
      }),
    )

    const accessories = await useCaseOf(port, 'en').listAccessories()

    expect(accessories).toEqual([
      {
        id: 'accessory-manilla',
        code: 'MANILLA-A',
        category: 'hardware',
        status: 'published',
        name: 'Steel handle',
        description: null,
      },
    ])
  })
})
