/**
 * Test del adaptador en memoria del panel: es el que sirve la lectura real en el modo demostración
 * (y, por tanto, en el E2E hermético). No toca PostgreSQL.
 */

import { describe, expect, it } from 'vitest'

import { createDemoCatalogStore } from '@/infrastructure/demo/demo-catalog'

import { InMemoryAdminCatalogReader } from './admin-catalog-reader'

const reader = () => new InMemoryAdminCatalogReader(createDemoCatalogStore())

describe('InMemoryAdminCatalogReader', () => {
  it('devuelve todas las series con sus medidas máximas y complementos permitidos', async () => {
    const { series } = await reader().loadAdminCatalog()

    const ci100 = series.find((item) => item.slug === 'ci-100')

    expect(series).toHaveLength(4)
    expect(ci100?.limits.maxWidthMm).toBe(1000)
    expect(ci100?.limits.maxHeightMm).toBe(2200)
    expect(ci100?.name.resolve('en')).toBe('CI-100 series')
    expect(ci100?.allowedFinishIds).toEqual(['finish-lacado', 'finish-madera'])
    expect(ci100?.allowedAccessoryIds).toHaveLength(3)
  })

  it('cuenta las filas de precio de la tabla y deja en cero los borradores sin tabla', async () => {
    const { tariffVersions } = await reader().loadAdminCatalog()

    const publishedWithTable = tariffVersions.filter((version) => version.priceCount > 0)

    expect(publishedWithTable.length).toBeGreaterThan(0)

    const drafts = tariffVersions.filter((version) => version.status === 'draft')

    expect(drafts.length).toBeGreaterThan(0)
    expect(drafts.every((version) => version.priceCount === 0)).toBe(true)
  })

  it('devuelve acabados con su estado, colores y complementos, incluidos los no publicados', async () => {
    const { finishes, colors, accessories } = await reader().loadAdminCatalog()

    expect(finishes.length).toBeGreaterThanOrEqual(2)
    expect(colors.every((color) => finishes.some((finish) => finish.id === color.finishId))).toBe(
      true,
    )
    expect(accessories.every((accessory) => accessory.name.hasTranslation('es'))).toBe(true)
  })
})
