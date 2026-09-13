import { describe, expect, it } from 'vitest'

import {
  AmbiguousTariffError,
  EmptyPriceTableError,
  InvalidCatalogTransitionError,
  ResourceNotFoundError,
} from '@/domain/shared/errors'
import { makeTariffVersion, TEST_NOW } from '@/domain/catalog/testing/factories'
import { ValidityPeriod } from '@/domain/catalog/validity-period'
import { makePriceTable } from '@/domain/pricing/testing/factories'
import type { PriceTable } from '@/domain/pricing/price-table'
import { selectTariffInForce } from '@/domain/catalog/tariff-version'

import type {
  TariffPublishTransition,
  TariffVersionRepository,
} from '@/application/ports/tariff-version-repository'
import { makeTestWorld, TEST_SERIES_ID, TEST_TARIFF_ID } from '@/infrastructure/testing/fixtures'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import { publishTariffVersion } from './publish-tariff-version'

/**
 * Dobla el puerto para observar escrituras sin cambiar la semántica del adaptador en memoria: lo que
 * se comprueba en los casos que fallan cerrado es que **no llega ninguna**.
 */
class CountingTariffVersionRepository implements TariffVersionRepository {
  saved: TariffVersion[] = []
  transitions: TariffPublishTransition[] = []

  constructor(private readonly inner: TariffVersionRepository) {}

  findById(id: string): Promise<TariffVersion | null> {
    return this.inner.findById(id)
  }

  listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
    return this.inner.listBySeriesId(seriesId)
  }

  create(version: TariffVersion): Promise<void> {
    return this.inner.create(version)
  }

  async save(version: TariffVersion): Promise<void> {
    this.saved.push(version)
    await this.inner.save(version)
  }

  async savePublishTransition(transition: TariffPublishTransition): Promise<void> {
    this.transitions.push(transition)
    await this.inner.savePublishTransition(transition)
  }

  findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null> {
    return this.inner.findPriceTableByVersionId(tariffVersionId)
  }

  savePriceTable(priceTable: PriceTable): Promise<void> {
    return this.inner.savePriceTable(priceTable)
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

/**
 * Sucesora de CI-100: entra en vigor después de la v1 publicada (abierta desde 2026-01-01), así que
 * publicarla cierra la predecesora en su `validFrom`.
 */
const SUCCESSOR_OVER_OPEN = makeTariffVersion({
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

function seedSuccessorOverOpen(world: ReturnType<typeof setup>['world']): void {
  world.catalog.upsertTariffVersion(SUCCESSOR_OVER_OPEN)
  world.catalog.upsertPriceTable(makePriceTable({ tariffVersionId: SUCCESSOR_OVER_OPEN.id }))
}

describe('publishTariffVersion', () => {
  it('publica un borrador sin predecesora abierta y lo persiste', async () => {
    const { world, repository, deps } = setup()
    world.catalog.upsertTariffVersion(INDEPENDENT_DRAFT)
    world.catalog.upsertPriceTable(makePriceTable({ tariffVersionId: INDEPENDENT_DRAFT.id }))

    const published = await publishTariffVersion(deps, { tariffVersionId: INDEPENDENT_DRAFT.id })

    expect(published.status).toBe('published')
    expect(published.publishedAt).toBe(TEST_NOW.toISOString())
    expect(published.closedPredecessor).toBeNull()
    expect(repository.transitions).toHaveLength(1)
    expect(repository.transitions[0]?.successor.id).toBe(INDEPENDENT_DRAFT.id)
    expect(repository.transitions[0]?.predecessor).toBeNull()
    expect(world.catalog.findTariffVersion(INDEPENDENT_DRAFT.id)?.isPublished()).toBe(true)
  })

  it('cierra la predecesora de vigencia abierta en el validFrom de la candidata', async () => {
    const { world, repository, deps } = setup()
    seedSuccessorOverOpen(world)

    const published = await publishTariffVersion(deps, {
      tariffVersionId: SUCCESSOR_OVER_OPEN.id,
    })

    // La predecesora se cierra en la entrada en vigor de la sucesora y conserva su publicación.
    expect(published.closedPredecessor).toEqual({
      id: TEST_TARIFF_ID,
      versionNumber: 1,
      status: 'published',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: published.validFrom,
    })

    const predecessor = world.catalog.findTariffVersion(TEST_TARIFF_ID)
    const successor = world.catalog.findTariffVersion(SUCCESSOR_OVER_OPEN.id)

    expect(predecessor?.status).toBe('published')
    expect(predecessor?.publishedAt?.toISOString()).toBe(TEST_NOW.toISOString())
    expect(predecessor?.validity.validUntil?.toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(successor?.isPublished()).toBe(true)

    // Intervalo semiabierto: ni hueco ni solape (solo una tarifa vigente en el instante del cambio).
    const versions = world.catalog.listTariffVersions().filter((v) => v.seriesId === TEST_SERIES_ID)
    const atHandover = new Date('2026-06-01T00:00:00.000Z')

    expect(predecessor?.isInForceAt(atHandover)).toBe(false)
    expect(successor?.isInForceAt(atHandover)).toBe(true)
    expect(selectTariffInForce(versions, atHandover)?.id).toBe(SUCCESSOR_OVER_OPEN.id)

    // Una sola escritura: la transición lleva las dos filas a la vez.
    expect(repository.transitions).toHaveLength(1)
    expect(repository.transitions[0]?.predecessor?.validity.validUntil?.toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    )
    expect(repository.saved).toEqual([])
  })

  it('republicar una predecesora ya cerrada no la reabre ni la reescribe', async () => {
    const { world, repository, deps } = setup()
    seedSuccessorOverOpen(world)

    await publishTariffVersion(deps, { tariffVersionId: SUCCESSOR_OVER_OPEN.id })

    const closed = world.catalog.findTariffVersion(TEST_TARIFF_ID)

    if (closed === null) {
      throw new Error('La predecesora debería seguir en el catálogo')
    }

    world.catalog.upsertTariffVersion(closed)

    const republished = await publishTariffVersion(deps, { tariffVersionId: TEST_TARIFF_ID })

    expect(republished.closedPredecessor).toBeNull()
    expect(republished.validUntil).toBe('2026-06-01T00:00:00.000Z')
    expect(repository.transitions).toHaveLength(1)
  })

  it('falla con AmbiguousTariffError y NO escribe si el borrador solapa con una publicada cerrada', async () => {
    const { world, repository, deps } = setup()
    const closed = makeTariffVersion({
      id: 'tariff-ci-100-closed',
      seriesId: 'series-ci-400',
      versionNumber: 1,
      validity: ValidityPeriod.of(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2027-01-01T00:00:00.000Z'),
      ),
    })

    world.catalog.upsertTariffVersion(closed)
    world.catalog.upsertTariffVersion(INDEPENDENT_DRAFT)
    world.catalog.upsertPriceTable(makePriceTable({ tariffVersionId: INDEPENDENT_DRAFT.id }))

    await expect(
      publishTariffVersion(deps, { tariffVersionId: INDEPENDENT_DRAFT.id }),
    ).rejects.toThrow(AmbiguousTariffError)

    expect(repository.transitions).toEqual([])
    expect(repository.saved).toEqual([])
    expect(world.catalog.findTariffVersion(INDEPENDENT_DRAFT.id)?.status).toBe('draft')
    expect(world.catalog.findTariffVersion(closed.id)?.isPublished()).toBe(true)
  })

  it('falla con AmbiguousTariffError y NO escribe si la candidata no es posterior a la predecesora abierta', async () => {
    const { world, repository, deps } = setup()
    const backwards = makeTariffVersion({
      id: 'tariff-ci-100-v2-atras',
      versionNumber: 2,
      status: 'draft',
      publishedAt: null,
      // Igual que la predecesora abierta (2026-01-01): cerrar hacia atrás sería inválido.
      validity: ValidityPeriod.of(new Date('2026-01-01T00:00:00.000Z')),
    })

    world.catalog.upsertTariffVersion(backwards)
    world.catalog.upsertPriceTable(makePriceTable({ tariffVersionId: backwards.id }))

    await expect(publishTariffVersion(deps, { tariffVersionId: backwards.id })).rejects.toThrow(
      AmbiguousTariffError,
    )

    expect(repository.transitions).toEqual([])
    expect(repository.saved).toEqual([])
    expect(world.catalog.findTariffVersion(backwards.id)?.status).toBe('draft')
    // La predecesora sigue abierta: el rechazo no la cierra a medias.
    expect(world.catalog.findTariffVersion(TEST_TARIFF_ID)?.validity.isOpenEnded()).toBe(true)
  })

  it('falla con AmbiguousTariffError y NO escribe si hay más de una publicada abierta en la serie', async () => {
    const { world, repository, deps } = setup()
    const seriesId = 'series-ci-500'
    const first = makeTariffVersion({ id: 'tariff-ci-500-v1', seriesId, versionNumber: 1 })
    const second = makeTariffVersion({
      id: 'tariff-ci-500-v2',
      seriesId,
      versionNumber: 2,
      validity: ValidityPeriod.of(new Date('2026-03-01T00:00:00.000Z')),
    })
    const candidate = makeTariffVersion({
      id: 'tariff-ci-500-v3',
      seriesId,
      versionNumber: 3,
      status: 'draft',
      publishedAt: null,
      validity: ValidityPeriod.of(new Date('2026-09-01T00:00:00.000Z')),
    })

    world.catalog.upsertTariffVersion(first)
    world.catalog.upsertTariffVersion(second)
    world.catalog.upsertTariffVersion(candidate)
    world.catalog.upsertPriceTable(makePriceTable({ tariffVersionId: candidate.id }))

    await expect(publishTariffVersion(deps, { tariffVersionId: candidate.id })).rejects.toThrow(
      AmbiguousTariffError,
    )

    expect(repository.transitions).toEqual([])
    expect(repository.saved).toEqual([])
    expect(world.catalog.findTariffVersion(candidate.id)?.status).toBe('draft')
  })

  it('no publica un borrador sin tabla de precios y NO escribe (ADR-0027 §4)', async () => {
    const { world, repository, deps } = setup()
    world.catalog.upsertTariffVersion(INDEPENDENT_DRAFT)

    await expect(
      publishTariffVersion(deps, { tariffVersionId: INDEPENDENT_DRAFT.id }),
    ).rejects.toThrow(EmptyPriceTableError)

    expect(repository.transitions).toEqual([])
    expect(repository.saved).toEqual([])
    expect(world.catalog.findTariffVersion(INDEPENDENT_DRAFT.id)?.status).toBe('draft')
    expect(world.catalog.findTariffVersion(INDEPENDENT_DRAFT.id)?.publishedAt).toBeNull()
  })

  it('no toca la base de datos si la versión no existe', async () => {
    const { repository, deps } = setup()

    await expect(
      publishTariffVersion(deps, { tariffVersionId: 'tariff-inexistente' }),
    ).rejects.toThrow(ResourceNotFoundError)
    expect(repository.transitions).toEqual([])
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
    expect(repository.transitions).toEqual([])
    expect(repository.saved).toEqual([])
  })

  it('es idempotente: republicar una tarifa ya publicada no escribe', async () => {
    const { repository, deps } = setup()

    const published = await publishTariffVersion(deps, { tariffVersionId: TEST_TARIFF_ID })

    expect(published.id).toBe(TEST_TARIFF_ID)
    expect(published.seriesId).toBe(TEST_SERIES_ID)
    expect(published.closedPredecessor).toBeNull()
    expect(repository.transitions).toEqual([])
    expect(repository.saved).toEqual([])
  })
})
