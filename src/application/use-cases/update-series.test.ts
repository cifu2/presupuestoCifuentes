import { describe, expect, it } from 'vitest'

import { TEST_NOW, makeSeries } from '@/domain/catalog/testing/factories'
import { ConflictError, ResourceNotFoundError } from '@/domain/shared/errors'
import { makeTestWorld, TEST_SERIES_ID, TEST_SERIES_SLUG } from '@/infrastructure/testing/fixtures'

import { updateSeries, type UpdateSeriesInput } from './update-series'

function setup() {
  const world = makeTestWorld()

  return {
    world,
    deps: {
      seriesRepository: world.seriesRepository,
      seriesWriteRepository: world.seriesWriteRepository,
      clock: world.clock,
    },
  }
}

function input(overrides: Partial<UpdateSeriesInput> = {}): UpdateSeriesInput {
  return { seriesId: TEST_SERIES_ID, ...overrides }
}

describe('updateSeries', () => {
  it('edita los límites de medida y el slug', async () => {
    const { world, deps } = setup()

    const series = await updateSeries(
      deps,
      input({
        limits: { minWidthMm: 500, maxWidthMm: 1200, minHeightMm: 1600, maxHeightMm: 2500 },
        slug: 'ci-100-nueva',
      }),
    )

    expect(series.limits.maxWidthMm).toBe(1200)
    expect(series.slug).toBe('ci-100-nueva')
    expect(series.updatedAt).toBe(TEST_NOW.toISOString())
    expect(world.catalog.series.find((item) => item.id === TEST_SERIES_ID)?.slug).toBe(
      'ci-100-nueva',
    )
  })

  it('fusiona los textos idioma a idioma sin perder los que ya estaban', async () => {
    const { deps } = setup()

    const series = await updateSeries(deps, input({ name: { en: 'CI-100 series (rev)' } }))

    expect(series.name).toEqual({ es: 'Serie CI-100', en: 'CI-100 series (rev)' })
  })

  it('borra una traducción cuando llega null explícito', async () => {
    const { deps } = setup()

    const series = await updateSeries(deps, input({ name: { en: null } }))

    expect(series.name).toEqual({ es: 'Serie CI-100' })
  })

  it('no cambia el código de la serie', async () => {
    const { deps } = setup()

    const series = await updateSeries(deps, input({ name: { es: 'Otro nombre' } }))

    expect(series.code).toBe('CI-100')
  })

  it('lanza ResourceNotFoundError si la serie no existe', async () => {
    const { deps } = setup()

    await expect(updateSeries(deps, input({ seriesId: 'series-inexistente' }))).rejects.toThrow(
      ResourceNotFoundError,
    )
  })

  it('lanza ConflictError si el slug nuevo lo usa otra serie', async () => {
    const { world, deps } = setup()
    world.catalog.upsertSeries(makeSeries({ id: 'series-otra', code: 'CI-500', slug: 'ci-500' }))

    await expect(updateSeries(deps, input({ slug: 'ci-500' }))).rejects.toThrow(ConflictError)
  })

  it('permite el mismo slug que ya tenía la serie', async () => {
    const { deps } = setup()

    const series = await updateSeries(deps, input({ slug: TEST_SERIES_SLUG }))

    expect(series.slug).toBe(TEST_SERIES_SLUG)
  })

  it('reemplaza los vínculos de compatibilidad y deja la descripción como está si no se pide', async () => {
    const { world, deps } = setup()

    const series = await updateSeries(
      deps,
      input({ allowedFinishIds: [], allowedAccessoryIds: [] }),
    )

    expect(series.allowedFinishIds).toEqual([])
    expect(series.allowedAccessoryIds).toEqual([])
    expect(series.description).toBeNull()
    expect(
      world.catalog.series.find((item) => item.id === TEST_SERIES_ID)?.allowedFinishIds,
    ).toEqual([])
  })

  it('cambia el estado validando la transición del dominio', async () => {
    const { deps } = setup()

    const series = await updateSeries(deps, input({ status: 'archived' }))

    expect(series.status).toBe('archived')
  })

  it('rechaza una transición de estado no permitida por el dominio', async () => {
    const { deps } = setup()

    await updateSeries(deps, input({ status: 'archived' }))

    await expect(updateSeries(deps, input({ status: 'published' }))).rejects.toThrow(
      /no puede pasar de/,
    )
  })

  it('crea la descripción desde cero cuando la serie no tenía', async () => {
    const { deps } = setup()

    const series = await updateSeries(deps, input({ description: { es: 'Nueva descripción' } }))

    expect(series.description).toEqual({ es: 'Nueva descripción' })
  })
})
