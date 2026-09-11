/**
 * Reglas de compatibilidad serie ↔ configuración (ADR-0003).
 *
 * Si el acabado, el color o un accesorio no están cubiertos por la serie, no se inventa precio:
 * el resultado es presupuesto manual (`uncovered_configuration`). El dominio devuelve el **hecho**
 * (`ManualQuoteDetail`), sin texto de usuario: el mensaje se compone en el borde (ADR-0005).
 */

import type { DoorSeries } from '@/domain/catalog/series'

import type { ManualQuoteDetail } from './manual-quote-detail'
import type { QuoteConfiguration } from './quote-configuration'

export interface CompatibilityFailure {
  readonly detail: ManualQuoteDetail
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
      detail: {
        kind: 'finish_not_allowed',
        finishId: configuration.finishId,
        seriesCode: series.code,
      },
    }
  }

  if (
    configuration.colorId !== null &&
    allowedColorIds !== null &&
    !allowedColorIds.includes(configuration.colorId)
  ) {
    return { detail: { kind: 'color_not_allowed', colorId: configuration.colorId } }
  }

  const unsupportedAccessory = configuration.accessoryIds.find(
    (accessoryId) => !series.allowsAccessory(accessoryId),
  )

  if (unsupportedAccessory !== undefined) {
    return {
      detail: {
        kind: 'accessory_not_allowed',
        accessoryId: unsupportedAccessory,
        seriesCode: series.code,
      },
    }
  }

  return null
}
