/**
 * Test de integración del borde HTTP: petición real → route handler → caso de uso → adaptadores
 * en memoria. Comprueba contratos, códigos de estado y errores estables.
 */

import { describe, expect, it } from 'vitest'

import { GET as getSeriesList } from './catalog/series/route'
import { GET as getSeriesDetail } from './catalog/series/[slug]/route'
import { POST as postPrice } from './quotes/price/route'
import { POST as postQuote } from './quotes/route'
import { GET as getQuote } from './quotes/[reference]/route'
import { POST as postManualQuote } from './manual-quote-requests/route'

const CONFIGURATION = {
  seriesSlug: 'ci-100',
  widthMm: 900,
  heightMm: 2100,
  locale: 'es',
}

function post(url: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    new Request(`http://localhost${url}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  ).then((request) => routePost(url, request))
}

function routePost(url: string, request: Request): Promise<Response> {
  if (url === '/api/quotes/price') return postPrice(request)
  if (url === '/api/quotes') return postQuote(request)
  if (url === '/api/manual-quote-requests') return postManualQuote(request)

  throw new Error(`Ruta no soportada en el test: ${url}`)
}

describe('GET /api/catalog/series', () => {
  it('devuelve las series publicadas del catálogo', async () => {
    const response = await getSeriesList(
      new Request('http://localhost/api/catalog/series?locale=es'),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.meta).toEqual({ locale: 'es', mode: 'demo' })
    expect(body.data.map((series: { slug: string }) => series.slug)).toEqual([
      'ci-100',
      'ci-200',
      'ci-300',
      'ci-400',
    ])
  })

  it('traduce los textos al idioma pedido', async () => {
    const response = await getSeriesList(
      new Request('http://localhost/api/catalog/series?locale=en'),
    )
    const body = await response.json()

    expect(body.data[0].name).toBe('CI-100 series')
  })

  it('rechaza un idioma no soportado en la validación de entrada', async () => {
    const response = await getSeriesList(
      new Request('http://localhost/api/catalog/series?locale=de'),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.issues[0].path).toBe('locale')
  })
})

describe('GET /api/catalog/series/[slug]', () => {
  it('devuelve la ficha con acabados, colores y accesorios', async () => {
    const response = await getSeriesDetail(
      new Request('http://localhost/api/catalog/series/ci-100?locale=es'),
      { params: Promise.resolve({ slug: 'ci-100' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.series.slug).toBe('ci-100')
    expect(body.data.finishes[0].colors[0].hex).toBe('#F1EDE1')
    expect(body.data.accessories.length).toBeGreaterThan(0)
  })

  it('responde 404 con código estable si la serie no existe', async () => {
    const response = await getSeriesDetail(
      new Request('http://localhost/api/catalog/series/no-existe'),
      { params: Promise.resolve({ slug: 'no-existe' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})

describe('POST /api/quotes/price', () => {
  it('devuelve el desglose con tarifa vigente', async () => {
    const response = await post('/api/quotes/price', CONFIGURATION)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('priced')
    expect(body.breakdown.total).toEqual({ amount: '869.02', currency: 'EUR' })
    expect(body.tariff.versionNumber).toBe(1)
  })

  it('pasa a presupuesto manual cuando la medida supera el tamaño máximo', async () => {
    const response = await post('/api/quotes/price', { ...CONFIGURATION, widthMm: 1200 })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: 'manual_quote_required',
      reason: 'size_exceeds_series_max',
    })
  })

  it('exige la serie y las medidas', async () => {
    const response = await post('/api/quotes/price', { widthMm: 900, heightMm: 2100 })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('POST /api/quotes y GET /api/quotes/[reference]', () => {
  it('emite un presupuesto con precio congelado y lo devuelve por referencia', async () => {
    const created = await post('/api/quotes', { ...CONFIGURATION, locale: 'en' })
    const createdBody = await created.json()

    expect(created.status).toBe(201)
    expect(createdBody.status).toBe('issued')
    expect(createdBody.quote.reference).toMatch(/^PC-\d{4}-\d{6}$/)
    expect(createdBody.quote.locale).toBe('en')
    expect(createdBody.quote.totals.total.amount).toBe('869.02')
    expect(createdBody.quote.breakdown.lines[0].code).toBe('base')

    const fetched = await getQuote(
      new Request(`http://localhost/api/quotes/${createdBody.quote.reference}`),
      { params: Promise.resolve({ reference: createdBody.quote.reference }) },
    )
    const fetchedBody = await fetched.json()

    expect(fetched.status).toBe(200)
    expect(fetchedBody.data.reference).toBe(createdBody.quote.reference)
    expect(fetchedBody.data.breakdown.lines.length).toBe(createdBody.quote.breakdown.lines.length)
  })

  it('responde 404 si la referencia no existe', async () => {
    const response = await getQuote(new Request('http://localhost/api/quotes/PC-2026-000404'), {
      params: Promise.resolve({ reference: 'PC-2026-000404' }),
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})

describe('POST /api/manual-quote-requests', () => {
  it('registra la solicitud con el motivo derivado por el servidor', async () => {
    const response = await post('/api/manual-quote-requests', {
      seriesSlug: 'ci-100',
      widthMm: 1500,
      heightMm: 2100,
      locale: 'es',
      contact: { name: 'Cliente de prueba', email: 'cliente@example.com' },
    })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.status).toBe('created')
    expect(body.request.reason).toBe('size_exceeds_series_max')
  })

  it('devuelve el precio disponible si la configuración sí lo tiene', async () => {
    const response = await post('/api/manual-quote-requests', {
      seriesSlug: 'ci-300',
      widthMm: 800,
      heightMm: 2000,
      locale: 'es',
      contact: { name: 'Cliente de prueba', email: 'cliente@example.com' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('price_available')
  })

  it('exige un contacto válido', async () => {
    const response = await post('/api/manual-quote-requests', {
      seriesSlug: 'ci-100',
      widthMm: 1500,
      heightMm: 2100,
      contact: { name: 'X', email: 'no-es-un-correo' },
    })
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
