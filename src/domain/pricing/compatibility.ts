/**
 * Reglas de compatibilidad serie ↔ configuración (ADR-0003).
 *
 * Si el acabado, el color o un accesorio no están cubiertos por la serie, no se inventa precio:
 * el resultado es presupuesto manual (`uncovered_configuration`).
 */

import type { DoorSeries } from '@/domain/catalog/series'
import type { ManualQuoteReason } from '@/domain/catalog/manual-quote-reason'

import type { QuoteConfiguration } from './quote-configuration'

export interface CompatibilityFailure {
  readonly reason: ManualQuoteReason
  readonly detail: string
}

export interface CompatibilityInput {
  readonly series: DoorSeries
  readonly configuration: QuoteConfiguration
  /** Colores publicados del acabado elegido; `null` si no se pudo comprobar. */
  readonly allowedColorIds: readonly string[] | null
}

/** Devuelve el motivo por el que la configuración no está cubierta, o `null` si lo está. */
export function assessConfigurationCompatibility(
  input: CompatibilityInput,
): CompatibilityFailure | null {
  const { series, configuration, allowedColorIds } = input

  if (configuration.finishId !== null && !series.allowsFinish(configuration.finishId)) {
    return {
      reason: 'uncovered_configuration',
      detail: `El acabado "${configuration.finishId}" no está disponible para la serie "${series.code}"`,
    }
  }

  if (
    configuration.colorId !== null &&
    allowedColorIds !== null &&
    !allowedColorIds.includes(configuration.colorId)
  ) {
    return {
      reason: 'uncovered_configuration',
      detail: `El color "${configuration.colorId}" no pertenece al acabado elegido`,
    }
  }

  const unsupportedAccessory = configuration.accessoryIds.find(
    (accessoryId) => !series.allowsAccessory(accessoryId),
  )

  if (unsupportedAccessory !== undefined) {
    return {
      reason: 'uncovered_configuration',
      detail: `El accesorio "${unsupportedAccessory}" no está disponible para la serie "${series.code}"`,
    }
  }

  return null
}
