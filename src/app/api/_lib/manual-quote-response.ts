/**
 * Borde HTTP: traduce el hecho de presupuesto manual al `detail` de la respuesta.
 *
 * El motor devuelve el hecho tipado (`ManualQuoteDetail`); el texto de usuario se compone aquí, en
 * el idioma pedido, con las claves `ManualQuoteReasons.<kind>` de `messages/<locale>.json`
 * (ADR-0005). Es el único punto donde el dominio deja de ser agnóstico de idioma.
 */

import type { Locale } from '@/domain/catalog/locale'
import type { ManualQuoteDetail } from '@/domain/pricing/manual-quote-detail'
import { formatManualQuoteDetail } from '@/i18n/manual-quote-reasons'

/** Sustituye el hecho por su `detail` traducido sin tocar el resto del contrato. */
export function withLocalizedManualQuoteDetail<T extends { readonly detail: ManualQuoteDetail }>(
  result: T,
  locale: Locale,
): Omit<T, 'detail'> & { readonly detail: string } {
  return { ...result, detail: formatManualQuoteDetail(result.detail, locale) }
}
