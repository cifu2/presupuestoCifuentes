/**
 * Objeto de valor `Money`.
 *
 * Reglas de la casa (ver docs/coding-conventions.md):
 * - El dinero se representa SIEMPRE en céntimos enteros (`bigint`), nunca en `number`.
 * - Los redondeos son "half-up" (alejándose de cero) y explícitos en la operación.
 * - La moneda del MVP es EUR; se mantiene como constante para dejar el tipo abierto
 *   a multi-moneda sin cambiar la representación.
 */

export const BASE_CURRENCY = 'EUR' as const

const CENTS_PER_UNIT = 100n

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError('Money: el denominador debe ser mayor que cero')
  }

  const negative = numerator < 0n
  const absolute = negative ? -numerator : numerator
  const rounded = (2n * absolute + denominator) / (2n * denominator)

  return negative ? -rounded : rounded
}

export class Money {
  readonly cents: bigint

  private constructor(cents: bigint) {
    this.cents = cents
  }

  static zero(): Money {
    return new Money(0n)
  }

  static fromCents(cents: bigint): Money {
    return new Money(cents)
  }

  /** Acepta notación decimal con punto, p. ej. `"1234.56"` o `"-3.005"`. */
  static fromDecimalString(value: string): Money {
    const normalized = value.trim()

    if (!DECIMAL_PATTERN.test(normalized)) {
      throw new TypeError(`Money: valor decimal inválido "${value}"`)
    }

    const [integerPart = '0', fractionPart = ''] = normalized.split('.')
    const isNegative = integerPart.startsWith('-')
    const digits = (isNegative ? integerPart.slice(1) : integerPart) + fractionPart
    const scale = BigInt(fractionPart.length)
    const unscaled = BigInt(digits.length > 0 ? digits : '0')
    const cents = divRoundHalfUp(unscaled * CENTS_PER_UNIT, 10n ** scale)

    return new Money(isNegative ? -cents : cents)
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents)
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents)
  }

  /** Multiplica por una fracción exacta, p. ej. `multiplyByRatio(areaMM2, 1_000_000n)`. */
  multiplyByRatio(numerator: bigint, denominator: bigint): Money {
    return new Money(divRoundHalfUp(this.cents * numerator, denominator))
  }

  /** Aplica un porcentaje expresado en tanto por ciento, p. ej. `"21"` o `"21.5"`. */
  percentage(ratePercent: string): Money {
    const rateInCents = Money.fromDecimalString(ratePercent).cents

    return this.multiplyByRatio(rateInCents, 10_000n)
  }

  isZero(): boolean {
    return this.cents === 0n
  }

  isNegative(): boolean {
    return this.cents < 0n
  }

  equals(other: Money): boolean {
    return this.cents === other.cents
  }

  /** Representación decimal canónica, p. ej. `"1234.56"`. */
  toString(): string {
    const negative = this.cents < 0n
    const absolute = negative ? -this.cents : this.cents
    const units = absolute / CENTS_PER_UNIT
    const cents = (absolute % CENTS_PER_UNIT).toString().padStart(2, '0')

    return `${negative ? '-' : ''}${units}.${cents}`
  }

  toJSON(): string {
    return this.toString()
  }
}
