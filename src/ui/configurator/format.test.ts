import { describe, expect, it } from 'vitest'

import { formatDate, formatMoney, formatNumber } from './format'

describe('formato de importes', () => {
  it('respeta la agrupación y el separador decimal del idioma', () => {
    // En español la agrupación de millares de CLDR solo aparece a partir de cinco cifras
    // (`minimumGroupingDigits`); por debajo, el número va sin separadores.
    expect(formatMoney('1234.5', 'EUR', 'es')).toBe('1234,50\u00a0€')
    expect(formatMoney('12345.5', 'EUR', 'es')).toBe('12.345,50\u00a0€')
    expect(formatMoney('1234.5', 'EUR', 'en')).toBe('€1,234.50')
    expect(formatMoney('718.20', 'EUR', 'en')).toBe('€718.20')
  })

  it('no duplica la magnitud del importe en los idiomas que trocean el entero (CIF-345)', () => {
    // Con `en`, el patrón de `formatToParts` parte el entero en cada límite de agrupación
    // (`1`, `,`, `234`); emitir el importe agrupado en cada parte duplicaba la cifra.
    expect(formatMoney('718.20', 'EUR', 'en')).toBe('€718.20')
    expect(formatMoney('45.00', 'EUR', 'en')).toBe('€45.00')
    expect(formatMoney('763.20', 'EUR', 'en')).toBe('€763.20')
    expect(formatMoney('1234567.89', 'EUR', 'en')).toBe('€1,234,567.89')
  })

  it('no pierde precisión con importes grandes: nunca pasa por coma flotante', () => {
    const formatted = formatMoney('12345678901234.56', 'EUR', 'es')

    expect(formatted).toContain('12.345.678.901.234,56')
  })

  it('mantiene el signo de los descuentos', () => {
    expect(formatMoney('-0.5', 'EUR', 'es')).toBe('-0,50\u00a0€')
    expect(formatMoney('-1234.5', 'EUR', 'en')).toBe('-€1,234.50')
  })

  it('completa a dos decimales y no redondea lo que ya viene redondeado', () => {
    expect(formatMoney('1000', 'EUR', 'es')).toContain('1000,00')
    expect(formatMoney('914.76', 'EUR', 'es')).toContain('914,76')
  })

  it('cae a un formato neutro si la moneda no es válida', () => {
    expect(formatMoney('10.5', 'NO-EXISTE', 'es')).toBe('10,50 NO-EXISTE')
  })
})

describe('formato de números y fechas', () => {
  it('formatea la tasa de IVA con el idioma activo', () => {
    expect(formatNumber(21, 'es')).toBe('21')
    expect(formatNumber('21', 'en')).toBe('21')
  })

  it('formatea fechas ISO y devuelve null si no son válidas', () => {
    expect(formatDate('2026-09-12T00:00:00.000Z', 'es')).toContain('2026')
    expect(formatDate('no-es-una-fecha', 'es')).toBeNull()
  })
})
