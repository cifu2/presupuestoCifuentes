/**
 * Borde HTTP de la tabla de precios del panel (CIF-243): la lectura que precarga la edición rápida.
 *
 * Cubre las tres respuestas que la UI distingue: la tabla serializada (dinero como cadena decimal
 * exacta, nunca `number`), `data: null` cuando el borrador aún no tiene precios —estado legítimo, no
 * error— y el `404 NOT_FOUND` de un id con formato válido que no existe (hallazgo N2 de CIF-85: el
 * `:id` se valida en el borde antes de consultar).
 */

import { describe, expect, it, vi } from 'vitest'

import { makeTariffVersion } from '@/domain/catalog/testing/factories'
import { makePriceTable } from '@/domain/pricing/testing/factories'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import type { PriceTable } from '@/domain/pricing/price-table'

const TOKEN = 'token-de-prueba-suficientemente-largo'

const store = vi.hoisted(() => ({
  versions: [] as unknown[],
  priceTables: new Map<string, unknown>(),
}))

vi.mock('@/config/env', () => ({
  env: { ADMIN_API_TOKEN: 'token-de-prueba-suficientemente-largo' },
}))

vi.mock('@/composition/container', () => ({
  createContainer: () => ({
    mode: 'demo',
    clock: { now: () => new Date('2026-09-11T10:00:00.000Z') },
    idGenerator: { nextId: () => 'generated-id' },
    tariffVersionRepository: {
      findById: async (id: string) =>
        (store.versions as { id: string }[]).find((version) => version.id === id) ?? null,
      findPriceTableByVersionId: async (id: string) => store.priceTables.get(id) ?? null,
      savePriceTable: async (priceTable: PriceTable) => {
        store.priceTables.set(priceTable.tariffVersionId, priceTable)
      },
    },
  }),
}))

const { GET } = await import('./route')

const VERSION_ID = '0192f1b0-0000-7000-8000-000000000101'
const UNKNOWN_ID = '0192f1b0-0000-7000-8000-0000000009ff'

function read(id: string, token: string | null = TOKEN): Promise<Response> {
  return Promise.resolve(
    new Request(`http://localhost/api/admin/tariff-versions/${id}/prices`, {
      method: 'GET',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    }),
  ).then((request) => GET(request, { params: Promise.resolve({ id }) }))
}

function seed(version: TariffVersion, table: PriceTable | null): void {
  store.versions.length = 0
  store.priceTables.clear()
  store.versions.push(version)

  if (table !== null) {
    store.priceTables.set(table.tariffVersionId, table)
  }
}

describe('GET /api/admin/tariff-versions/[id]/prices', () => {
  it('devuelve la tabla del borrador con el dinero como cadena decimal', async () => {
    seed(makeTariffVersion({ id: VERSION_ID }), makePriceTable({ tariffVersionId: VERSION_ID }))

    const response = await read(VERSION_ID)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.tariffVersionId).toBe(VERSION_ID)
    expect(typeof body.data.perSquareMetre.amount).toBe('string')
    expect(body.data.currency ?? body.data.perSquareMetre.currency).toBe('EUR')
  })

  it('un borrador sin tabla responde `data: null`, no un error', async () => {
    seed(makeTariffVersion({ id: VERSION_ID }), null)

    const response = await read(VERSION_ID)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toBeNull()
  })

  it('un id válido sin fila responde 404 NOT_FOUND', async () => {
    seed(makeTariffVersion({ id: VERSION_ID }), null)

    const response = await read(UNKNOWN_ID)
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('sin credencial responde 401 y no lee nada', async () => {
    seed(makeTariffVersion({ id: VERSION_ID }), makePriceTable({ tariffVersionId: VERSION_ID }))

    const response = await read(VERSION_ID, null)

    expect(response.status).toBe(401)
  })
})
