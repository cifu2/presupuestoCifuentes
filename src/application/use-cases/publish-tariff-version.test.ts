import { describe, expect, it } from 'vitest'

import {
  AmbiguousTariffError,
  InvalidCatalogTransitionError,
  ResourceNotFoundError,
} from '@/domain/shared/errors'
import { makeTariffVersion, TEST_NOW } from '@/domain/catalog/testing/factories'
import { ValidityPeriod } from '@/domain/catalog/validity-period'

import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'
import { makeTestWorld, TEST_SERIES_ID, TEST_TARIFF_ID } from '@/infrastructure/testing/fixtures'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import { publishTariffVersion } from './publish-tariff-version'

/** Dobla el puerto para contar escrituras sin cambiar la semántica del adaptador en memoria. */
class CountingTariffVersionRepository implements TariffVersionRepository {
  saved: TariffVersion[] = []

  constructor(private readonly inner: TariffVersionRepository) {}

  findById(id: string): Promise<TariffVersion | null> {
    return this.inner.findById(id)
  }

  listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
    return this.inner.listBySeriesId(seriesId)
  }

  async save(version: TariffVersion): Promise<void> {
    this.saved.push(version)
    await this.inner.save(version)
  }
}

function setup() {
  const world = makeTestWorld()
  const repository = new CountingTariffVersionRepository(world.tariffVersionRepository)

  return {
    world,
    repository,
    deps: { tariffVersionRepository: repository, clock: world.clock },
  }
}

const OVERLAPPING_DRAFT = makeTariffVersion({
  id: 'tariff-ci-100-v2',
  versionNumber: 2,
  status: 'draft',
  publishedAt: null,
  validity: ValidityPeriod.of(new Date('2026-06-01T00:00:00.000Z')),
})

const INDEPENDENT_DRAFT = makeTariffVersion({
  id: 'tariff-ci-400-v1',
  seriesId: 'series-ci-400',
  status: 'draft',
  publishedAt: null,
})

describe('publishTariffVersion', () => {
  it('publica un borrador sin solape y lo persiste', async () => {
    const { world, repository, deps } = setup()
    world.catalog.upsertTariffVersion(INDEPENDENT_DRAFT)

    const published = await publishTariffVersion(deps, { tariffVersionId: INDEPENDENT_DRAFT.id })

    expect(published.status).toBe('published')
    expect(published.publishedAt).toBe(TEST_NOW.toISOString())
    expect(repository.saved.map((version) => version.id)).toEqual([INDEPENDENT_DRAFT.id])
    expect(world.catalog.findTariffVersion(INDEPENDENT_DRAFT.id)?.isPublished()).toBe(true)
  })

  it('falla con AmbiguousTariffError y NO escribe si el borrador se solapa con otra publicada', async () => {
    const { world, repository, deps } = setup()
    world.catalog.upsertTariffVersion(OVERLAPPING_DRAFT)

    await expect(
      publishTariffVersion(deps, { tariffVersionId: OVERLAPPING_DRAFT.id }),
    ).rejects.toThrow(AmbiguousTariffError)

    expect(repository.saved).toEqual([])
    expect(world.catalog.findTariffVersion(OVERLAPPING_DRAFT.id)?.status).toBe('draft')
    expect(world.catalog.findTariffVersion(TEST_TARIFF_ID)?.status).toBe('published')
  })

  it('no toca la base de datos si la versión no existe', async () => {
    const { repository, deps } = setup()

    await expect(
      publishTariffVersion(deps, { tariffVersionId: 'tariff-inexistente' }),
    ).rejects.toThrow(ResourceNotFoundError)
    expect(repository.saved).toEqual([])
  })

  it('rechaza publicar una versión archivada (transición no permitida)', async () => {
    const { world, repository, deps } = setup()
    world.catalog.upsertTariffVersion(
      makeTariffVersion({
        id: 'tariff-ci-400-archivada',
        seriesId: 'series-ci-400',
        status: 'archived',
        publishedAt: TEST_NOW,
      }),
    )

    await expect(
      publishTariffVersion(deps, { tariffVersionId: 'tariff-ci-400-archivada' }),
    ).rejects.toThrow(InvalidCatalogTransitionError)
    expect(repository.saved).toEqual([])
  })

  it('es idempotente: republicar una tarifa ya publicada no escribe', async () => {
    const { repository, deps } = setup()

    const published = await publishTariffVersion(deps, { tariffVersionId: TEST_TARIFF_ID })

    expect(published.id).toBe(TEST_TARIFF_ID)
    expect(published.seriesId).toBe(TEST_SERIES_ID)
    expect(repository.saved).toEqual([])
  })
})
