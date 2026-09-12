/**
 * Puerto de renderizado del PDF del presupuesto (ADR-0004 §2-3).
 *
 * El caso de uso no sabe si detrás hay `@react-pdf/renderer` u otra tecnología: pide los bytes del
 * documento. El adaptador es de servidor, sin navegador ni binarios externos.
 */

import type { QuoteDocument } from '@/domain/quote/quote-document'

export interface QuotePdfRenderer {
  /** Devuelve el PDF completo del documento; lanza si no puede renderizarlo. */
  render(document: QuoteDocument): Promise<Uint8Array>
}
