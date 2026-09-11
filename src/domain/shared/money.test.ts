import { describe, expect, it } from 'vitest'

import { Money } from './money'

describe('Money', () => {
  it('representa el cero', () => {
    expect(Money.zero().toString()).toBe('0.00')
    expect(Money.zero().isZero()).toBe(true)
  })

  it('convierte cadenas decimales a céntimos', () => {
    expect(Money.fromDecimalString('1234.56').cents).toBe(123456n)
    expect(Money.fromDecimalString('-3.005').cents).toBe(-301n)
    expect(Money.fromDecimalString('0').cents).toBe(0n)
    expect(Money.fromDecimalString('19.9').cents).toBe(1990n)
  })

  it('rechaza valores decimales inválidos', () => {
    expect(() => Money.fromDecimalString('12,50 EUR')).toThrow(TypeError)
    expect(() => Money.fromDecimalString('')).toThrow(TypeError)
    expect(() => Money.fromDecimalString('1.2.3')).toThrow(TypeError)
  })

  it('suma y resta sin perder precisión', () => {
    const a = Money.fromDecimalString('0.10')
    const b = Money.fromDecimalString('0.20')

    expect(a.add(b).toString()).toBe('0.30')
    expect(b.subtract(a).toString()).toBe('0.10')
    expect(a.subtract(b).toString()).toBe('-0.10')
  })

  it('redondea half-up en multiplicaciones por ratio', () => {
    const pricePerSquareMetre = Money.fromDecimalString('289.90')
    const areaInSquareMillimetres = 1_903_500n

    expect(
      pricePerSquareMetre.multiplyByRatio(areaInSquareMillimetres, 1_000_000n).toString(),
    ).toBe('551.82')
  })

  it('redondea half-up alejándose de cero', () => {
    expect(Money.fromDecimalString('0.005').toString()).toBe('0.01')
    expect(Money.fromDecimalString('-0.005').toString()).toBe('-0.01')
    expect(Money.fromDecimalString('0.004').toString()).toBe('0.00')
  })

  it('aplica porcentajes con precisión decimal', () => {
    expect(Money.fromDecimalString('100.00').percentage('21').toString()).toBe('21.00')
    expect(Money.fromDecimalString('99.99').percentage('21').toString()).toBe('21.00')
    expect(Money.fromDecimalString('200.00').percentage('7.5').toString()).toBe('15.00')
  })

  it('rechaza denominadores no positivos con un error explícito', () => {
    expect(() => Money.fromCents(100n).multiplyByRatio(1n, 0n)).toThrow(RangeError)
    expect(() => Money.fromCents(100n).multiplyByRatio(1n, -2n)).toThrow(RangeError)
  })

  it('compara importes y serializa a JSON como cadena', () => {
    const value = Money.fromDecimalString('49.95')

    expect(value.equals(Money.fromCents(4995n))).toBe(true)
    expect(value.equals(Money.fromCents(4996n))).toBe(false)
    expect(value.isNegative()).toBe(false)
    expect(JSON.stringify({ total: value })).toBe('{"total":"49.95"}')
  })
})
