/**
 * Configuración del documento de presupuesto que depende del propietario (CIF-14).
 *
 * ADR-0004 deja en manos del propietario el dominio remitente, el buzón del comercial y los datos
 * fiscales y condiciones del PDF. Mientras llega esa respuesta, la ingeniería no se para: aquí se
 * resuelven esos valores **desde el entorno**, con un marcador explícito cuando faltan, y el
 * documento avisa de lo que sigue pendiente. Rellenar los ajustes no exige tocar código.
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

import type { QuoteDocumentSettings } from '@/application/ports/quote-document-settings'

import { env, type Env } from './env'

/** Texto explícito que sustituye a un valor que el propietario todavía no ha confirmado. */
export const PENDING_CONFIGURATION_MARKER = '[pendiente de configurar]'

/** Claves de los valores pendientes; el PDF las traduce a un aviso legible. */
export const ISSUER_FIELDS = [
  'issuer.name',
  'issuer.taxId',
  'issuer.address',
  'issuer.email',
  'issuer.phone',
  'issuer.website',
] as const

export type IssuerField = (typeof ISSUER_FIELDS)[number]

export type QuoteDocumentConfigSource = Pick<
  Env,
  | 'QUOTE_ISSUER_NAME'
  | 'QUOTE_ISSUER_TAX_ID'
  | 'QUOTE_ISSUER_ADDRESS'
  | 'QUOTE_ISSUER_EMAIL'
  | 'QUOTE_ISSUER_PHONE'
  | 'QUOTE_ISSUER_WEBSITE'
  | 'QUOTE_CONDITIONS_ES'
  | 'QUOTE_CONDITIONS_EN'
  | 'QUOTE_INTERNAL_RECIPIENTS'
>

/** Una condición por línea; las líneas vacías se ignoran. */
export function parseConditions(raw: string | undefined): readonly string[] {
  return (raw ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** Destinatarios separados por comas; los huecos se ignoran. */
export function parseRecipients(raw: string | undefined): readonly string[] {
  return (raw ?? '')
    .split(',')
    .map((recipient) => recipient.trim())
    .filter((recipient) => recipient.length > 0)
}

export function resolveQuoteDocumentSettings(
  source: QuoteDocumentConfigSource = env,
): QuoteDocumentSettings {
  const pendingFields: string[] = []

  const value = (raw: string | undefined, field: IssuerField): string => {
    if (raw === undefined) {
      pendingFields.push(field)

      return PENDING_CONFIGURATION_MARKER
    }

    return raw
  }

  const name = value(source.QUOTE_ISSUER_NAME, 'issuer.name')
  const taxId = value(source.QUOTE_ISSUER_TAX_ID, 'issuer.taxId')
  const address = value(source.QUOTE_ISSUER_ADDRESS, 'issuer.address')
  const email = value(source.QUOTE_ISSUER_EMAIL, 'issuer.email')
  const phone = value(source.QUOTE_ISSUER_PHONE, 'issuer.phone')
  const website = value(source.QUOTE_ISSUER_WEBSITE, 'issuer.website')
  const isPending = pendingFields.length > 0

  const byLocale: Record<Locale, readonly string[]> = {
    es: parseConditions(source.QUOTE_CONDITIONS_ES),
    en: parseConditions(source.QUOTE_CONDITIONS_EN),
  }

  const defaultConditions = byLocale[DEFAULT_LOCALE]

  const conditions = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const own = byLocale[locale]

      if (own.length > 0) {
        return [locale, own]
      }

      pendingFields.push(`conditions.${locale}`)

      // Sin condiciones propias se imprime el texto del idioma por defecto: mejor una condición
      // conocida que un hueco; el aviso de pendiente deja claro que falta la traducción.
      return [locale, defaultConditions]
    }),
  ) as Readonly<Record<Locale, readonly string[]>>

  return {
    issuer: {
      name,
      taxId,
      address,
      email,
      phone,
      website,
      isPending,
    },
    conditions,
    internalRecipients: parseRecipients(source.QUOTE_INTERNAL_RECIPIENTS),
    pendingFields,
  }
}
