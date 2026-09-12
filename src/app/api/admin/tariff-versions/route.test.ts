/**
 * Test de integración del borde HTTP que abre un borrador de tarifa (CIF-126a).
 *
 * Ejercita el caso de uso completo contra la raíz de composición real en modo demostración (lo fija
 * `vitest.config.mts` con `CATALOG_DEMO_MODE=true`), así que cubre de una vez el contrato de entrada
 * (Zod), la guarda del panel y el adaptador en memoria. Los ids del catálogo de demostración son
 * legibles (`series-ci-100`), como los que devuelve la lectura de administración del panel.
 */

import { describe, expect, it, vi } from 'vitest'

import { createContainer } from '@/composition/container'

const TOKEN = 'token-de-prueba-suficientemente-largo'
const SERIES_ID = 'series-ci-100'
const PUBLISHED_TARIFF_ID = '0192f1b0-0000-7000-8000-000000000101'
const MISSING_SERIES_ID = 'series-inexistente'

vi.mock('@/config/env', () => ({
  env: { ADMIN_API_TOKEN: 'token-de-prueba-suficientemente-largo' },
}))

const { POST } = await import('./route')

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request('http://localhost/api/admin/tariff-versions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  )
}

describe('POST /api/admin/tariff-versions', () => {
  it('responde 401 sin credencial válida', async () => {
    const response = await post({ seriesId: SERIES_ID }, { authorization: 'Bearer no' })

    expect(response.status).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHORIZED')
  })

  it('responde 400 si el cuerpo no cumple el contrato', async () => {
    const withoutSeries = await post({})
    const withBadDate = await post({ seriesId: SERIES_ID, validFrom: '01/01/2027' })

    expect(withoutSeries.status).toBe(400)
    expect((await withoutSeries.json()).error.code).toBe('VALIDATION_ERROR')
    expect(
      (await withBadDate.json()).error.issues.map((issue: { path: string }) => issue.path),
    ).toEqual(['validFrom'])
  })

  it('responde 404 si la serie no existe y no escribe nada', async () => {
    const container = createContainer()
    const before = await container.tariffVersionRepository.listBySeriesId(MISSING_SERIES_ID)

    const response = await post({ seriesId: MISSING_SERIES_ID })

    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
    expect(await container.tariffVersionRepository.listBySeriesId(MISSING_SERIES_ID)).toHaveLength(
      before.length,
    )
  })

  it('responde 400 si no clona y no declara estrategia ni IVA', async () => {
    const response = await post({ seriesId: SERIES_ID })

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('INVALID_TARIFF')
  })

  it('abre el borrador clonando la tabla vigente y responde 201', async () => {
    const container = createContainer()
    const versions = await container.tariffVersionRepository.listBySeriesId(SERIES_ID)
    const highest = versions.reduce((max, version) => Math.max(max, version.versionNumber), 0)
    const source =
      await container.tariffVersionRepository.findPriceTableByVersionId(PUBLISHED_TARIFF_ID)

    const response = await post({
      seriesId: SERIES_ID,
      cloneFromVersionId: PUBLISHED_TARIFF_ID,
      notes: 'subida de precios',
    })
    const { data } = await response.json()

    expect(response.status).toBe(201)
    expect(data).toMatchObject({
      seriesId: SERIES_ID,
      versionNumber: highest + 1,
      status: 'draft',
      strategy: 'per_square_metre',
      currency: 'EUR',
      notes: 'subida de precios',
    })
    expect(data.priceTable.perSquareMetre.amount).toBe(source?.perSquareMetre?.toString())
    expect(data.priceTable.modifiers.map((modifier: { id: string }) => modifier.id)).not.toEqual(
      source?.modifiers.map((modifier) => modifier.id),
    )

    // Persistido y en borrador: el configurador no lo ve hasta que se publique.
    const stored = await container.tariffVersionRepository.findById(data.id)

    expect(stored?.status).toBe('draft')
    expect(stored?.publishedAt).toBeNull()
  })
})
