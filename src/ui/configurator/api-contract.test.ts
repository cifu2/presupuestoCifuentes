import { describe, expect, it } from 'vitest'

import { parseResponse, priceAvailableSchema } from './api-contract'

/** Respuesta documentada de `POST /api/manual-quote-requests` cuando la configuración sí tenía precio. */
const PRICE_AVAILABLE = {
  status: 'price_available',
  seriesId: 'series-ci-100',
  seriesCode: 'CI-100',
  breakdown: {
    currency: 'EUR',
    lines: [],
    basePrice: { amount: '718.20', currency: 'EUR' },
    subtotal: { amount: '718.20', currency: 'EUR' },
    taxRatePercent: '21.00',
    taxAmount: { amount: '150.82', currency: 'EUR' },
    total: { amount: '869.02', currency: 'EUR' },
  },
} as const

describe('contrato del configurador', () => {
  it('acepta el estado price_available documentado en docs/api.md', () => {
    expect(priceAvailableSchema.safeParse(PRICE_AVAILABLE).success).toBe(true)
    expect(parseResponse(priceAvailableSchema, PRICE_AVAILABLE)?.status).toBe('price_available')
  })

  it('rechaza price_available sin el desglose completo', () => {
    const { status, seriesId, seriesCode } = PRICE_AVAILABLE

    expect(priceAvailableSchema.safeParse({ status, seriesId, seriesCode }).success).toBe(false)
  })
})
