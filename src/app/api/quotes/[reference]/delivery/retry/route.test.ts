/**
 * Test del borde HTTP del reintento de entrega cuando la entrega agotó sus intentos (CIF-186).
 *
 * Antes, el intento 101 rompía la invariante de `attempts` y el endpoint respondía
 * `400 INVALID_VALUE`, dejando la entrega atascada. Ahora responde `200` con el estado terminal y
 * el motivo persistido, sin renderizar ni enviar nada.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  makeAccessory,
  makeColor,
  makeFinish,
  makeSeries,
} from '@/domain/catalog/testing/factories'
import { makeBreakdown, makeConfiguration } from '@/domain/pricing/testing/factories'
import { Quote } from '@/domain/quote/quote'
import {
  MAX_QUOTE_DELIVERY_ATTEMPTS,
  QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED_REASON,
  QuoteDelivery,
} from '@/domain/quote/quote-delivery'
import { InMemoryQuoteDeliveryRepository } from '@/infrastructure/persistence/in-memory/quote-delivery-store'

const TOKEN = 'token-de-prueba-suficientemente-largo'
const NOW = new Date('2026-09-12T09:00:00.000Z')
const CUSTOMER_EMAIL = 'ana@example.com'

vi.mock('@/config/env', () => ({
  env: { ADMIN_API_TOKEN: 'token-de-prueba-suficientemente-largo' },
}))

const spies = vi.hoisted(() => ({ rendered: 0, sent: [] as string[] }))

const quote = Quote.issue({
  id: 'quote-1',
  reference: 'PC-2026-000001',
  configuration: makeConfiguration({ finishId: 'finish-lacado' }),
  tariffVersionId: 'tariff-ci-100-v1',
  locale: 'es',
  breakdown: makeBreakdown(),
  validUntil: new Date('2026-10-12T09:00:00.000Z'),
  createdAt: NOW,
})

const deliveries = new InMemoryQuoteDeliveryRepository()

vi.mock('@/composition/container', () => ({
  createContainer: () => ({
    mode: 'demo',
    clock: { now: () => NOW },
    idGenerator: { nextId: () => 'delivery-nueva' },
    quoteRepository: {
      save: async () => {},
      findById: async (id: string) => (id === quote.id ? quote : null),
      findByReference: async (reference: string) => (reference === quote.reference ? quote : null),
      listRecent: async () => [quote],
    },
    quoteDeliveryRepository: deliveries,
    seriesRepository: {
      findPublishedBySlug: async () => null,
      findById: async (id: string) => makeSeries({ id }),
      listPublished: async () => [],
    },
    finishRepository: {
      findById: async (id: string) => makeFinish({ id }),
      listPublished: async () => [],
      listPublishedByIds: async () => [],
    },
    colorRepository: {
      findById: async (id: string) => makeColor({ id }),
      listPublishedByFinishId: async () => [],
    },
    accessoryRepository: {
      findById: async (id: string) => makeAccessory({ id }),
      listPublished: async () => [],
      listPublishedByIds: async () => [],
    },
    quotePdfRenderer: {
      render: async () => {
        spies.rendered += 1

        return new Uint8Array([0x25, 0x50, 0x44, 0x46])
      },
    },
    emailSender: {
      send: async (message: { to: string }) => {
        spies.sent.push(message.to)

        return { providerMessageId: 'msg-1' }
      },
    },
    quoteDocumentSettings: {
      issuer: {
        name: 'Puertas Cifuentes S.L.',
        taxId: 'B12345678',
        address: 'Calle Mayor 1',
        email: 'presupuestos@example.com',
        phone: '+34 900 000 000',
        website: 'https://example.com',
        isPending: false,
      },
      conditions: { es: ['Validez 30 días'], en: ['Valid for 30 days'] },
      internalRecipients: [],
      pendingFields: [],
    },
  }),
}))

const { POST } = await import('./route')

function retry(token: string | null = TOKEN): Promise<Response> {
  return Promise.resolve(
    new Request('http://localhost/api/quotes/PC-2026-000001/delivery/retry', {
      method: 'POST',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    }),
  ).then((request) => POST(request, { params: Promise.resolve({ reference: quote.reference }) }))
}

async function seedAttempts(attempts: number, claimedAt: Date | null = null): Promise<void> {
  await deliveries.save(
    QuoteDelivery.create({
      id: 'delivery-1',
      quoteId: quote.id,
      quoteReference: quote.reference,
      version: 1,
      audience: 'customer',
      recipient: CUSTOMER_EMAIL,
      customerName: 'Ana',
      status: claimedAt === null ? 'failed' : 'pending',
      attempts,
      providerMessageId: null,
      lastError: claimedAt === null ? 'email: proveedor caído' : null,
      createdAt: NOW,
      updatedAt: NOW,
      sentAt: null,
      claimedAt,
    }),
  )
}

describe('POST /api/quotes/:reference/delivery/retry con los intentos agotados (CIF-186)', () => {
  it('responde 200 con el estado terminal y el motivo, en vez de 400 INVALID_VALUE', async () => {
    spies.rendered = 0
    spies.sent.length = 0
    await seedAttempts(MAX_QUOTE_DELIVERY_ATTEMPTS)

    const response = await retry()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('attempts_exhausted')
    expect(body.reason).toBe('attempts_exhausted')
    expect(body.pdfBytes).toBe(0)
    expect(body.deliveries[0].status).toBe('failed')
    expect(body.deliveries[0].attempts).toBe(MAX_QUOTE_DELIVERY_ATTEMPTS)
    expect(body.deliveries[0].lastError).toBe(QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED_REASON)
    expect(spies.rendered).toBe(0)
    expect(spies.sent).toEqual([])
  })

  it('responde in_progress, no attempts_exhausted, si el intento 100 sigue en vuelo (CIF-195)', async () => {
    spies.rendered = 0
    spies.sent.length = 0
    await seedAttempts(MAX_QUOTE_DELIVERY_ATTEMPTS, NOW)

    const response = await retry()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('in_progress')
    expect(body.reason).toBe('none')
    expect(body.deliveries[0].status).toBe('pending')
    expect(body.deliveries[0].attempts).toBe(MAX_QUOTE_DELIVERY_ATTEMPTS)
    expect(body.deliveries[0].lastError).toBeNull()
    expect(spies.rendered).toBe(0)
    expect(spies.sent).toEqual([])
  })

  it('deja pasar el último intento disponible para que el envío no se bloquee antes de tiempo', async () => {
    spies.rendered = 0
    spies.sent.length = 0
    await seedAttempts(MAX_QUOTE_DELIVERY_ATTEMPTS - 1)

    const response = await retry()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('delivered')
    expect(body.deliveries[0].attempts).toBe(MAX_QUOTE_DELIVERY_ATTEMPTS)
    expect(body.deliveries[0].status).toBe('sent')
    expect(spies.sent).toEqual([CUSTOMER_EMAIL])
  })

  it('sigue exigiendo el token del panel', async () => {
    const response = await retry(null)

    expect(response.status).toBe(401)
  })
})
