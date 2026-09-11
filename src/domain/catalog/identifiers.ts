/**
 * Formatos de identificadores de catálogo.
 *
 * El `code` es el identificador estable que usa el propietario (p. ej. `CI-100`); el `slug` es
 * la parte legible de la URL pública del configurador.
 */

import { InvalidCatalogValueError } from '@/domain/shared/errors'

export const CATALOG_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,31}$/
export const CATALOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const CATALOG_SLUG_MAX_LENGTH = 80

export function assertCatalogCode(value: string, field: string): void {
  if (!CATALOG_CODE_PATTERN.test(value)) {
    throw new InvalidCatalogValueError(
      `${field} debe ser un código estable en mayúsculas (A-Z, 0-9, "-", "_") de 2 a 32 caracteres; recibido "${value}"`,
    )
  }
}

export function assertCatalogSlug(value: string, field: string): void {
  if (value.length > CATALOG_SLUG_MAX_LENGTH || !CATALOG_SLUG_PATTERN.test(value)) {
    throw new InvalidCatalogValueError(
      `${field} debe ser un slug en minúsculas separado por guiones de hasta ${CATALOG_SLUG_MAX_LENGTH} caracteres; recibido "${value}"`,
    )
  }
}
