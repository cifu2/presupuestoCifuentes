/**
 * Test del borde HTTP del panel: publicar una tarifa que se solapa con otra publicada de la misma
 * serie responde 409 y **no** escribe la fila (hallazgo N5 de CIF-78).
 *
 * Los ids son UUID reales porque el `:id` se valida en el borde (hallazgo N2 de CIF-85).
 */

import { describe, expect, it, vi } from 'vitest'

import { makeTariffVersion, TEST_NOW } from '@/domain/catalog/testing/factories'
import { ValidityPeriod } from '@/domain/catalog/validity-period'
import type { TariffVersion } from '@/domain/catalog/tariff-version'

const TOKEN = 'token-de-prueba-suficientemente-largo'

const store = vi.hoisted(() => ({
  versions: [] as unknown[],
  saves: [] as unknown[],
  findByIdCalls: [] as string[],
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
      save: async (version: { id: string }) => {
        store.saves.push(version)
        const versions = store.versions as { id: string }[]
        const index = versions.findIndex((candidate) => candidate.id === version.id)

        if (index === -1) {
          versions.push(version)
        } else {
          versions[index] = version
        }
      },
    },
  }),
}))

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
  store.findByIdCalls.length = 0
  store.versions.push(...versions)
}

const CI_100_V1 = '0192f1b0-0000-7000-8000-000000000101'
const CI_100_V2 = '0192f1b0-0000-7000-8000-000000000102'
const CI_400_V1 = '0192f1b0-0000-7000-8000-000000000401'
const MISSING_ID = '0192f1b0-0000-7000-8000-0000000009ff'

const PUBLISHED = makeTariffVersion({ id: CI_100_V1 })

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

    const response = await publish(CI_400_V1)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.status).toBe('published')
    expect(body.data.publishedAt).toBe(TEST_NOW.toISOString())
    expect(store.saves).toHaveLength(1)
  })

  it('responde 409 AMBIGUOUS_TARIFF y no escribe si se solapa con otra publicada', async () => {
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

    const response = await publish(CI_100_V2)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('AMBIGUOUS_TARIFF')
    expect(store.saves).toEqual([])
    expect(
      (store.versions as TariffVersion[]).find((version) => version.id === CI_100_V2)?.status,
    ).toBe('draft')
  })

  it('responde 404 NOT_FOUND si la versión no existe', async () => {
    seed([])

    const response = await publish(MISSING_ID)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
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
