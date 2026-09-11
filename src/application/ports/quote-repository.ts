/**
 * Puerto de persistencia de presupuestos emitidos.
 *
 * El presupuesto guarda su tarifa, su configuración y su desglose: una vez guardado es inmutable
 * en precio (ADR-0003). `findByReference` es la lectura pública (`PC-2026-000123`).
 */

import type { Quote } from '@/domain/quote/quote'

export interface QuoteRepository {
  save(quote: Quote): Promise<void>
  findById(id: string): Promise<Quote | null>
  findByReference(reference: string): Promise<Quote | null>
  listRecent(limit: number): Promise<readonly Quote[]>
}
