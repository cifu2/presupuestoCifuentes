/**
 * Adaptador en memoria de entregas de presupuesto.
 *
 * Para tests y para el modo demostración (E2E sin PostgreSQL). Guarda por clave de idempotencia y
 * reproduce las mismas garantías que la tabla real: `claim` reserva el intento de forma atómica
 * (nada de `await` entre la comprobación y la escritura) y `save` no resucita una entrega enviada.
 */

import type { QuoteDelivery } from '@/domain/quote/quote-delivery'

import {
  QUOTE_DELIVERY_CLAIM_LEASE_MS,
  type QuoteDeliveryRepository,
} from '@/application/ports/quote-delivery-repository'

export class InMemoryQuoteDeliveryRepository implements QuoteDeliveryRepository {
  private readonly deliveries = new Map<string, QuoteDelivery>()

  async findByKey(idempotencyKey: string): Promise<QuoteDelivery | null> {
    return this.deliveries.get(idempotencyKey) ?? null
  }

  async save(delivery: QuoteDelivery): Promise<void> {
    const stored = this.deliveries.get(delivery.idempotencyKey)

    if (stored?.isSent() === true && !delivery.isSent()) {
      return
    }

    this.deliveries.set(delivery.idempotencyKey, delivery)
  }

  async claim(delivery: QuoteDelivery): Promise<QuoteDelivery | null> {
    const stored = this.deliveries.get(delivery.idempotencyKey)

    if (stored !== undefined) {
      if (stored.isSent()) return null

      const now = delivery.claimedAt ?? delivery.updatedAt

      if (stored.hasActiveClaim(now, QUOTE_DELIVERY_CLAIM_LEASE_MS)) return null
    }

    this.deliveries.set(delivery.idempotencyKey, delivery)

    return delivery
  }

  async listByQuoteId(quoteId: string): Promise<readonly QuoteDelivery[]> {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.quoteId === quoteId)
      .sort(
        (left, right) =>
          left.version - right.version || left.createdAt.getTime() - right.createdAt.getTime(),
      )
  }

  /** Solo para tests: número de entregas registradas. */
  size(): number {
    return this.deliveries.size
  }
}
