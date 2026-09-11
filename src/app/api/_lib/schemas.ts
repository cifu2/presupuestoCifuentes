/**
 * Contratos de entrada de la API pública (Zod en el borde).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'
import { MAX_DIMENSION_MM, MIN_DIMENSION_MM } from '@/domain/catalog/measurement'
import { QUOTE_EXTRAS } from '@/domain/pricing/quote-configuration'

import { validationErrorResponse } from './http'

export const localeSchema = z.enum(SUPPORTED_LOCALES).default(DEFAULT_LOCALE)

const dimensionSchema = z.number().int().min(MIN_DIMENSION_MM).max(MAX_DIMENSION_MM)

const optionalId = z.string().min(1).nullable().default(null)

export const configurationSchema = z.object({
  seriesSlug: z.string().min(1).max(80),
  widthMm: dimensionSchema,
  heightMm: dimensionSchema,
  finishId: optionalId,
  colorId: optionalId,
  accessoryIds: z.array(z.string().min(1)).max(50).default([]),
  extras: z.array(z.enum(QUOTE_EXTRAS)).max(QUOTE_EXTRAS.length).default([]),
  discountCode: z.string().min(1).max(32).nullable().default(null),
  locale: localeSchema,
})

export type ConfigurationPayload = z.infer<typeof configurationSchema>

export const manualQuoteRequestSchema = z.object({
  seriesSlug: z.string().min(1).max(80).nullable().default(null),
  widthMm: dimensionSchema.nullable().default(null),
  heightMm: dimensionSchema.nullable().default(null),
  finishId: optionalId,
  colorId: optionalId,
  accessoryIds: z.array(z.string().min(1)).max(50).default([]),
  extras: z.array(z.enum(QUOTE_EXTRAS)).max(QUOTE_EXTRAS.length).default([]),
  discountCode: z.string().min(1).max(32).nullable().default(null),
  locale: localeSchema,
  customerRequested: z.boolean().default(false),
  contact: z.object({
    name: z.string().min(2).max(120),
    email: z.email().max(254),
    phone: z.string().min(6).max(40).nullable().default(null),
    message: z.string().min(1).max(2000).nullable().default(null),
  }),
})

const localeQuerySchema = z.object({ locale: localeSchema })

export function parseLocale(
  searchParams: URLSearchParams,
): { ok: true; locale: Locale } | { ok: false; response: NextResponse } {
  const result = localeQuerySchema.safeParse({
    locale: searchParams.get('locale') ?? undefined,
  })

  if (!result.success) {
    return { ok: false, response: validationErrorResponse(result.error) }
  }

  return { ok: true, locale: result.data.locale }
}
