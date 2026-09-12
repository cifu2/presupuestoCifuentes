import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { SUPPORTED_LOCALES } from '@/domain/catalog/locale'
import {
  MANUAL_QUOTE_DETAIL_KINDS,
  manualQuoteReasonOf,
  type ManualQuoteDetail,
} from '@/domain/pricing/manual-quote-detail'

import {
  ALL_MANUAL_QUOTE_DETAILS_TRANSLATED,
  MANUAL_QUOTE_REASONS_NAMESPACE,
  TRANSLATED_MANUAL_QUOTE_DETAIL_KINDS,
  formatManualQuoteDetail,
  manualQuoteDetailMessageKey,
} from './manual-quote-reasons'

const messagesDirectory = fileURLToPath(new URL('../../messages', import.meta.url))

const details: readonly ManualQuoteDetail[] = [
  {
    kind: 'size_above_series_max',
    widthMm: 1500,
    heightMm: 2100,
    seriesCode: 'CI-100',
    maxWidthMm: 1000,
    maxHeightMm: 2200,
  },
  { kind: 'finish_not_allowed', finishId: 'finish-oro', seriesCode: 'CI-100' },
  { kind: 'color_not_allowed', colorId: 'color-ral-9010' },
  { kind: 'accessory_not_allowed', accessoryId: 'accessory-barra', seriesCode: 'CI-100' },
  { kind: 'no_tariff_in_force', seriesCode: 'CI-400' },
  { kind: 'tariff_without_prices', seriesCode: 'CI-400' },
  { kind: 'no_size_band_covers_measurement', widthMm: 900, heightMm: 2500 },
  { kind: 'customer_requested' },
]

function messageAt(locale: string, path: string): string | undefined {
  const messages = JSON.parse(
    readFileSync(join(messagesDirectory, `${locale}.json`), 'utf8'),
  ) as Record<string, Record<string, string>>

  const [namespace, key] = path.split('.')

  return namespace === undefined || key === undefined ? undefined : messages[namespace]?.[key]
}

describe('mensajes de presupuesto manual', () => {
  it('traduce todos los hechos del dominio', () => {
    expect(ALL_MANUAL_QUOTE_DETAILS_TRANSLATED).toBe(true)
    expect([...TRANSLATED_MANUAL_QUOTE_DETAIL_KINDS].sort()).toEqual(
      [...MANUAL_QUOTE_DETAIL_KINDS].sort(),
    )
    expect(new Set(TRANSLATED_MANUAL_QUOTE_DETAIL_KINDS).size).toBe(
      TRANSLATED_MANUAL_QUOTE_DETAIL_KINDS.length,
    )
  })

  it('tiene una clave no vacía en cada idioma soportado', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const kind of MANUAL_QUOTE_DETAIL_KINDS) {
        expect(
          messageAt(locale, manualQuoteDetailMessageKey(kind))?.trim(),
          `${locale}:${kind}`,
        ).toBeTruthy()
      }
    }
  })

  it('deriva el motivo estable de la API a partir del hecho', () => {
    expect(
      manualQuoteReasonOf({
        kind: 'size_above_series_max',
        widthMm: 1,
        heightMm: 1,
        seriesCode: 'X',
        maxWidthMm: 2,
        maxHeightMm: 2,
      }),
    ).toBe('size_exceeds_series_max')
    expect(manualQuoteReasonOf({ kind: 'no_tariff_in_force', seriesCode: 'X' })).toBe(
      'no_tariff_in_force',
    )
    expect(manualQuoteReasonOf({ kind: 'customer_requested' })).toBe('customer_requested')
  })

  it('compone el detalle en español con los parámetros del hecho', () => {
    const aboveSeriesMax: ManualQuoteDetail = {
      kind: 'size_above_series_max',
      widthMm: 1500,
      heightMm: 2100,
      seriesCode: 'CI-100',
      maxWidthMm: 1000,
      maxHeightMm: 2200,
    }

    expect(formatManualQuoteDetail(aboveSeriesMax, 'es')).toBe(
      'La medida 1500×2100 mm supera el máximo de la serie "CI-100" (1000×2200 mm)',
    )
  })

  it('compone el detalle en inglés con los parámetros del hecho', () => {
    const aboveSeriesMax: ManualQuoteDetail = {
      kind: 'size_above_series_max',
      widthMm: 1500,
      heightMm: 2100,
      seriesCode: 'CI-100',
      maxWidthMm: 1000,
      maxHeightMm: 2200,
    }

    expect(formatManualQuoteDetail(aboveSeriesMax, 'en')).toBe(
      'The measurement 1500×2100 mm exceeds the maximum size of the "CI-100" series (1000×2200 mm)',
    )
  })

  it('traduce cada hecho en ambos idiomas sin dejar marcadores sin sustituir', () => {
    for (const detail of details) {
      for (const locale of SUPPORTED_LOCALES) {
        const message = formatManualQuoteDetail(detail, locale)

        expect(message, `${locale}:${detail.kind}`).not.toMatch(/\{[a-zA-Z]/)
      }
    }
  })

  it('expone el espacio de nombres que consume el cliente', () => {
    expect(MANUAL_QUOTE_REASONS_NAMESPACE).toBe('ManualQuoteReasons')
    expect(manualQuoteDetailMessageKey('no_tariff_in_force')).toBe(
      'ManualQuoteReasons.no_tariff_in_force',
    )
  })
})
