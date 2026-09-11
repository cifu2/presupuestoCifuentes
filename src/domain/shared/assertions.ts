/**
 * Validaciones reutilizables de objetos de valor.
 *
 * Los bordes (route handlers, panel) validan con Zod; estas aserciones protegen las invariantes
 * del dominio cuando se construye una entidad desde cualquier origen (semillas, panel o tests).
 */

import { InvalidValueError } from '@/domain/shared/errors'

export function assertNonEmptyString(value: string, field: string, minLength = 1): void {
  if (value.trim().length < minLength) {
    throw new InvalidValueError(`${field} no puede estar vacío (mínimo ${minLength} caracteres)`)
  }
}

export function assertIntegerInRange(value: number, field: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new InvalidValueError(
      `${field} debe ser un entero entre ${min} y ${max}; recibido ${value}`,
    )
  }
}

export function assertValidDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new InvalidValueError(`${field} debe ser una fecha válida`)
  }
}

/**
 * Dos decimales como máximo para que el valor del dominio coincida exactamente con la columna
 * `tariff_version.tax_rate_percent NUMERIC(5,2)`. Con más decimales PostgreSQL redondearía en
 * silencio y el dominio y la base de datos divergirían en un valor fiscal.
 */
const PERCENTAGE_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/

/**
 * Valida un porcentaje en cadena decimal exacta, de 0 a 100 con hasta dos decimales, sin usar
 * coma flotante.
 */
export function assertPercentage(value: string, field: string): void {
  const match = PERCENTAGE_PATTERN.exec(value.trim())

  if (match === null) {
    throw new InvalidValueError(
      `${field} debe ser un porcentaje decimal entre 0 y 100, p. ej. "21" o "21.5"; recibido "${value}"`,
    )
  }

  const integerPart = (match[1] ?? '0').padStart(3, '0')
  const fractionPart = match[2] ?? ''
  const exceedsHundred =
    integerPart > '100' || (integerPart === '100' && /[1-9]/.test(fractionPart))

  if (exceedsHundred) {
    throw new InvalidValueError(`${field} no puede superar 100; recibido "${value}"`)
  }
}
