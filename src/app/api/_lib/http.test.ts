import { describe, expect, it } from 'vitest'

import {
  InvalidMeasurementError,
  ResourceNotFoundError,
  AmbiguousTariffError,
  InvalidValueError,
  QuoteDeliveryAttemptsExhaustedError,
} from '@/domain/shared/errors'

import { errorResponse, readJsonBody } from './http'
import { configurationSchema } from './schemas'

describe('errorResponse', () => {
  it('traduce los errores de dominio a códigos HTTP estables', async () => {
    const notFound = errorResponse(new ResourceNotFoundError('no está'))
    const invalid = errorResponse(new InvalidMeasurementError('medida rara'))
    const conflict = errorResponse(new AmbiguousTariffError('dos tarifas'))
    const value = errorResponse(new InvalidValueError('valor raro'))

    expect(notFound.status).toBe(404)
    expect(invalid.status).toBe(400)
    expect(conflict.status).toBe(409)
    expect(value.status).toBe(400)
    expect(await notFound.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'no está' },
    })
  })

  it('mapea el agotamiento de intentos de entrega a 409 (fallback defensivo, CIF-195)', async () => {
    const response = errorResponse(new QuoteDeliveryAttemptsExhaustedError('sin intentos'))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: { code: 'QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED', message: 'sin intentos' },
    })
  })

  it('responde 500 genérico sin filtrar el error inesperado', async () => {
    const response = errorResponse(new Error('conexión con credenciales secretas'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Error interno' } })
  })
})

describe('readJsonBody', () => {
  it('rechaza un cuerpo que no es JSON', async () => {
    const request = new Request('http://localhost/api/quotes/price', {
      method: 'POST',
      body: 'no-json',
    })

    const result = await readJsonBody(request, configurationSchema)

    expect(result.ok).toBe(false)

    if (result.ok) return

    expect(result.response.status).toBe(400)
  })

  it('devuelve los campos inválidos sin ejecutar el caso de uso', async () => {
    const request = new Request('http://localhost/api/quotes/price', {
      method: 'POST',
      body: JSON.stringify({ seriesSlug: 'ci-100', widthMm: -5, heightMm: 2100 }),
    })

    const result = await readJsonBody(request, configurationSchema)

    expect(result.ok).toBe(false)

    if (result.ok) return

    const body = await result.response.json()

    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.issues.some((issue: { path: string }) => issue.path === 'widthMm')).toBe(true)
  })

  it('normaliza los valores por defecto del contrato', async () => {
    const request = new Request('http://localhost/api/quotes/price', {
      method: 'POST',
      body: JSON.stringify({ seriesSlug: 'ci-100', widthMm: 900, heightMm: 2100 }),
    })

    const result = await readJsonBody(request, configurationSchema)

    expect(result.ok).toBe(true)

    if (!result.ok) return

    expect(result.data).toMatchObject({
      finishId: null,
      colorId: null,
      accessoryIds: [],
      extras: [],
      discountCode: null,
      locale: 'es',
    })
  })
})
