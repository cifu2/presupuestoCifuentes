import { describe, expect, it } from 'vitest'

import { InvalidValidityPeriodError } from '@/domain/shared/errors'

import { ValidityPeriod } from './validity-period'

const from = new Date('2026-01-01T00:00:00.000Z')
const until = new Date('2027-01-01T00:00:00.000Z')

describe('ValidityPeriod', () => {
  it('admite vigencia abierta y vigencia cerrada', () => {
    expect(ValidityPeriod.of(from).isOpenEnded()).toBe(true)
    expect(ValidityPeriod.of(from, until).isOpenEnded()).toBe(false)
  })

  it('exige que el fin sea posterior al inicio', () => {
    expect(() => ValidityPeriod.of(from, from)).toThrow(InvalidValidityPeriodError)
    expect(() => ValidityPeriod.of(from, new Date('2025-12-31T00:00:00.000Z'))).toThrow(
      InvalidValidityPeriodError,
    )
  })

  it('rechaza fechas inválidas', () => {
    expect(() => ValidityPeriod.of(new Date('no-es-fecha'))).toThrow(/fecha válida/i)
  })

  it('contiene el instante de inicio y excluye el de fin (intervalo semiabierto)', () => {
    const period = ValidityPeriod.of(from, until)

    expect(period.contains(new Date('2025-12-31T23:59:59.999Z'))).toBe(false)
    expect(period.contains(from)).toBe(true)
    expect(period.contains(new Date('2026-06-15T00:00:00.000Z'))).toBe(true)
    expect(period.contains(until)).toBe(false)
  })

  it('una vigencia abierta cubre cualquier instante posterior al inicio', () => {
    const period = ValidityPeriod.of(from)

    expect(period.contains(new Date('2030-01-01T00:00:00.000Z'))).toBe(true)
  })

  it('detecta solapes entre vigencias', () => {
    const first = ValidityPeriod.of(from, until)
    const overlapping = ValidityPeriod.of(new Date('2026-06-01T00:00:00.000Z'))
    const adjacent = ValidityPeriod.of(until, new Date('2028-01-01T00:00:00.000Z'))
    const before = ValidityPeriod.of(new Date('2025-01-01T00:00:00.000Z'), from)

    expect(first.overlaps(overlapping)).toBe(true)
    expect(overlapping.overlaps(first)).toBe(true)
    expect(first.overlaps(adjacent)).toBe(false)
    expect(first.overlaps(before)).toBe(false)
  })
})
