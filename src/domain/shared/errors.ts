/**
 * Errores de dominio tipados.
 *
 * Todo error de negocio lleva un `code` estable que el borde HTTP traduce a un código y un
 * mensaje traducible (ver docs/coding-conventions.md, sección "Errores"). El dominio no conoce
 * HTTP: solo declara el motivo.
 */

export type DomainErrorCode =
  | 'INVALID_VALUE'
  | 'INVALID_MEASUREMENT'
  | 'INVALID_SIZE_RANGE'
  | 'INVALID_CATALOG_VALUE'
  | 'INVALID_CATALOG_TEXT'
  | 'UNSUPPORTED_LOCALE'
  | 'INVALID_VALIDITY_PERIOD'
  | 'INVALID_TARIFF'
  | 'AMBIGUOUS_TARIFF'
  | 'INVALID_SERIES_TRANSITION'
  | 'INVALID_CATALOG_TRANSITION'
  | 'INVALID_MANUAL_QUOTE_REQUEST'
  | 'INVALID_MANUAL_QUOTE_TRANSITION'

export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = new.target.name
    this.code = code
  }
}

/** Valor de entrada inválido en un objeto de valor o entidad del dominio. */
export class InvalidValueError extends DomainError {
  constructor(message: string) {
    super('INVALID_VALUE', message)
  }
}

/** Medida (ancho/alto) fuera de los límites representables. */
export class InvalidMeasurementError extends DomainError {
  constructor(message: string) {
    super('INVALID_MEASUREMENT', message)
  }
}

/** Rango de medidas incoherente (mínimo mayor que máximo, etc.). */
export class InvalidSizeRangeError extends DomainError {
  constructor(message: string) {
    super('INVALID_SIZE_RANGE', message)
  }
}

/** Código, slug o dato identificativo de catálogo con formato inválido. */
export class InvalidCatalogValueError extends DomainError {
  constructor(message: string) {
    super('INVALID_CATALOG_VALUE', message)
  }
}

/** Texto de catálogo sin el idioma por defecto o con contenido vacío. */
export class InvalidCatalogTextError extends DomainError {
  constructor(message: string) {
    super('INVALID_CATALOG_TEXT', message)
  }
}

/** Idioma no soportado por el catálogo. */
export class UnsupportedLocaleError extends DomainError {
  constructor(message: string) {
    super('UNSUPPORTED_LOCALE', message)
  }
}

/** Periodo de vigencia incoherente (fin anterior o igual al inicio). */
export class InvalidValidityPeriodError extends DomainError {
  constructor(message: string) {
    super('INVALID_VALIDITY_PERIOD', message)
  }
}

/** Versión de tarifa con datos inválidos. */
export class InvalidTariffVersionError extends DomainError {
  constructor(message: string) {
    super('INVALID_TARIFF', message)
  }
}

/** Más de una versión de tarifa vigente para la misma serie. */
export class AmbiguousTariffError extends DomainError {
  constructor(message: string) {
    super('AMBIGUOUS_TARIFF', message)
  }
}

/** Transición de estado no permitida en una serie. */
export class InvalidSeriesTransitionError extends DomainError {
  constructor(message: string) {
    super('INVALID_SERIES_TRANSITION', message)
  }
}

/** Transición de estado no permitida en un elemento de catálogo. */
export class InvalidCatalogTransitionError extends DomainError {
  constructor(message: string) {
    super('INVALID_CATALOG_TRANSITION', message)
  }
}

/** Solicitud de presupuesto manual incompleta o mal formada. */
export class InvalidManualQuoteRequestError extends DomainError {
  constructor(message: string) {
    super('INVALID_MANUAL_QUOTE_REQUEST', message)
  }
}

/** Transición de estado no permitida en una solicitud de presupuesto manual. */
export class InvalidManualQuoteTransitionError extends DomainError {
  constructor(message: string) {
    super('INVALID_MANUAL_QUOTE_TRANSITION', message)
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
