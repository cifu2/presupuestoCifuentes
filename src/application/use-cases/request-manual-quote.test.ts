import { describe, expect, it } from 'vitest'

import { makePriceInput, makeTestWorld } from '@/application/testing/fixtures'
import { requestManualQuote } from './request-manual-quote'

function deps(world: ReturnType<typeof makeTestWorld>) {
  return {
    seriesRepository: world.seriesRepository,
    tariffPricingRepository: world.tariffPricingRepository,
    colorRepository: world.colorRepository,
    manualQuoteRequestRepository: world.manualQuoteRequestRepository,
    idGenerator: world.idGenerator,
    clock: world.clock,
  }
}

const CONTACT = {
  name: 'Cliente de prueba',
  email: 'cliente@example.com',
  phone: null,
  message: null,
  locale: 'es' as const,
}

describe('requestManualQuote', () => {
  it('registra la solicitud con el motivo derivado por el servidor', async () => {
    const world = makeTestWorld()

    const result = await requestManualQuote(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      widthMm: 1500,
      locale: 'es',
      requestedReason: null,
      contact: CONTACT,
    })

    expect(result.status).toBe('created')

    if (result.status !== 'created') return

    expect(result.request.reason).toBe('size_exceeds_series_max')
    expect(result.request.status).toBe('pending')
  })

  it('no registra nada si la configuración sí tiene precio automático', async () => {
    const world = makeTestWorld()

    const result = await requestManualQuote(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      locale: 'es',
      requestedReason: null,
      contact: CONTACT,
    })

    expect(result).toMatchObject({ status: 'price_available', seriesCode: 'CI-100' })
    expect(world.quotes.manualQuoteRequests).toHaveLength(0)
  })

  it('acepta una petición expresa del cliente sin recálculo', async () => {
    const world = makeTestWorld()

    const result = await requestManualQuote(deps(world), {
      slug: null,
      widthMm: null,
      heightMm: null,
      finishId: null,
      colorId: null,
      accessoryIds: [],
      extras: [],
      discountCode: null,
      locale: 'es',
      requestedReason: 'customer_requested',
      contact: CONTACT,
    })

    expect(result.status).toBe('created')

    if (result.status !== 'created') return

    expect(result.request.reason).toBe('customer_requested')
  })

  it('deriva no_tariff_in_force cuando la serie no tiene tarifa', async () => {
    const world = makeTestWorld()

    const result = await requestManualQuote(deps(world), {
      slug: 'ci-400',
      ...makePriceInput(),
      locale: 'es',
      requestedReason: null,
      contact: CONTACT,
    })

    expect(result.status).toBe('created')

    if (result.status !== 'created') return

    expect(result.request.reason).toBe('no_tariff_in_force')
  })
})
