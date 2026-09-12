/**
 * Tipos de entrada compartidos por los casos de uso de escritura del catálogo.
 *
 * El panel y el futuro CLI hablan con primitivas (cadenas, números, mapas idioma → texto) y es el
 * caso de uso quien construye objetos de valor del dominio. Así la validación de negocio vive en un
 * único sitio y el borde HTTP solo comprueba forma con Zod (CIF-243).
 */

import type { Locale } from '@/domain/catalog/locale'

/** Límites de medida de una serie: el máximo es el que dispara el presupuesto manual. */
export interface MeasurementLimitsInput {
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
}

/**
 * Cambio parcial de un texto multi-idioma: ausente o `undefined` = no tocar; `null` = borrar esa
 * traducción; cadena no vacía = escribirla.
 */
export type LocalizedTextPatch = Readonly<Partial<Record<Locale, string | null>>>
