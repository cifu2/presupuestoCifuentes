/**
 * Puerto de persistencia de las entregas de presupuesto (ADR-0004 §5-6).
 *
 * Guarda el estado de cada envío antes de renderizar el PDF y de enviar el email, para que un fallo
 * deje el presupuesto «pendiente de envío» y se pueda reintentar sin duplicar correos. La clave de
 * idempotencia (`quoteId + versión + destinatario`) es única y `claim` la reserva de forma atómica:
 * dos intentos simultáneos de la misma entrega no pueden enviar los dos.
 */

import type { QuoteDelivery } from '@/domain/quote/quote-delivery'

/**
 * Vida de la reserva de un intento. Si el proceso que reservó la entrega muere antes de registrar
 * el resultado, pasados estos minutos otro intento puede reclamarla; así un fallo no bloquea el
 * reintento para siempre ni abre la puerta a un doble envío.
 */
export const QUOTE_DELIVERY_CLAIM_LEASE_MS = 15 * 60 * 1000

export interface QuoteDeliveryRepository {
  findByKey(idempotencyKey: string): Promise<QuoteDelivery | null>
  /** Inserta o actualiza por clave de idempotencia, sin resucitar una entrega ya enviada. */
  save(delivery: QuoteDelivery): Promise<void>
  /**
   * Reserva atómica del intento antes de renderizar o enviar (ADR-0004 §5-6).
   *
   * Devuelve la entrega reservada, o `null` si ya se envió o si otro intento la tiene reservada con
   * la reserva viva (`QUOTE_DELIVERY_CLAIM_LEASE_MS`). Un `null` significa «no envíes: no es tuya».
   */
  claim(delivery: QuoteDelivery): Promise<QuoteDelivery | null>
  listByQuoteId(quoteId: string): Promise<readonly QuoteDelivery[]>
}
