/**
 * Test del borde HTTP del panel: las dos invariantes de publicación responden 409 y **no** escriben la
 * fila (hallazgo N5 de CIF-78) — el solape con otra publicada de la misma serie (`AMBIGUOUS_TARIFF`) y
 * la versión sin tabla de precios (`EMPTY_PRICE_TABLE`, ADR-0027 §5). El orden también importa: el
 * solape se comprueba antes que la tabla vacía, y el caso de solape de este fichero no siembra tabla a
 * propósito.
 *
 * El camino feliz sobre una predecesora de vigencia abierta (ADR-0003 rev. 2 §8) comprueba que el
 * borde devuelve el cierre y que las dos filas viajan en la **misma** transición de escritura.
 *
 * Los ids son UUID reales porque el `:id` se valida en el borde (hallazgo N2 de CIF-85).
 */

import { describe, expect, it, vi } from 'vitest'

import { makeTariffVersion, TEST_NOW } from '@/domain/catalog/testing/factories'
import { ValidityPeriod } from '@/domain/catalog/validity-period'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import { makePriceTable } from '@/domain/pricing/testing/factories'
import type { PriceTable } from '@/domain/pricing/price-table'

const TOKEN = 'token-de-prueba-suficientemente-largo'

const store = vi.hoisted(() => ({
  versions: [] as unknown[],
  saves: [] as unknown[],
  transitions: [] as unknown[],
  findByIdCalls: [] as string[],
  /** Tablas de precios por versión: el doble del puerto devuelve una si el test la sembró. */
  priceTables: new Map<string, unknown>(),
}))

vi.mock('@/config/env', () => ({
  env: { ADMIN_API_TOKEN: 'token-de-prueba-suficientemente-largo' },
}))

vi.mock('@/composition/container', () => ({
  createContainer: () => ({
    mode: 'demo',
    clock: { now: () => new Date('2026-09-11T10:00:00.000Z') },
    tariffVersionRepository: {
      findById: async (id: string) => {
        store.findByIdCalls.push(id)

        return (store.versions as { id: string }[]).find((version) => version.id === id) ?? null
      },
      listBySeriesId: async (seriesId: string) =>
        (store.versions as { seriesId: string }[]).filter(
          (version) => version.seriesId === seriesId,
        ),
      findPriceTableByVersionId: async (id: string) => store.priceTables.get(id) ?? null,
      savePriceTable: async (priceTable: PriceTable) => {
        store.priceTables.set(priceTable.tariffVersionId, priceTable)
      },
      save: async (version: { id: string }) => {
        store.saves.push(version)
        write(version)
      },
      savePublishTransition: async (transition: {
        successor: { id: string }
        predecessor: { id: string } | null
      }) => {
        store.transitions.push(transition)
        store.saves.push(transition.successor)

        if (transition.predecessor !== null) {
          store.saves.push(transition.predecessor)
          write(transition.predecessor)
        }

        write(transition.successor)
      },
    },
  }),
}))

function write(version: unknown): void {
  const id = (version as { id: string }).id
  const versions = store.versions as { id: string }[]
  const index = versions.findIndex((candidate) => candidate.id === id)

  if (index === -1) {
    versions.push(version as { id: string })
  } else {
    versions[index] = version as { id: string }
  }
}

const { POST } = await import('./route')

function publish(id: string, token: string | null = TOKEN): Promise<Response> {
  return Promise.resolve(
    new Request(`http://localhost/api/admin/tariff-versions/${id}/publish`, {
      method: 'POST',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    }),
  ).then((request) => POST(request, { params: Promise.resolve({ id }) }))
}

function seed(versions: readonly TariffVersion[]): void {
  store.versions.length = 0
  store.saves.length = 0
  store.transitions.length = 0
  store.findByIdCalls.length = 0
  store.priceTables.clear()
  store.versions.push(...versions)
}

/** Todo borrador que vaya a publicarse necesita su tabla de precios (ADR-0027 §4). */
function seedPriceTable(tariffVersionId: string): void {
  store.priceTables.set(tariffVersionId, makePriceTable({ tariffVersionId }))
}

const CI_100_V1 = '0192f1b0-0000-7000-8000-000000000101'
const CI_100_V2 = '0192f1b0-0000-7000-8000-000000000102'
const CI_400_V1 = '0192f1b0-0000-7000-8000-000000000401'
const MISSING_ID = '0192f1b0-0000-7000-8000-0000000009ff'

const PUBLISHED = makeTariffVersion({ id: CI_100_V1 })
/** Publicada con vigencia cerrada: en el mismo instante que la candidata, así que solapan. */
const PUBLISHED_CLOSED = makeTariffVersion({
  id: CI_100_V1,
  validity: ValidityPeriod.of(
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2027-01-01T00:00:00.000Z'),
  ),
})

describe('POST /api/admin/tariff-versions/[id]/publish', () => {
  it('publica el borrador sin solape', async () => {
    seed([
      makeTariffVersion({
        id: CI_400_V1,
        seriesId: 'series-ci-400',
        status: 'draft',
        publishedAt: null,
      }),
    ])
    seedPriceTable(CI_400_V1)

    const response = await publish(CI_400_V1)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('published')
    expect(body.data.publishedAt).toBe(TEST_NOW.toISOString())
    expect(store.saves).toHaveLength(1)
  })

  it('publica sobre la predecesora abierta y la cierra en la misma escritura (ADR-0003 rev. 2 §8)', async () => {
    seed([
      PUBLISHED,
      makeTariffVersion({
        id: CI_100_V2,
        versionNumber: 2,
        status: 'draft',
        publishedAt: null,
        validity: ValidityPeriod.of(new Date('2026-06-01T00:00:00.000Z')),
      }),
    ])
    seedPriceTable(CI_100_V2)

    const response = await publish(CI_100_V2)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.closedPredecessor).toEqual({
      id: CI_100_V1,
      versionNumber: 1,
      status: 'published',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: body.data.validFrom,
    })
    expect(store.transitions).toHaveLength(1)
    // Las dos filas quedan escritas: la sucesora publicada y la predecesora cerrada, sin archivar.
    expect(store.saves.map((version) => (version as TariffVersion).id)).toEqual([
      CI_100_V2,
      CI_100_V1,
    ])
    const predecessor = (store.versions as TariffVersion[]).find(
      (version) => version.id === CI_100_V1,
    )

    expect(predecessor?.status).toBe('published')
    expect(predecessor?.validity.validUntil?.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('responde 409 AMBIGUOUS_TARIFF y no escribe si se solapa con otra publicada cerrada', async () => {
    seed([
      PUBLISHED_CLOSED,
      makeTariffVersion({
        id: CI_100_V2,
        versionNumber: 2,
        status: 'draft',
        publishedAt: null,
        validity: ValidityPeriod.of(new Date('2026-06-01T00:00:00.000Z')),
      }),
    ])

    const response = await publish(CI_100_V2)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('AMBIGUOUS_TARIFF')
    expect(store.saves).toEqual([])
    expect(store.transitions).toEqual([])
    expect(
      (store.versions as TariffVersion[]).find((version) => version.id === CI_100_V2)?.status,
    ).toBe('draft')
  })

  it('responde 409 EMPTY_PRICE_TABLE y no escribe si el borrador no tiene tabla de precios', async () => {
    seed([
      makeTariffVersion({
        id: CI_400_V1,
        seriesId: 'series-ci-400',
        status: 'draft',
        publishedAt: null,
      }),
    ])

    const response = await publish(CI_400_V1)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('EMPTY_PRICE_TABLE')
    expect(store.saves).toEqual([])
    expect(
      (store.versions as TariffVersion[]).find((version) => version.id === CI_400_V1)?.status,
    ).toBe('draft')
  })

  it('responde 404 NOT_FOUND si la versión no existe', async () => {
    seed([])

    const response = await publish(MISSING_ID)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(store.findByIdCalls).toEqual([MISSING_ID])
    expect(store.saves).toEqual([])
  })

  it('responde 404 NOT_FOUND sin consultar la base de datos si el id no es un UUID', async () => {
    seed([PUBLISHED])

    const response = await publish('tariff-inexistente')
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(store.findByIdCalls).toEqual([])
    expect(store.saves).toEqual([])
  })

  it('responde 401 sin credenciales de administración', async () => {
    seed([PUBLISHED])

    const response = await publish(CI_100_V1, null)

    expect(response.status).toBe(401)
    expect(store.saves).toEqual([])
  })
})
