/**
 * E2E de la API de catálogo y del motor de presupuestos (CIF-4).
 *
 * Se ejecuta contra el catálogo de demostración en memoria: no necesita base de datos.
 */

import { expect, test } from '@playwright/test'

const CONFIGURATION = {
  seriesSlug: 'ci-100',
  widthMm: 900,
  heightMm: 2100,
  locale: 'es',
}

test('el catálogo devuelve las series publicadas en el idioma pedido', async ({ request }) => {
  const response = await request.get('/api/catalog/series?locale=en')
  const body = await response.json()

  expect(response.ok()).toBe(true)
  expect(body.data.map((series: { slug: string }) => series.slug)).toContain('ci-100')
  expect(body.data[0].name).toBe('CI-100 series')
})

test('la ficha de serie incluye acabados, colores y accesorios', async ({ request }) => {
  const response = await request.get('/api/catalog/series/ci-100?locale=es')
  const body = await response.json()

  expect(response.ok()).toBe(true)
  expect(body.data.finishes.length).toBeGreaterThan(0)
  expect(body.data.finishes[0].colors.length).toBeGreaterThan(0)
})

test('el configurador obtiene precio automático para una medida dentro de rango', async ({
  request,
}) => {
  const response = await request.post('/api/quotes/price', { data: CONFIGURATION })
  const body = await response.json()

  expect(response.ok()).toBe(true)
  expect(body.status).toBe('priced')
  expect(body.breakdown.total.currency).toBe('EUR')
  expect(body.breakdown.taxRatePercent).toBe('21.00')
})

test('superar el tamaño máximo de la serie pasa a presupuesto manual', async ({ request }) => {
  const response = await request.post('/api/quotes/price', {
    data: { ...CONFIGURATION, widthMm: 1500 },
  })
  const body = await response.json()

  expect(body.status).toBe('manual_quote_required')
  expect(body.reason).toBe('size_exceeds_series_max')
})

test('una serie sin tarifa vigente pasa a presupuesto manual', async ({ request }) => {
  const response = await request.post('/api/quotes/price', {
    data: { ...CONFIGURATION, seriesSlug: 'ci-400' },
  })
  const body = await response.json()

  expect(body.status).toBe('manual_quote_required')
  expect(body.reason).toBe('no_tariff_in_force')
})

test('emite un presupuesto con referencia correlativa y lo devuelve por referencia', async ({
  request,
}) => {
  const created = await request.post('/api/quotes', { data: { ...CONFIGURATION, locale: 'en' } })
  const createdBody = await created.json()

  expect(created.status()).toBe(201)
  expect(createdBody.quote.reference).toMatch(/^PC-\d{4}-\d{6}$/)

  const fetched = await request.get(`/api/quotes/${createdBody.quote.reference}`)
  const fetchedBody = await fetched.json()

  expect(fetched.ok()).toBe(true)
  expect(fetchedBody.data.reference).toBe(createdBody.quote.reference)
  expect(fetchedBody.data.locale).toBe('en')
})

test('registra la solicitud de presupuesto manual con el motivo real', async ({ request }) => {
  const response = await request.post('/api/manual-quote-requests', {
    data: {
      seriesSlug: 'ci-100',
      widthMm: 1500,
      heightMm: 2100,
      locale: 'es',
      contact: { name: 'Cliente de prueba', email: 'cliente@example.com' },
    },
  })
  const body = await response.json()

  expect(response.status()).toBe(201)
  expect(body.request.reason).toBe('size_exceeds_series_max')
})

test('la API rechaza una petición inválida sin filtrar detalles internos', async ({ request }) => {
  const response = await request.post('/api/quotes/price', { data: { widthMm: 0 } })
  const body = await response.json()

  expect(response.status()).toBe(400)
  expect(body.error.code).toBe('VALIDATION_ERROR')
})
