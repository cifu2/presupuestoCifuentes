/**
 * Motivo por el que el configurador no puede dar precio automático (ADR-0003).
 *
 * Vive aparte de la entidad `ManualQuoteRequest` para que el motor de precios pueda declarar el
 * motivo sin depender de la solicitud de contacto.
 */

export const MANUAL_QUOTE_REASONS = [
  'size_exceeds_series_max',
  'no_tariff_in_force',
  'uncovered_configuration',
  'customer_requested',
] as const

export type ManualQuoteReason = (typeof MANUAL_QUOTE_REASONS)[number]
