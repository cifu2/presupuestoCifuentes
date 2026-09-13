/**
 * Test de integración del borde HTTP que abre un borrador de tarifa (CIF-126a).
 *
 * Ejercita el caso de uso completo contra la raíz de composición real en modo demostración (lo fija
 * `vitest.config.mts` con `CATALOG_DEMO_MODE=true`), así que cubre de una vez el contrato de entrada
 * (Zod), la guarda del panel y el adaptador en memoria. Los ids del catálogo de demostración son
 * legibles (`series-ci-100`), como los que devuelve la lectura de administración del panel.
 *
 * El `409` `CONFLICT` (CIF-526) se fuerza desde el doble del contenedor: con el adaptador real haría
 * falta una carrera de verdad —el caso de uso reintenta con el número recalculado— y lo que hay que
 * fijar aquí es el mapeo del borde, no la carrera (esa vive en el caso de uso).
 */

import { describe, expect, it, vi } from 'vitest'

import { createContainer } from '@/composition/container'
import { VERSION_NUMBER_ATTEMPTS } from '@/application/use-cases/create-tariff-version-draft'
import type {
  TariffPublishTransition,
  TariffVersionRepository,
} from '@/application/ports/tariff-version-repository'
import type { TariffVersion } from '@/domain/catalog/tariff-version'
import type { PriceTable } from '@/domain/pricing/price-table'
import { ConflictError } from '@/domain/shared/errors'

const TOKEN = 'token-de-prueba-suficientemente-largo'
const SERIES_ID = 'series-ci-100'
const PUBLISHED_TARIFF_ID = '0192f1b0-0000-7000-8000-000000000101'
const MISSING_SERIES_ID = 'series-inexistente'

const forcedConflict = vi.hoisted(() => ({ enabled: false, attempts: 0 }))

/**
 * Adaptador que se queda sin números de versión: `create` choca siempre, así que los
 * `VERSION_NUMBER_ATTEMPTS` reintentos del caso de uso se agotan y el borde recibe el `ConflictError`.
 */
class ConflictingTariffVersionRepository implements TariffVersionRepository {
  constructor(private readonly inner: TariffVersionRepository) {}

  findById(id: string): Promise<TariffVersion | null> {
    return this.inner.findById(id)
  }

  listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]> {
    return this.inner.listBySeriesId(seriesId)
  }

  async create(version: TariffVersion): Promise<void> {
    forcedConflict.attempts += 1

    throw new ConflictError(
      `La serie "${version.seriesId}" ya tiene una versión con el número ${version.versionNumber}`,
    )
  }

  save(version: TariffVersion): Promise<void> {
    return this.inner.save(version)
  }

  savePublishTransition(transition: TariffPublishTransition): Promise<void> {
    return this.inner.savePublishTransition(transition)
  }

  findPriceTableByVersionId(tariffVersionId: string): Promise<PriceTable | null> {
    return this.inner.findPriceTableByVersionId(tariffVersionId)
  }

  savePriceTable(priceTable: PriceTable): Promise<void> {
    return this.inner.savePriceTable(priceTable)
  }
}

vi.mock('@/config/env', () => ({
  env: { ADMIN_API_TOKEN: 'token-de-prueba-suficientemente-largo' },
}))

vi.mock('@/composition/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composition/container')>()

  return {
    ...actual,
    createContainer: () => {
      const container = actual.createContainer()

      return forcedConflict.enabled
        ? {
            ...container,
            tariffVersionRepository: new ConflictingTariffVersionRepository(
              container.tariffVersionRepository,
            ),
          }
        : container
    },
  }
})

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

  it('responde 400 INVALID_VALIDITY_PERIOD si validUntil no es posterior a validFrom', async () => {
    const response = await post({
      seriesId: SERIES_ID,
      cloneFromVersionId: PUBLISHED_TARIFF_ID,
      validFrom: '2027-01-01',
      validUntil: '2027-01-01',
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('INVALID_VALIDITY_PERIOD')
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

  it('responde 409 CONFLICT si el número de versión no queda libre, sin dejar rastro', async () => {
    const container = createContainer()
    const before = await container.tariffVersionRepository.listBySeriesId(SERIES_ID)

    forcedConflict.enabled = true

    try {
      const response = await post({
        seriesId: SERIES_ID,
        cloneFromVersionId: PUBLISHED_TARIFF_ID,
      })

      expect(response.status).toBe(409)
      expect((await response.json()).error.code).toBe('CONFLICT')
      // Reintenta con el número recalculado antes de rendirse; el borde devuelve el último choque.
      expect(forcedConflict.attempts).toBe(VERSION_NUMBER_ATTEMPTS)
    } finally {
      forcedConflict.enabled = false
    }

    expect(await container.tariffVersionRepository.listBySeriesId(SERIES_ID)).toHaveLength(
      before.length,
    )
  })
})
