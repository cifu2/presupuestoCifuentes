/**
 * Puente entre los errores tipados del dominio y los mensajes traducibles de usuario.
 *
 * El dominio declara el motivo con un `code` estable; el borde HTTP y la UI lo traducen con
 * `DomainErrors.<CODE>` en `messages/<locale>.json`. La lista de códigos traducidos se comprueba
 * contra el tipo `DomainErrorCode`: si el dominio añade un código y no se traduce, no compila.
 */

import type { DomainErrorCode } from '@/domain/shared/errors'

export const DOMAIN_ERRORS_NAMESPACE = 'DomainErrors'

export const TRANSLATED_DOMAIN_ERROR_CODES = [
  'INVALID_VALUE',
  'INVALID_MEASUREMENT',
  'INVALID_SIZE_RANGE',
  'INVALID_CATALOG_VALUE',
  'INVALID_CATALOG_TEXT',
  'UNSUPPORTED_LOCALE',
  'INVALID_VALIDITY_PERIOD',
  'INVALID_TARIFF',
  'AMBIGUOUS_TARIFF',
  'INVALID_SERIES_TRANSITION',
  'INVALID_CATALOG_TRANSITION',
  'INVALID_MANUAL_QUOTE_REQUEST',
  'INVALID_MANUAL_QUOTE_TRANSITION',
  'INVALID_QUOTE',
  'INVALID_QUOTE_TRANSITION',
  'INVALID_QUOTE_REFERENCE',
  'INVALID_QUOTE_DELIVERY',
  'INVALID_QUOTE_DELIVERY_TRANSITION',
  'NOT_FOUND',
] as const satisfies readonly DomainErrorCode[]

type MissingDomainErrorCode = Exclude<
  DomainErrorCode,
  (typeof TRANSLATED_DOMAIN_ERROR_CODES)[number]
>

/** `true` solo si todos los códigos de error del dominio tienen traducción. */
export const ALL_DOMAIN_ERRORS_TRANSLATED: MissingDomainErrorCode extends never ? true : false =
  true

export function domainErrorMessageKey(code: DomainErrorCode): string {
  return `${DOMAIN_ERRORS_NAMESPACE}.${code}`
}
