/**
 * Test del adaptador en memoria de entregas (CIF-175 F1/F2, CIF-178).
 *
 * El E2E y los tests de los casos de uso usan este adaptador, así que tiene que replicar las mismas
 * garantías que el de Prisma: un solo intento puede reclamar una entrega y `save` nunca degrada una
 * entrega ya enviada. Si divergen, los tests darían por bueno un comportamiento que la base real no
 * tiene.
 */

import { describe, expect, it } from 'vitest'

import { QuoteDelivery } from '@/domain/quote/quote-delivery'

import { QUOTE_DELIVERY_CLAIM_LEASE_MS } from '@/application/ports/quote-delivery-repository'

import { InMemoryQuoteDeliveryRepository } from './quote-delivery-store'

const CREATED_AT = new Date('2026-09-12T09:00:00.000Z')

function makeDelivery(createdAt: Date = CREATED_AT): QuoteDelivery {
  return QuoteDelivery.pending({
    id: 'delivery-1',
    quoteId: 'quote-1',
    quoteReference: 'PC-2026-000001',
    version: 1,
    audience: 'customer',
    recipient: 'Cliente@Example.com',
    customerName: 'Ana',
    createdAt,
  })
}

describe('InMemoryQuoteDeliveryRepository', () => {
  it('reclama el intento una sola vez mientras la reserva está viva', async () => {
    const repository = new InMemoryQuoteDeliveryRepository()
    const at = new Date('2026-09-12T09:00:10.000Z')

    const first = await repository.claim(makeDelivery().startAttempt(at))
    const second = await repository.claim(makeDelivery().startAttempt(at))

    expect(first?.status).toBe('pending')
    expect(first?.attempts).toBe(1)
    expect(second).toBeNull()
    expect(await repository.listByQuoteId('quote-1')).toHaveLength(1)
  })

  it('deja retomar la entrega cuando la reserva ha caducado', async () => {
    const repository = new InMemoryQuoteDeliveryRepository()
    const claimedAt = new Date('2026-09-12T09:00:00.000Z')
    const abandoned = new Date(claimedAt.getTime() + QUOTE_DELIVERY_CLAIM_LEASE_MS + 1)

    const first = await repository.claim(makeDelivery().startAttempt(claimedAt))
    // El intento se construye sobre el estado guardado, como hace el caso de uso tras releer.
    const retaken = await repository.claim(first!.startAttempt(abandoned))

    expect(retaken).not.toBeNull()
    expect(retaken?.attempts).toBe(2)
  })

  it('nunca reclama una entrega ya enviada', async () => {
    const repository = new InMemoryQuoteDeliveryRepository()
    const at = new Date('2026-09-12T09:00:00.000Z')
    const claimed = await repository.claim(makeDelivery().startAttempt(at))

    await repository.save(claimed!.markSent('msg-1', at))
    const later = await repository.claim(makeDelivery(claimed!.createdAt).startAttempt(at))

    expect(later).toBeNull()
  })

  it('una entrega fallida se puede reclamar de inmediato', async () => {
    const repository = new InMemoryQuoteDeliveryRepository()
    const at = new Date('2026-09-12T09:00:00.000Z')
    const claimed = await repository.claim(makeDelivery().startAttempt(at))

    await repository.save(claimed!.markFailed('email: caído', at))
    const failed = await repository.findByKey(claimed!.idempotencyKey)
    const retried = await repository.claim(failed!.startAttempt(at))

    expect(retried).not.toBeNull()
    expect(retried?.attempts).toBe(2)
    expect(retried?.lastError).toBeNull()
  })

  it('no degrada una entrega enviada con una copia rezagada (F2 de CIF-175)', async () => {
    const repository = new InMemoryQuoteDeliveryRepository()
    const at = new Date('2026-09-12T09:00:00.000Z')
    const claimed = await repository.claim(makeDelivery().startAttempt(at))

    await repository.save(claimed!.markSent('msg-1', at))
    // Copia leída antes del envío, como la de una petición concurrente que llega tarde.
    await repository.save(makeDelivery(claimed!.createdAt).startAttempt(at))

    const stored = await repository.findByKey(claimed!.idempotencyKey)

    expect(stored?.status).toBe('sent')
    expect(stored?.attempts).toBe(1)
    expect(stored?.providerMessageId).toBe('msg-1')
    expect(stored?.sentAt).toEqual(at)
  })

  it('registra una entrega que no existía al guardar', async () => {
    const repository = new InMemoryQuoteDeliveryRepository()
    const at = new Date('2026-09-12T09:00:00.000Z')
    const delivery = makeDelivery().startAttempt(at)

    await repository.save(delivery.markSent('msg-1', at))

    expect(await repository.findByKey(delivery.idempotencyKey)).not.toBeNull()
  })
})
