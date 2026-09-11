import { describe, expect, it } from 'vitest'

import {
  AmbiguousTariffError,
  DomainError,
  InvalidCatalogTextError,
  InvalidCatalogTransitionError,
  InvalidCatalogValueError,
  InvalidManualQuoteRequestError,
  InvalidManualQuoteTransitionError,
  InvalidMeasurementError,
  InvalidSeriesTransitionError,
  InvalidSizeRangeError,
  InvalidTariffVersionError,
  InvalidValidityPeriodError,
  InvalidValueError,
  UnsupportedLocaleError,
  isDomainError,
} from './errors'

describe('errores de dominio', () => {
  const cases: readonly (readonly [DomainError, string])[] = [
    [new InvalidValueError('valor'), 'InvalidValueError'],
    [new InvalidMeasurementError('medida'), 'InvalidMeasurementError'],
    [new InvalidSizeRangeError('rango'), 'InvalidSizeRangeError'],
    [new InvalidCatalogValueError('catálogo'), 'InvalidCatalogValueError'],
    [new InvalidCatalogTextError('texto'), 'InvalidCatalogTextError'],
    [new UnsupportedLocaleError('idioma'), 'UnsupportedLocaleError'],
    [new InvalidValidityPeriodError('vigencia'), 'InvalidValidityPeriodError'],
    [new InvalidTariffVersionError('tarifa'), 'InvalidTariffVersionError'],
    [new AmbiguousTariffError('ambigua'), 'AmbiguousTariffError'],
    [new InvalidSeriesTransitionError('serie'), 'InvalidSeriesTransitionError'],
    [new InvalidCatalogTransitionError('catálogo'), 'InvalidCatalogTransitionError'],
    [new InvalidManualQuoteRequestError('solicitud'), 'InvalidManualQuoteRequestError'],
    [new InvalidManualQuoteTransitionError('transición'), 'InvalidManualQuoteTransitionError'],
  ]

  it('expone un código estable y el nombre de la clase en cada subtipo', () => {
    for (const [error, name] of cases) {
      expect(error).toBeInstanceOf(DomainError)
      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe(name)
      expect(error.message.length).toBeGreaterThan(0)
      expect(error.code).toMatch(/^[A-Z_]+$/)
    }
  })

  it('cada subtipo declara su propio código', () => {
    expect(new InvalidValueError('x').code).toBe('INVALID_VALUE')
    expect(new InvalidMeasurementError('x').code).toBe('INVALID_MEASUREMENT')
    expect(new InvalidSizeRangeError('x').code).toBe('INVALID_SIZE_RANGE')
    expect(new InvalidCatalogValueError('x').code).toBe('INVALID_CATALOG_VALUE')
    expect(new InvalidCatalogTextError('x').code).toBe('INVALID_CATALOG_TEXT')
    expect(new UnsupportedLocaleError('x').code).toBe('UNSUPPORTED_LOCALE')
    expect(new InvalidValidityPeriodError('x').code).toBe('INVALID_VALIDITY_PERIOD')
    expect(new InvalidTariffVersionError('x').code).toBe('INVALID_TARIFF')
    expect(new AmbiguousTariffError('x').code).toBe('AMBIGUOUS_TARIFF')
    expect(new InvalidSeriesTransitionError('x').code).toBe('INVALID_SERIES_TRANSITION')
    expect(new InvalidCatalogTransitionError('x').code).toBe('INVALID_CATALOG_TRANSITION')
    expect(new InvalidManualQuoteRequestError('x').code).toBe('INVALID_MANUAL_QUOTE_REQUEST')
    expect(new InvalidManualQuoteTransitionError('x').code).toBe('INVALID_MANUAL_QUOTE_TRANSITION')
  })

  it('reconoce solo los errores de dominio', () => {
    expect(isDomainError(new InvalidValueError('x'))).toBe(true)
    expect(isDomainError(new DomainError('INVALID_VALUE', 'x'))).toBe(true)
    expect(isDomainError(new Error('x'))).toBe(false)
    expect(isDomainError('x')).toBe(false)
  })
})
