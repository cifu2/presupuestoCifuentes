import { describe, expect, it } from 'vitest'

import { makeSeries } from '@/domain/catalog/testing/factories'
import { ResourceNotFoundError, SeriesInUseError } from '@/domain/shared/errors'
import {
  makeTestWorld,
  TEST_NO_TARIFF_SLUG,
  TEST_SERIES_ID,
} from '@/infrastructure/testing/fixtures'

import { deactivateSeries } from './deactivate-series'

const ARCHIVED_SERIES_ID = 'series-archivada'

function setup() {
  const world = makeTestWorld({
    extraSeries: [
      makeSeries({
        id: ARCHIVED_SERIES_ID,
        code: 'CI-900',
        slug: 'ci-900',
        status: 'archived',
      }),
    ],
  })

  return {
    world,
    deps: {
      seriesRepository: world.seriesRepository,
      seriesWriteRepository: world.seriesWriteRepository,
      catalogUsageReader: world.catalogUsageReader,
      clock: world.clock,
    },
  }
}

describe('deactivateSeries', () => {
  it('archiva una serie sin tarifa vigente y deja de ofrecerla al configurador', async () => {
    const { world, deps } = setup()
    const series = await world.seriesRepository.findPublishedBySlug(TEST_NO_TARIFF_SLUG)

    const archived = await deactivateSeries(deps, { seriesId: series?.id ?? '' })

    expect(archived.status).toBe('archived')
    expect(world.catalog.series.find((item) => item.slug === TEST_NO_TARIFF_SLUG)?.status).toBe(
      'archived',
    )
    await expect(
      world.seriesRepository.findPublishedBySlug(TEST_NO_TARIFF_SLUG),
    ).resolves.toBeNull()
  })

  it('lanza SeriesInUseError y no escribe si la serie tiene tarifa publicada y vigente', async () => {
    const { world, deps } = setup()

    await expect(deactivateSeries(deps, { seriesId: TEST_SERIES_ID })).rejects.toThrow(
      SeriesInUseError,
    )

    expect(world.catalog.series.find((item) => item.id === TEST_SERIES_ID)?.status).toBe(
      'published',
    )
  })

  it('es idempotente: una serie ya archivada se devuelve sin cambiar nada', async () => {
    const { world, deps } = setup()

    const series = await deactivateSeries(deps, { seriesId: ARCHIVED_SERIES_ID })

    expect(series.status).toBe('archived')
    expect(series.updatedAt).toBe(
      world.catalog.series.find((item) => item.id === ARCHIVED_SERIES_ID)?.updatedAt.toISOString(),
    )
  })

  it('lanza ResourceNotFoundError si la serie no existe', async () => {
    const { deps } = setup()

    await expect(deactivateSeries(deps, { seriesId: 'series-inexistente' })).rejects.toThrow(
      ResourceNotFoundError,
    )
  })
})
