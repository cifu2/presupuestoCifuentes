/**
 * Test del punto de intercambio del panel (ADR-0023 §3 y §6): comprueba que el shell ya no lee
 * fixtures, sino el caso de uso de administración sobre el contenedor. Con `CATALOG_DEMO_MODE`
 * (el entorno de vitest y del E2E) el contenedor es el catálogo en memoria; en producción es Prisma,
 * y el mismo caso de uso se prueba contra él en `prisma/admin-catalog-reader.test.ts`.
 */

import { describe, expect, it } from 'vitest'

import { createAdminCatalogReader } from './admin-catalog-reader.factory'

describe('createAdminCatalogReader', () => {
  it('lee el catálogo real en memoria, no los fixtures de la fase 1', async () => {
    const series = await createAdminCatalogReader('es').listSeries()

    expect(series.map((item) => item.slug)).toEqual(['ci-100', 'ci-200', 'ci-300', 'ci-400'])
    expect(series[0]?.name).toBe('Serie CI-100')
    expect(series[0]?.limits.maxWidthMm).toBe(1000)
    expect(series[0]?.tariffVersionNumber).toBe(1)
    expect(series[3]?.tariffVersionNumber).toBeNull()
  })

  it('resuelve el detalle por slug con los idiomas traducidos', async () => {
    const detail = await createAdminCatalogReader('en').getSeries('ci-100')

    expect(detail?.names).toEqual({ es: 'Serie CI-100', en: 'CI-100 series' })
    expect(detail?.translatedLocales).toEqual(['es', 'en'])
  })

  it('lista las versiones de tarifa con su vigencia y los idiomas con lo que falta', async () => {
    const reader = createAdminCatalogReader('es')

    const [versions, languages] = await Promise.all([
      reader.listTariffVersions(),
      reader.listLanguages(),
    ])

    const published = versions.find((version) => version.id.endsWith('0101'))

    expect(published?.seriesName).toBe('Serie CI-100')
    expect(published?.effectiveFrom).toBe('2026-01-01')

    const drafts = versions.filter((version) => version.status === 'draft')

    expect(drafts.length).toBeGreaterThan(0)
    expect(drafts.every((version) => version.effectiveFrom === null)).toBe(true)
    expect(languages).toEqual([
      { code: 'es', isActive: true, missingSeries: 1 },
      { code: 'en', isActive: true, missingSeries: 1 },
    ])
  })
})
