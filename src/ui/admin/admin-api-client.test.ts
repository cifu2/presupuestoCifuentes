/**
 * Contrato del cliente del API del panel (CIF-243).
 *
 * Se prueba sin navegador y sin red: `sendAdminApi` recibe el `fetch` inyectado, así que aquí se
 * comprueba lo que de verdad puede romperse —la forma de la petición (método, credencial de sesión,
 * cuerpo solo cuando toca), la lectura del sobre `{ data }` y la traducción de los fallos— sin
 * depender del catálogo de demostración.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  adminApiErrorMessageKey,
  publishTariffVersionRequest,
  readTariffPriceTableRequest,
  sendAdminApi,
  updateTariffPriceRequest,
} from './admin-api-client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('admin-api-client · forma de la petición', () => {
  it('la lectura de la tabla de precios es un GET sin cuerpo y con la cookie de sesión', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: null }))

    await sendAdminApi(fetchImpl as unknown as typeof fetch, readTariffPriceTableRequest('v-1'))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/tariff-versions/v-1/prices')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('same-origin')
    expect(init.body).toBeUndefined()
  })

  it('la escritura va en JSON con el cuerpo serializado y el id escapado', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { ok: true } }))

    await sendAdminApi(
      fetchImpl as unknown as typeof fetch,
      updateTariffPriceRequest('v 1/2', { perSquareMetre: '450.00' }),
    )

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/tariff-versions/v%201%2F2/prices')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(JSON.stringify({ perSquareMetre: '450.00' }))
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('publicar manda un cuerpo vacío, que el borde acepta', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { id: 'v-1' } }))

    await sendAdminApi(fetchImpl as unknown as typeof fetch, publishTariffVersionRequest('v-1'))

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
  })
})

describe('admin-api-client · lectura del sobre del API', () => {
  it('devuelve los datos del camino feliz', async () => {
    const fetchImpl = async () => jsonResponse({ data: { tariffVersionId: 'v-1' } })

    await expect(
      sendAdminApi<{ tariffVersionId: string }>(
        fetchImpl as unknown as typeof fetch,
        readTariffPriceTableRequest('v-1'),
      ),
    ).resolves.toEqual({ ok: true, data: { tariffVersionId: 'v-1' } })
  })

  it('un 409 con código de dominio viaja como fallo con su código', async () => {
    const fetchImpl = async () =>
      jsonResponse({ error: { code: 'EMPTY_PRICE_TABLE', message: 'sin precios' } }, 409)

    const result = await sendAdminApi(
      fetchImpl as unknown as typeof fetch,
      publishTariffVersionRequest('v-1'),
    )

    expect(result).toEqual({
      ok: false,
      code: 'EMPTY_PRICE_TABLE',
      message: 'sin precios',
    })
  })

  it('un 400 de validación conserva los `issues` para poder señalarlos', async () => {
    const fetchImpl = async () =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La petición no es válida',
            issues: [{ path: 'perSquareMetre', message: 'El importe debe ser un decimal' }],
          },
        },
        400,
      )

    const result = await sendAdminApi(
      fetchImpl as unknown as typeof fetch,
      updateTariffPriceRequest('v-1', { perSquareMetre: 'nope' }),
    )

    expect(result.ok).toBe(false)
    expect(result.ok ? [] : result.issues).toEqual([
      { path: 'perSquareMetre', message: 'El importe debe ser un decimal' },
    ])
  })

  it('un 2xx sin `data` es un fallo de contrato, no un «guardado»', async () => {
    const fetchImpl = async () => jsonResponse({ nope: true })

    const result = await sendAdminApi(
      fetchImpl as unknown as typeof fetch,
      publishTariffVersionRequest('v-1'),
    )

    expect(result).toEqual({ ok: false, code: 'HTTP_200', message: '' })
  })
})

describe('admin-api-client · mensajes', () => {
  it('traduce los códigos del dominio que tienen mensaje', () => {
    expect(adminApiErrorMessageKey('EMPTY_PRICE_TABLE')).toBe('DomainErrors.EMPTY_PRICE_TABLE')
    expect(adminApiErrorMessageKey('TARIFF_NOT_EDITABLE')).toBe('DomainErrors.TARIFF_NOT_EDITABLE')
  })

  it('un código sin traducir cae en el mensaje genérico del panel', () => {
    expect(adminApiErrorMessageKey('VALIDATION_ERROR')).toBe('CatalogAdmin.error.saveFailed')
    expect(adminApiErrorMessageKey('HTTP_503')).toBe('CatalogAdmin.error.saveFailed')
  })
})
