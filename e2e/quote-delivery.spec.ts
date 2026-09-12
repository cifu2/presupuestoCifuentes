/**
 * E2E de la entrega del presupuesto en PDF y por email (CIF-173, ADR-0004).
 *
 * Se ejecuta contra el catálogo de demostración en memoria: el PDF se renderiza de verdad y el
 * email lo "envía" el adaptador de consola, así que no sale ningún correo real ni se necesita base
 * de datos. La guarda del API del panel obliga a dos servidores (ver `playwright.config.ts`): sin
 * `ADMIN_API_TOKEN` la entrega responde 503 y con él exige credenciales.
 */

import { expect, test, type APIRequestContext } from '@playwright/test'

import { E2E_ADMIN_BASE_URL, E2E_ADMIN_TOKEN, E2E_SALES_MAILBOX } from './support/servers'

const CONFIGURATION = {
  seriesSlug: 'ci-100',
  widthMm: 900,
  heightMm: 2100,
  locale: 'es',
}

async function issueQuote(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/quotes', { data: CONFIGURATION })

  expect(response.status()).toBe(201)

  const body = await response.json()

  return body.quote.reference as string
}

test('el presupuesto emitido se descarga en PDF', async ({ request }) => {
  const reference = await issueQuote(request)
  const response = await request.get(`/api/quotes/${reference}/pdf`)

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect(response.headers()['content-disposition']).toContain(reference)
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-')
})

test('el PDF de una referencia inexistente responde 404', async ({ request }) => {
  const response = await request.get('/api/quotes/PC-2026-999999/pdf')

  expect(response.status()).toBe(404)
  expect((await response.json()).error.code).toBe('NOT_FOUND')
})

test.describe('sin ADMIN_API_TOKEN, la entrega del presupuesto', () => {
  test('falla cerrado con 503 y no genera el PDF ni envía nada', async ({ request }) => {
    const reference = await issueQuote(request)
    const response = await request.post(`/api/quotes/${reference}/delivery`, {
      data: { customer: { name: 'Ana', email: 'ana@example.com' } },
    })

    expect(response.status()).toBe(503)
    expect((await response.json()).error.code).toBe('ADMIN_API_DISABLED')
  })
})

test.describe('con ADMIN_API_TOKEN, la entrega del presupuesto', () => {
  test.use({ baseURL: E2E_ADMIN_BASE_URL })

  function withToken(): { readonly authorization: string } {
    return { authorization: `Bearer ${E2E_ADMIN_TOKEN}` }
  }

  test('rechaza con 401 las credenciales ausentes', async ({ request }) => {
    const reference = await issueQuote(request)
    const response = await request.post(`/api/quotes/${reference}/delivery`, {
      data: { customer: { name: 'Ana', email: 'ana@example.com' } },
    })

    expect(response.status()).toBe(401)
  })

  test('entrega al cliente y al buzón interno, y el reintento no duplica correos', async ({
    request,
  }) => {
    const reference = await issueQuote(request)
    const delivery = await request.post(`/api/quotes/${reference}/delivery`, {
      headers: withToken(),
      data: { customer: { name: 'Ana', email: 'ana@example.com' } },
    })

    const body = await delivery.json()

    expect(delivery.status()).toBe(200)
    expect(body.status).toBe('delivered')
    expect(body.pdfBytes).toBeGreaterThan(1000)
    expect(body.deliveries).toHaveLength(2)
    expect(body.deliveries.map((item: { recipient: string }) => item.recipient)).toEqual([
      'ana@example.com',
      E2E_SALES_MAILBOX,
    ])
    expect(body.deliveries.every((item: { status: string }) => item.status === 'sent')).toBe(true)

    // Reintentar sin fallos pendientes no vuelve a enviar nada (idempotencia, ADR-0004 §6).
    const retry = await request.post(`/api/quotes/${reference}/delivery/retry`, {
      headers: withToken(),
    })

    expect(retry.status()).toBe(200)
    expect((await retry.json()).status).toBe('nothing_to_retry')
  })

  test('la entrega de una referencia inexistente responde 404', async ({ request }) => {
    const response = await request.post('/api/quotes/PC-2026-999999/delivery', {
      headers: withToken(),
      data: { customer: { name: 'Ana', email: 'ana@example.com' } },
    })

    expect(response.status()).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
  })
})
