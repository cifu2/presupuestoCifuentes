/**
 * Contrato de las respuestas de la API pública que consume el configurador.
 *
 * La respuesta HTTP es un borde externo: se valida con Zod antes de usarla, igual que el servidor
 * valida lo que recibe. Un `parse` fallido se trata como error de carga, nunca revienta la vista.
 * El contrato documentado es docs/api.md.
 */

import { z } from 'zod'

const moneySchema = z.object({
  amount: z.string(),
  currency: z.string(),
})

const sizeRangeSchema = z.object({
  minWidthMm: z.number(),
  maxWidthMm: z.number(),
  minHeightMm: z.number(),
  maxHeightMm: z.number(),
})

const seriesSummarySchema = z.object({
  id: z.string(),
  code: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sizeRange: sizeRangeSchema,
  allowedFinishIds: z.array(z.string()),
  allowedAccessoryIds: z.array(z.string()),
})

export const seriesDetailSchema = z.object({
  series: seriesSummarySchema,
  finishes: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      colors: z.array(
        z.object({
          id: z.string(),
          code: z.string(),
          name: z.string(),
          hex: z.string().nullable(),
        }),
      ),
    }),
  ),
  accessories: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      category: z.string(),
    }),
  ),
})

const priceLineSchema = z.object({
  code: z.string(),
  label: z.string().nullable(),
  kind: z.string(),
  units: z.number(),
  unitAmount: moneySchema,
  amount: moneySchema,
})

const breakdownSchema = z.object({
  currency: z.string(),
  lines: z.array(priceLineSchema),
  basePrice: moneySchema,
  subtotal: moneySchema,
  taxRatePercent: z.string(),
  taxAmount: moneySchema,
  total: moneySchema,
})

export const priceResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('priced'),
    series: seriesSummarySchema,
    tariff: z.object({
      id: z.string(),
      versionNumber: z.number(),
      validFrom: z.string(),
      validUntil: z.string().nullable(),
    }),
    breakdown: breakdownSchema,
  }),
  z.object({
    status: z.literal('manual_quote_required'),
    seriesId: z.string(),
    seriesCode: z.string(),
    reason: z.string(),
    detail: z.string(),
  }),
])

/**
 * `POST /api/manual-quote-requests` responde así cuando la configuración enviada sí tenía precio
 * (docs/api.md): el servidor recalculó y el cliente debe volver al precio en vivo, no mostrar un
 * error de contrato.
 */
export const priceAvailableSchema = z.object({
  status: z.literal('price_available'),
  seriesId: z.string(),
  seriesCode: z.string(),
  breakdown: breakdownSchema,
})

export const quoteIssuedSchema = z.object({
  status: z.literal('issued'),
  quote: z.object({
    reference: z.string(),
    validUntil: z.string().nullable(),
    totals: z.object({
      subtotal: moneySchema,
      taxAmount: moneySchema,
      total: moneySchema,
    }),
    breakdown: breakdownSchema,
  }),
})

export const manualQuoteCreatedSchema = z.object({
  status: z.literal('created'),
  request: z.object({
    id: z.string(),
    reason: z.string(),
    status: z.string(),
    createdAt: z.string(),
  }),
})

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    issues: z
      .array(z.object({ path: z.union([z.string(), z.number()]), message: z.string() }))
      .optional(),
  }),
})

export type SeriesDetailDto = z.infer<typeof seriesDetailSchema>
export type PriceResultDto = z.infer<typeof priceResultSchema>
export type PricedResultDto = Extract<PriceResultDto, { status: 'priced' }>
export type ManualQuoteResultDto = Extract<PriceResultDto, { status: 'manual_quote_required' }>
export type PriceBreakdownDto = z.infer<typeof breakdownSchema>
export type MoneyDto = z.infer<typeof moneySchema>
export type QuoteIssuedDto = z.infer<typeof quoteIssuedSchema>
export type ManualQuoteCreatedDto = z.infer<typeof manualQuoteCreatedSchema>
export type PriceAvailableDto = z.infer<typeof priceAvailableSchema>

/** Código de error estable de la API, o `INTERNAL_ERROR` si la respuesta no trae el contrato. */
export function readApiErrorCode(payload: unknown): string {
  const parsed = apiErrorSchema.safeParse(payload)

  return parsed.success ? parsed.data.error.code : 'INTERNAL_ERROR'
}

/** Respuesta envuelta en `{ data, meta }` (endpoints de catálogo). */
export function parseWrappedData<T>(schema: z.ZodType<T>, payload: unknown): T | null {
  const wrapper = z.object({ data: schema }).safeParse(payload)

  return wrapper.success ? wrapper.data.data : null
}

/** Respuesta directa (precio, emisión de presupuesto y solicitud manual). */
export function parseResponse<T>(schema: z.ZodType<T>, payload: unknown): T | null {
  const parsed = schema.safeParse(payload)

  return parsed.success ? parsed.data : null
}
