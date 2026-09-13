/**
 * Test de integración del borde de escritura del panel (CIF-243): petición real → route handler →
 * caso de uso → catálogo de demostración en memoria (sin PostgreSQL, como el resto del borde).
 *
 * Cubre el contrato que consume el panel, no la regla de negocio (esa ya está probada en los
 * unitarios de cada caso de uso): forma del cuerpo (`400`), identificador de ruta que no es UUID
 * (`404` sin tocar el catálogo, hallazgo N2 de CIF-85), conflicto de `slug` (`409 CONFLICT`),
 * idempotencia del *upsert* por `code` —y por `(finishId, code)` en colores—, guarda de uso al
 * desactivar (`409 ITEM_IN_USE`) y la invariante de que solo un borrador se edita
 * (`409 TARIFF_NOT_EDITABLE`).
 *
 * Los ids de **ruta** son UUID reales porque la columna es `@db.Uuid`; por eso los casos que editan o
 * desactivan crean antes su propio recurso. Las **referencias** del cuerpo son cadenas, como en la
 * API pública, así que un color puede colgar del acabado sembrado `finish-lacado`.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

const ADMIN_TOKEN = 'token-de-prueba-suficientemente-largo'

// El token de administración solo existe en el entorno del despliegue: el test lo inyecta sobre el
// entorno real (que en vitest ya trae `CATALOG_DEMO_MODE`) para no sustituir la configuración entera.
vi.mock('@/config/env', async (importOriginal) => {
  const original = await importOriginal<{ env: Record<string, unknown> }>()

  return { env: { ...original.env, ADMIN_API_TOKEN: ADMIN_TOKEN } }
})

type SeriesContext = { params: Promise<{ id: string }> }
type ItemContext = { params: Promise<{ entity: string; id: string }> }

let postSeries: (request: Request) => Promise<Response>
let patchSeries: (request: Request, context: SeriesContext) => Promise<Response>
let deactivateSeries: (request: Request, context: SeriesContext) => Promise<Response>
let postFinish: (request: Request) => Promise<Response>
let postColor: (request: Request) => Promise<Response>
let postAccessory: (request: Request) => Promise<Response>
let deactivateCatalogItem: (request: Request, context: ItemContext) => Promise<Response>
let patchPrices: (request: Request, context: SeriesContext) => Promise<Response>

beforeAll(async () => {
  ;({ POST: postSeries } = await import('./series/route'))
  ;({ PATCH: patchSeries } = await import('./series/[id]/route'))
  ;({ POST: deactivateSeries } = await import('./series/[id]/deactivate/route'))
  ;({ POST: postFinish } = await import('./finishes/route'))
  ;({ POST: postColor } = await import('./colors/route'))
  ;({ POST: postAccessory } = await import('./accessories/route'))
  ;({ POST: deactivateCatalogItem } = await import('./items/[entity]/[id]/deactivate/route'))
  ;({ PATCH: patchPrices } = await import('../tariff-versions/[id]/prices/route'))
})

function request(options: { body?: unknown; token?: string | null } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = options.token === undefined ? ADMIN_TOKEN : options.token

  if (token !== null) {
    headers.authorization = `Bearer ${token}`
  }

  return new Request('http://localhost/api/admin/catalog', {
    method: 'POST',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
}

function idContext(id: string): SeriesContext {
  return { params: Promise.resolve({ id }) }
}

function itemContext(entity: string, id: string): ItemContext {
  return { params: Promise.resolve({ entity, id }) }
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

const LIMITS = { minWidthMm: 600, maxWidthMm: 1200, minHeightMm: 1800, maxHeightMm: 2400 }

/** Serie nueva: el `code` es la clave del *upsert*, así que cada caso usa uno distinto. */
function seriesPayload(code: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code,
    slug: code.toLowerCase(),
    name: { es: `Serie ${code}`, en: `Series ${code}` },
    limits: LIMITS,
    ...extra,
  }
}

describe('guarda de administración', () => {
  it('responde 401 sin credencial válida y no escribe', async () => {
    const response = await postSeries(request({ body: seriesPayload('AUTH-401'), token: 'otro' }))

    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  })
})

describe('POST /api/admin/catalog/series', () => {
  it('rechaza un cuerpo con forma inválida sin tocar el catálogo', async () => {
    const response = await postSeries(
      request({ body: { code: 'SIN-TEXTO', slug: 'sin-texto', limits: LIMITS } }),
    )

    expect(response.status).toBe(400)
    expect(await body(response)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('rechaza un idioma sin el texto por defecto', async () => {
    const response = await postSeries(
      request({ body: seriesPayload('SIN-ES', { name: { en: 'Only english' } }) }),
    )

    expect(response.status).toBe(400)
    expect(await body(response)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('da de alta la serie y es idempotente por code', async () => {
    const first = await postSeries(request({ body: seriesPayload('ALTA-1') }))

    expect(first.status).toBe(200)
    const created = (await body(first)).data as { id: string; code: string; status: string }
    expect(created.code).toBe('ALTA-1')
    expect(created.status).toBe('draft')

    const second = await postSeries(request({ body: seriesPayload('ALTA-1') }))
    const repeated = (await body(second)).data as { id: string }

    expect(repeated.id).toBe(created.id)
  })

  it('responde 409 cuando el slug ya lo usa otra serie', async () => {
    await postSeries(request({ body: seriesPayload('SLUG-A') }))
    const response = await postSeries(
      request({ body: seriesPayload('SLUG-B', { slug: 'slug-a' }) }),
    )

    expect(response.status).toBe(409)
    expect(await body(response)).toMatchObject({ error: { code: 'CONFLICT' } })
  })
})

describe('PATCH /api/admin/catalog/series/:id', () => {
  it('responde 404 sin consultar el catálogo si el id no es un UUID', async () => {
    const response = await patchSeries(
      request({ body: { sortOrder: 3 } }),
      idContext('series-ci-100'),
    )

    expect(response.status).toBe(404)
    expect(await body(response)).toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('edita solo lo que llega y conserva el resto', async () => {
    const created = (await body(await postSeries(request({ body: seriesPayload('EDICION-1') }))))
      .data as { id: string; name: Record<string, string> }

    const response = await patchSeries(
      request({
        body: { name: { es: 'Serie editada' }, limits: { ...LIMITS, maxWidthMm: 1400 } },
      }),
      idContext(created.id),
    )

    expect(response.status).toBe(200)
    const updated = (await body(response)).data as {
      name: Record<string, string>
      limits: { maxWidthMm: number }
      slug: string
    }

    expect(updated.name.es).toBe('Serie editada')
    // El idioma que no llega en el parche conserva su traducción: el parche es parcial, no un set.
    expect(updated.name.en).toBe('Series EDICION-1')
    expect(updated.limits.maxWidthMm).toBe(1400)
    expect(updated.slug).toBe('edicion-1')
  })

  it('responde 404 con un UUID que no existe', async () => {
    const response = await patchSeries(
      request({ body: { sortOrder: 1 } }),
      idContext('00000000-0000-4000-8000-000000000000'),
    )

    expect(response.status).toBe(404)
  })
})

describe('POST /api/admin/catalog/series/:id/deactivate', () => {
  it('archiva la serie en vez de borrarla', async () => {
    const created = (await body(await postSeries(request({ body: seriesPayload('BAJA-1') }))))
      .data as { id: string }

    const response = await deactivateSeries(request({}), idContext(created.id))

    expect(response.status).toBe(200)
    expect((await body(response)).data).toMatchObject({ id: created.id, status: 'archived' })
  })
})

describe('POST /api/admin/catalog/colors', () => {
  it('da de alta el color por (finishId, code) y es idempotente', async () => {
    const payload = {
      finishId: 'finish-lacado',
      code: 'ROBLE-OSCURO',
      name: { es: 'Roble oscuro', en: 'Dark oak' },
      hex: '#4B2E1E',
    }

    const first = await postColor(request({ body: payload }))

    expect(first.status).toBe(200)
    const created = (await body(first)).data as { id: string; hex: string }
    expect(created.hex).toBe('#4B2E1E')

    const second = await postColor(
      request({ body: { ...payload, name: { es: 'Roble muy oscuro', en: 'Very dark oak' } } }),
    )
    const repeated = (await body(second)).data as { id: string }

    expect(repeated.id).toBe(created.id)
  })

  it('responde 400 si el hex no es #RRGGBB', async () => {
    const response = await postColor(
      request({
        body: { finishId: 'finish-lacado', code: 'HEX-MALO', name: { es: 'Rojo' }, hex: 'rojo' },
      }),
    )

    expect(response.status).toBe(400)
    expect(await body(response)).toMatchObject({ error: { code: 'INVALID_CATALOG_VALUE' } })
  })

  it('responde 404 si el acabado no existe', async () => {
    const response = await postColor(
      request({ body: { finishId: 'finish-inexistente', code: 'X', name: { es: 'X' } } }),
    )

    expect(response.status).toBe(404)
  })
})

describe('POST /api/admin/catalog/items/:entity/:id/deactivate', () => {
  it('responde 404 si el tipo de elemento no existe', async () => {
    const response = await deactivateCatalogItem(
      request({}),
      itemContext('manufactura', '00000000-0000-4000-8000-000000000000'),
    )

    expect(response.status).toBe(404)
  })

  it('responde 409 si una serie viva sigue permitiendo el complemento', async () => {
    const accessory = (
      await body(
        await postAccessory(request({ body: { code: 'CIERRE-X', name: { es: 'Cierre X' } } })),
      )
    ).data as { id: string }

    await postSeries(
      request({
        body: seriesPayload('CON-ACCESORIO', {
          status: 'published',
          allowedAccessoryIds: [accessory.id],
        }),
      }),
    )

    const response = await deactivateCatalogItem(
      request({}),
      itemContext('accessory', accessory.id),
    )

    expect(response.status).toBe(409)
    expect(await body(response)).toMatchObject({ error: { code: 'ITEM_IN_USE' } })
  })

  it('archiva un acabado recién creado que nadie usa', async () => {
    const finish = (
      await body(await postFinish(request({ body: { code: 'SIN-USO', name: { es: 'Sin uso' } } })))
    ).data as { id: string }

    const response = await deactivateCatalogItem(request({}), itemContext('finish', finish.id))

    expect(response.status).toBe(200)
    expect((await body(response)).data).toMatchObject({
      entity: 'finish',
      item: { id: finish.id, status: 'archived' },
    })
  })
})

describe('PATCH /api/admin/tariff-versions/:id/prices', () => {
  /** Borrador publicable de CI-400 (`per_square_metre`), con tabla, sembrado por la demo. */
  const DRAFT = '0192f1b0-0000-7000-8000-000000000401'
  /** v1 publicada de CI-100: su precio está congelado. */
  const PUBLISHED = '0192f1b0-0000-7000-8000-000000000101'

  it('edita el precio de un borrador', async () => {
    const response = await patchPrices(
      request({ body: { perSquareMetre: '455.00' } }),
      idContext(DRAFT),
    )

    expect(response.status).toBe(200)
    expect((await body(response)).data).toMatchObject({ perSquareMetre: { amount: '455.00' } })
  })

  it('rechaza un importe que no es decimal', async () => {
    const response = await patchPrices(
      request({ body: { perSquareMetre: '455,00' } }),
      idContext(DRAFT),
    )

    expect(response.status).toBe(400)
    expect(await body(response)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('no deja editar el precio de una versión publicada', async () => {
    const response = await patchPrices(
      request({ body: { perSquareMetre: '1.00' } }),
      idContext(PUBLISHED),
    )

    expect(response.status).toBe(409)
    expect(await body(response)).toMatchObject({ error: { code: 'TARIFF_NOT_EDITABLE' } })
  })

  it('responde 404 con un id que no es UUID', async () => {
    const response = await patchPrices(request({ body: {} }), idContext('tariff-ci-100-v1'))

    expect(response.status).toBe(404)
  })
})
