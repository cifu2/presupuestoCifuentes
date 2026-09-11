import { describe, expect, it } from 'vitest'

import {
  InvalidManualQuoteRequestError,
  InvalidManualQuoteTransitionError,
  InvalidValueError,
} from '@/domain/shared/errors'

import { ManualQuoteRequest, type ManualQuoteContact } from './manual-quote-request'
import { makeDimensions, TEST_NOW } from './testing/factories'

const contact: ManualQuoteContact = {
  name: 'Cliente de prueba',
  email: 'cliente@example.com',
  phone: '+34 600 000 000',
  message: 'Quiero una puerta más ancha',
  locale: 'es',
}

function makeRequest(
  overrides: Partial<Parameters<typeof ManualQuoteRequest.create>[0]> = {},
): ManualQuoteRequest {
  return ManualQuoteRequest.create({
    id: overrides.id ?? 'manual-quote-1',
    reason: overrides.reason ?? 'size_exceeds_series_max',
    status: overrides.status ?? 'pending',
    seriesId: overrides.seriesId === undefined ? 'series-ci-100' : overrides.seriesId,
    dimensions:
      overrides.dimensions === undefined ? makeDimensions(1300, 2100) : overrides.dimensions,
    finishId: overrides.finishId ?? null,
    colorId: overrides.colorId ?? null,
    accessoryIds: overrides.accessoryIds ?? [],
    contact: overrides.contact ?? contact,
    createdAt: overrides.createdAt ?? TEST_NOW,
    updatedAt: overrides.updatedAt ?? TEST_NOW,
    handledAt: overrides.handledAt ?? null,
  })
}

describe('ManualQuoteRequest', () => {
  it('registra la solicitud por tamaño máximo con su serie y medidas', () => {
    const request = makeRequest()

    expect(request.reason).toBe('size_exceeds_series_max')
    expect(request.isOpen()).toBe(true)
    expect(request.dimensions?.widthMm).toBe(1300)
  })

  it('exige serie y medidas cuando el motivo es superar el tamaño máximo', () => {
    expect(() => makeRequest({ seriesId: null })).toThrow(InvalidManualQuoteRequestError)
    expect(() => makeRequest({ dimensions: null })).toThrow(InvalidManualQuoteRequestError)
  })

  it('permite solicitudes sin medidas cuando el motivo es otro', () => {
    const request = makeRequest({
      reason: 'customer_requested',
      seriesId: null,
      dimensions: null,
    })

    expect(request.isOpen()).toBe(true)
    expect(request.seriesId).toBeNull()
  })

  it('valida los datos de contacto', () => {
    expect(() => makeRequest({ contact: { ...contact, name: 'A' } })).toThrow(
      InvalidManualQuoteRequestError,
    )
    expect(() => makeRequest({ contact: { ...contact, email: 'no-es-correo' } })).toThrow(
      InvalidManualQuoteRequestError,
    )
    expect(() => makeRequest({ contact: { ...contact, phone: '123' } })).toThrow(
      InvalidManualQuoteRequestError,
    )
    expect(() => makeRequest({ contact: { ...contact, phone: null } })).not.toThrow()
    expect(() => makeRequest({ contact: { ...contact, message: '   ' } })).toThrow(
      InvalidValueError,
    )
    expect(() => makeRequest({ contact: { ...contact, message: null } })).not.toThrow()
  })

  it('valida identificadores y fechas', () => {
    expect(() => makeRequest({ id: '  ' })).toThrow(InvalidValueError)
    expect(() => makeRequest({ seriesId: '  ' })).toThrow(InvalidValueError)
    expect(() => makeRequest({ accessoryIds: [''] })).toThrow(InvalidValueError)
    expect(() => makeRequest({ createdAt: new Date('no-es-fecha') })).toThrow(InvalidValueError)
    expect(() => makeRequest({ handledAt: new Date('no-es-fecha') })).toThrow(InvalidValueError)
  })

  it('pasa de pendiente a contactada y a cerrada', () => {
    const contacted = makeRequest().markContacted(TEST_NOW)
    const closed = contacted.close(TEST_NOW)

    expect(contacted.status).toBe('contacted')
    expect(contacted.isOpen()).toBe(true)
    expect(closed.status).toBe('closed')
    expect(closed.isOpen()).toBe(false)
    expect(closed.handledAt).toEqual(TEST_NOW)
  })

  it('rechaza transiciones inválidas', () => {
    const contacted = makeRequest().markContacted(TEST_NOW)
    const closed = makeRequest().close(TEST_NOW)

    expect(() => contacted.markContacted(TEST_NOW)).toThrow(InvalidManualQuoteTransitionError)
    expect(() => closed.close(TEST_NOW)).toThrow(InvalidManualQuoteTransitionError)
    expect(() => makeRequest().close(new Date('no-es-fecha'))).toThrow(InvalidValueError)
  })
})
