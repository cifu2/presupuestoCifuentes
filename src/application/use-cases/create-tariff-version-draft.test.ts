/**
 * Caso de uso: abrir la siguiente versión de tarifa en borrador (CIF-126a).
 *
 * Cubre el hueco G1 de CIF-243: sin este caso de uso, una serie con su última versión publicada se
 * quedaba con `TARIFF_NOT_EDITABLE` y sin puerta de salida. Los escenarios se escriben contra el
 * adaptador **en memoria** (el mismo puerto que implementa Prisma), así que el contrato que se
 * verifica aquí es el que el panel consume.
 */

import { describe, expect, it } from 'vitest'

import { makeSeries, makeTariffVersion, TEST_NOW } from '@/domain/catalog/testing/factories'
import { ValidityPeriod } from '@/domain/catalog/validity-period'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import { makeBand, makeModifier, makePriceTable } from '@/domain/pricing/testing/factories'
import type { PriceTable } from '@/domain/pricing/price-table'
import {
  ConflictError,
  InvalidTariffVersionError,
  ResourceNotFoundError,
} from '@/domain/shared/errors'
import { Money } from '@/domain/shared/money'

import type {
  TariffPublishTransition,
  TariffVersionRepository,
} from '@/application/ports/tariff-version-repository'
import { makeTestWorld, TEST_SERIES_ID, TEST_TARIFF_ID } from '@/infrastructure/testing/fixtures'

import { createTariffVersionDraft, VERSION_NUMBER_ATTEMPTS } from './create-tariff-version-draft'

const NO_TARIFF_SERIES_ID = 'series-ci-400'
/** `TEST_NOW` cae a media mañana: la vigencia por defecto se normaliza al día UTC. */
const TODAY = '2026-09-11'

function setup() {
  const world = makeTestWorld()

  return {
    world,
    deps: {
      tariffVersionRepository: world.tariffVersionRepository,
      seriesRepository: world.seriesRepository,
      idGenerator: world.idGenerator,
      clock: world.clock,
    },
  }
}

describe('createTariffVersionDraft', () => {
  it('abre la primera versión de una serie sin tarifas, sin inventarse estrategia ni IVA', async () => {
    const { world, deps } = setup()

    const draft = await createTariffVersionDraft(deps, {
      seriesId: NO_TARIFF_SERIES_ID,
      strategy: 'size_bands',
      taxRatePercent: '10',
      currency: 'EUR',
    })

    expect(draft).toMatchObject({
      seriesId: NO_TARIFF_SERIES_ID,
      versionNumber: 1,
      status: 'draft',
      strategy: 'size_bands',
      taxRatePercent: '10.00',
      currency: 'EUR',
      validUntil: null,
      priceTable: null,
    })
    expect(draft.validFrom).toBe(`${TODAY}T00:00:00.000Z`)
    expect(draft.createdAt).toBe(TEST_NOW.toISOString())
    expect(world.catalog.findTariffVersion(draft.id)?.status).toBe('draft')
    expect(world.catalog.findTariffVersion(draft.id)?.publishedAt).toBeNull()
  })

  it('clona la versión vigente con la tabla de precios y un `versionNumber` nuevo', async () => {
    const { world, deps } = setup()

    const draft = await createTariffVersionDraft(deps, {
      seriesId: TEST_SERIES_ID,
      cloneFromVersionId: TEST_TARIFF_ID,
    })

    expect(draft).toMatchObject({
      seriesId: TEST_SERIES_ID,
      versionNumber: 2,
      status: 'draft',
      strategy: 'per_square_metre',
      taxRatePercent: '21.00',
      currency: 'EUR',
    })

    const source = await world.tariffVersionRepository.findPriceTableByVersionId(TEST_TARIFF_ID)
    const cloned = await world.tariffVersionRepository.findPriceTableByVersionId(draft.id)

    expect(source).not.toBeNull()
    expect(cloned).not.toBeNull()
    expect(cloned?.tariffVersionId).toBe(draft.id)
    expect(cloned?.strategy).toBe(source?.strategy)
    expect(cloned?.perSquareMetre?.cents).toBe(source?.perSquareMetre?.cents)
    // La tabla se copia: mismos números, filas nuevas (los ids no se comparten con el origen).
    expect(cloned?.modifiers.map((modifier) => modifier.code)).toEqual(
      source?.modifiers.map((modifier) => modifier.code),
    )
    expect(cloned?.modifiers.map((modifier) => modifier.id)).not.toEqual(
      source?.modifiers.map((modifier) => modifier.id),
    )
    expect(draft.priceTable?.modifiers).toHaveLength(source?.modifiers.length ?? 0)
  })

  it('no toca la versión origen: la publicada sigue publicada y con su tabla', async () => {
    const { world, deps } = setup()
    const before = world.catalog.findTariffVersion(TEST_TARIFF_ID)

    await createTariffVersionDraft(deps, {
      seriesId: TEST_SERIES_ID,
      cloneFromVersionId: TEST_TARIFF_ID,
      notes: 'subida de precios de septiembre',
    })

    const after = world.catalog.findTariffVersion(TEST_TARIFF_ID)

    expect(after?.status).toBe('published')
    expect(after?.versionNumber).toBe(before?.versionNumber)
    expect(after?.validity.validFrom).toEqual(before?.validity.validFrom)
    expect(after?.validity.validUntil).toBeNull()
    expect(after?.publishedAt).toEqual(before?.publishedAt)
  })

  it('encadena la vigencia del clon al fin del origen y hereda sus notas', async () => {
    const world = makeTestWorld({
      extraSeries: [makeSeries({ id: 'series-ci-200', code: 'CI-200', slug: 'ci-200' })],
    })
    const source = makeTariffVersion({
      id: 'tariff-ci-200-v1',
      seriesId: 'series-ci-200',
      validity: ValidityPeriod.of(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-12-31T00:00:00.000Z'),
      ),
      notes: 'tarifa 2026',
    })
    world.catalog.upsertTariffVersion(source)
    world.catalog.upsertPriceTable(
      makePriceTable({
        tariffVersionId: source.id,
        strategy: 'size_bands',
        bands: [makeBand({ id: 'band-ci-200' })],
      }),
    )

    const draft = await createTariffVersionDraft(
      {
        tariffVersionRepository: world.tariffVersionRepository,
        seriesRepository: world.seriesRepository,
        idGenerator: world.idGenerator,
        clock: world.clock,
      },
      { seriesId: source.seriesId, cloneFromVersionId: source.id },
    )

    expect(draft.validFrom).toBe('2026-12-31T00:00:00.000Z')
    expect(draft.validUntil).toBeNull()
    expect(draft.notes).toBe('tarifa 2026')
    expect(draft.strategy).toBe(source.strategy)
    // Sin solape con el origen: la vigencia del sucesor empieza donde termina la del predecesor.
    expect(source.validity.overlaps(ValidityPeriod.of(new Date(draft.validFrom)))).toBe(false)
  })

  it('respeta la vigencia explícita del panel', async () => {
    const { deps } = setup()

    const draft = await createTariffVersionDraft(deps, {
      seriesId: TEST_SERIES_ID,
      cloneFromVersionId: TEST_TARIFF_ID,
      validFrom: '2027-01-01',
      validUntil: '2027-12-31',
    })

    expect(draft.validFrom).toBe('2027-01-01T00:00:00.000Z')
    expect(draft.validUntil).toBe('2027-12-31T00:00:00.000Z')
  })

  it('asigna el siguiente número libre, no el total de versiones', async () => {
    const { world, deps } = setup()
    world.catalog.upsertTariffVersion(
      makeTariffVersion({
        id: 'tariff-ci-100-v7',
        seriesId: TEST_SERIES_ID,
        versionNumber: 7,
        status: 'archived',
        publishedAt: TEST_NOW,
      }),
    )

    const draft = await createTariffVersionDraft(deps, {
      seriesId: TEST_SERIES_ID,
      cloneFromVersionId: TEST_TARIFF_ID,
    })

    expect(draft.versionNumber).toBe(8)
  })

  it('no escribe nada si la serie no existe', async () => {
    const { world, deps } = setup()
    const before = world.catalog.listTariffVersions().length

    await expect(
      createTariffVersionDraft(deps, {
        seriesId: 'series-inexistente',
        cloneFromVersionId: TEST_TARIFF_ID,
      }),
    ).rejects.toThrow(ResourceNotFoundError)

    expect(world.catalog.listTariffVersions()).toHaveLength(before)
  })

  it('no escribe nada si la versión que se quiere clonar no existe', async () => {
    const { world, deps } = setup()
    const before = world.catalog.listTariffVersions().length

    await expect(
      createTariffVersionDraft(deps, {
        seriesId: TEST_SERIES_ID,
        cloneFromVersionId: 'tariff-inexistente',
      }),
    ).rejects.toThrow(ResourceNotFoundError)

    expect(world.catalog.listTariffVersions()).toHaveLength(before)
  })

  it('rechaza clonar en una serie la versión de otra', async () => {
    const { world, deps } = setup()
    const before = world.catalog.listTariffVersions().length

    await expect(
      createTariffVersionDraft(deps, {
        seriesId: NO_TARIFF_SERIES_ID,
        cloneFromVersionId: TEST_TARIFF_ID,
      }),
    ).rejects.toThrow(InvalidTariffVersionError)

    expect(world.catalog.listTariffVersions()).toHaveLength(before)
  })

  it('exige estrategia e IVA cuando no hay versión que clonar', async () => {
    const { world, deps } = setup()
    const before = world.catalog.listTariffVersions().length

    await expect(createTariffVersionDraft(deps, { seriesId: NO_TARIFF_SERIES_ID })).rejects.toThrow(
      InvalidTariffVersionError,
    )

    await expect(
      createTariffVersionDraft(deps, {
        seriesId: NO_TARIFF_SERIES_ID,
        strategy: 'fixed',
      }),
    ).rejects.toThrow(InvalidTariffVersionError)

    expect(world.catalog.listTariffVersions()).toHaveLength(before)
  })

  it('rechaza una fecha de vigencia que no es ISO 8601', async () => {
    const { deps } = setup()

    await expect(
      createTariffVersionDraft(deps, {
        seriesId: TEST_SERIES_ID,
        cloneFromVersionId: TEST_TARIFF_ID,
        validFrom: 'primero de enero',
      }),
    ).rejects.toThrow(InvalidTariffVersionError)
  })

  it('hereda la estrategia del clon aunque el panel mande otra', async () => {
    const { deps } = setup()

    const draft = await createTariffVersionDraft(deps, {
      seriesId: TEST_SERIES_ID,
      cloneFromVersionId: TEST_TARIFF_ID,
      strategy: 'fixed',
    })

    // La estrategia la fija la serie y viaja con la versión (ADR-0003): el clon no la cambia.
    expect(draft.strategy).toBe('per_square_metre')
  })

  it('reintenta con el número siguiente si otra alta se adelantó (carrera)', async () => {
    const world = makeTestWorld()
    const inner = world.tariffVersionRepository

    /** Simula una alta concurrente que gana el número 2 antes de que este caso de uso escriba. */
    class RacingTariffVersionRepository implements TariffVersionRepository {
      attempts = 0

      constructor(private readonly repository: TariffVersionRepository) {}

      findById(id: string): Promise<TariffVersion | null> {
        return this.repository.findById(id)
      }

      listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
        return this.repository.listBySeriesId(seriesId)
      }

      async create(version: TariffVersion): Promise<void> {
        this.attempts += 1

        if (this.attempts === 1) {
          await this.repository.create(
            makeTariffVersion({
              id: 'tariff-ci-100-ganadora',
              seriesId: TEST_SERIES_ID,
              versionNumber: version.versionNumber,
              status: 'draft',
              publishedAt: null,
            }),
          )

          throw new ConflictError(`La versión ${version.versionNumber} ya existe`)
        }

        await this.repository.create(version)
      }

      save(version: TariffVersion): Promise<void> {
        return this.repository.save(version)
      }

      savePublishTransition(transition: TariffPublishTransition): Promise<void> {
        return this.repository.savePublishTransition(transition)
      }

      findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null> {
        return this.repository.findPriceTableByVersionId(tariffVersionId)
      }

      savePriceTable(priceTable: PriceTable): Promise<void> {
        return this.repository.savePriceTable(priceTable)
      }
    }

    const repository = new RacingTariffVersionRepository(inner)

    const draft = await createTariffVersionDraft(
      {
        tariffVersionRepository: repository,
        seriesRepository: world.seriesRepository,
        idGenerator: world.idGenerator,
        clock: world.clock,
      },
      { seriesId: TEST_SERIES_ID, cloneFromVersionId: TEST_TARIFF_ID },
    )

    expect(repository.attempts).toBe(2)
    expect(draft.versionNumber).toBe(3)
    // La tabla clonada se guarda en la versión que sí se creó, no en la que ganó la carrera.
    const cloned = await inner.findPriceTableByVersionId(draft.id)

    expect(cloned?.perSquareMetre?.cents).toBe(Money.fromDecimalString('400').cents)
    expect(await inner.findPriceTableByVersionId('tariff-ci-100-ganadora')).toBeNull()
  })

  it('se rinde con ConflictError si todas las asignaciones chocan', async () => {
    const world = makeTestWorld()

    class AlwaysConflictingTariffVersionRepository implements TariffVersionRepository {
      attempts = 0

      constructor(private readonly repository: TariffVersionRepository) {}

      findById(id: string): Promise<TariffVersion | null> {
        return this.repository.findById(id)
      }

      listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
        return this.repository.listBySeriesId(seriesId)
      }

      async create(): Promise<void> {
        this.attempts += 1
        throw new ConflictError('otra alta se adelantó')
      }

      save(version: TariffVersion): Promise<void> {
        return this.repository.save(version)
      }

      savePublishTransition(transition: TariffPublishTransition): Promise<void> {
        return this.repository.savePublishTransition(transition)
      }

      findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null> {
        return this.repository.findPriceTableByVersionId(tariffVersionId)
      }

      savePriceTable(priceTable: PriceTable): Promise<void> {
        return this.repository.savePriceTable(priceTable)
      }
    }

    const repository = new AlwaysConflictingTariffVersionRepository(world.tariffVersionRepository)

    await expect(
      createTariffVersionDraft(
        {
          tariffVersionRepository: repository,
          seriesRepository: world.seriesRepository,
          idGenerator: world.idGenerator,
          clock: world.clock,
        },
        { seriesId: TEST_SERIES_ID, cloneFromVersionId: TEST_TARIFF_ID },
      ),
    ).rejects.toThrow(ConflictError)

    expect(repository.attempts).toBe(VERSION_NUMBER_ATTEMPTS)
  })

  it('no se traga un fallo del adaptador que no sea de conflicto', async () => {
    const world = makeTestWorld()
    const failure = new Error('la base de datos no responde')

    class BrokenTariffVersionRepository implements TariffVersionRepository {
      constructor(private readonly repository: TariffVersionRepository) {}

      findById(id: string): Promise<TariffVersion | null> {
        return this.repository.findById(id)
      }

      listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
        return this.repository.listBySeriesId(seriesId)
      }

      create(): Promise<void> {
        return Promise.reject(failure)
      }

      save(version: TariffVersion): Promise<void> {
        return this.repository.save(version)
      }

      savePublishTransition(transition: TariffPublishTransition): Promise<void> {
        return this.repository.savePublishTransition(transition)
      }

      findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null> {
        return this.repository.findPriceTableByVersionId(tariffVersionId)
      }

      savePriceTable(priceTable: PriceTable): Promise<void> {
        return this.repository.savePriceTable(priceTable)
      }
    }

    await expect(
      createTariffVersionDraft(
        {
          tariffVersionRepository: new BrokenTariffVersionRepository(world.tariffVersionRepository),
          seriesRepository: world.seriesRepository,
          idGenerator: world.idGenerator,
          clock: world.clock,
        },
        { seriesId: TEST_SERIES_ID, cloneFromVersionId: TEST_TARIFF_ID },
      ),
    ).rejects.toBe(failure)
  })

  it('clona bandas y modificadores con ids nuevos', async () => {
    const world = makeTestWorld({
      extraSeries: [makeSeries({ id: 'series-ci-300', code: 'CI-300', slug: 'ci-300' })],
    })
    const source = makeTariffVersion({
      id: 'tariff-ci-300-v1',
      seriesId: 'series-ci-300',
      strategy: 'size_bands',
      validity: ValidityPeriod.of(new Date('2026-01-01T00:00:00.000Z')),
    })
    world.catalog.upsertTariffVersion(source)
    world.catalog.upsertPriceTable(
      makePriceTable({
        tariffVersionId: source.id,
        strategy: 'size_bands',
        bands: [makeBand({ id: 'band-origen' })],
        modifiers: [makeModifier({ id: 'modifier-origen' })],
      }),
    )

    const draft = await createTariffVersionDraft(
      {
        tariffVersionRepository: world.tariffVersionRepository,
        seriesRepository: world.seriesRepository,
        idGenerator: world.idGenerator,
        clock: world.clock,
      },
      { seriesId: source.seriesId, cloneFromVersionId: source.id },
    )

    expect(draft.priceTable?.bands).toHaveLength(1)
    expect(draft.priceTable?.bands[0]?.id).not.toBe('band-origen')
    expect(draft.priceTable?.bands[0]?.price.amount).toBe('500.00')
    expect(draft.priceTable?.modifiers[0]?.id).not.toBe('modifier-origen')
  })
})
