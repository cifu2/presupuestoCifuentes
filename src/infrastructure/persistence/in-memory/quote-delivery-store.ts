/**
 * Adaptador en memoria de entregas de presupuesto.
 *
 * Para tests y para el modo demostración (E2E sin PostgreSQL). Guarda por clave de idempotencia,
 * igual que la tabla real: reintentar la misma entrega actualiza la fila en lugar de crear otra.
 */

import type { QuoteDelivery } from '@/domain/quote/quote-delivery'

import type { QuoteDeliveryRepository } from '@/application/ports/quote-delivery-repository'

export class InMemoryQuoteDeliveryRepository implements QuoteDeliveryRepository {
  private readonly deliveries = new Map<string, QuoteDelivery>()

  async findByKey(idempotencyKey: string): Promise<QuoteDelivery | null> {
    return this.deliveries.get(idempotencyKey) ?? null
  }

  async save(delivery: QuoteDelivery): Promise<void> {
    this.deliveries.set(delivery.idempotencyKey, delivery)
  }

  async listByQuoteId(quoteId: string): Promise<readonly QuoteDelivery[]> {
    return [...this.deliveries.values()]
      .filter((delivery) => delivery.quoteId === quoteId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  }

  /** Solo para tests: número de entregas registradas. */
  size(): number {
    return this.deliveries.size
  }
}
