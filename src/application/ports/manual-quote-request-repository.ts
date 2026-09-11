/**
 * Puerto de persistencia de solicitudes de presupuesto manual.
 *
 * El canal de aviso al comercial (email) se modela aparte: aquí solo se guarda la solicitud para
 * que no se pierda ningún contacto aunque falle el envío (ADR-0004).
 */

import type { ManualQuoteRequest } from '@/domain/catalog/manual-quote-request'

export interface ManualQuoteRequestRepository {
  save(request: ManualQuoteRequest): Promise<void>
  findById(id: string): Promise<ManualQuoteRequest | null>
}
