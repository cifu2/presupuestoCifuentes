/**
 * Puerto de persistencia de las entregas de presupuesto (ADR-0004 §5-6).
 *
 * Guarda el estado de cada envío antes de renderizar el PDF y de enviar el email, para que un fallo
 * deje el presupuesto «pendiente de envío» y se pueda reintentar sin duplicar correos. La clave de
 * idempotencia (`quoteId + versión + destinatario`) es única: guardar dos veces la misma entrega
 * actualiza la fila existente en vez de crear otra.
 */

import type { QuoteDelivery } from '@/domain/quote/quote-delivery'

export interface QuoteDeliveryRepository {
  findByKey(idempotencyKey: string): Promise<QuoteDelivery | null>
  /** Inserta o actualiza por clave de idempotencia. */
  save(delivery: QuoteDelivery): Promise<void>
  listByQuoteId(quoteId: string): Promise<readonly QuoteDelivery[]>
}
