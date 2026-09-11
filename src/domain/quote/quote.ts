/**
 * Presupuesto emitido con el precio congelado (ADR-0003, punto 6).
 *
 * Guarda la tarifa aplicada, la configuración de entrada y el desglose completo. A partir de ahí,
 * publicar tarifas nuevas no altera ningún presupuesto ya emitido: el documento es inmutable desde
 * el punto de vista del precio.
 */

import { SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'
import type { PriceBreakdown, PriceLine, PriceLineKind } from '@/domain/pricing/price-breakdown'
import type {
  QuoteConfiguration,
  QuoteConfigurationSnapshot,
} from '@/domain/pricing/quote-configuration'
import { assertNonEmptyString, assertValidDate } from '@/domain/shared/assertions'
import { InvalidQuoteError, InvalidQuoteTransitionError } from '@/domain/shared/errors'
import type { LocalizedText } from '@/domain/catalog/catalog-text'

import { assertQuoteReference } from './quote-reference'

export const QUOTE_STATUSES = ['issued', 'accepted', 'rejected', 'expired'] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

const ALLOWED_QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  issued: ['accepted', 'rejected', 'expired'],
  accepted: [],
  rejected: [],
  expired: [],
}

/** Línea tal y como se persiste: importes en céntimos enteros (`bigint`). */
export interface FrozenQuoteLine {
  readonly code: string
  readonly kind: PriceLineKind
  readonly label: LocalizedText | null
  readonly units: number
  readonly unitAmount: bigint
  readonly amount: bigint
}

export function frozenLinesFromBreakdown(breakdown: PriceBreakdown): readonly FrozenQuoteLine[] {
  return breakdown.lines.map((line: PriceLine) => ({
    code: line.code,
    kind: line.kind,
    label: line.label,
    units: line.units,
    unitAmount: line.unitAmount.cents,
    amount: line.amount.cents,
  }))
}

export interface QuoteProps {
  readonly id: string
  readonly reference: string
  readonly status: QuoteStatus
  readonly seriesId: string
  readonly tariffVersionId: string
  readonly locale: Locale
  readonly configurationSnapshot: QuoteConfigurationSnapshot
  readonly breakdown: PriceBreakdown
  readonly validUntil: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class Quote {
  readonly id: string
  readonly reference: string
  readonly status: QuoteStatus
  readonly seriesId: string
  readonly tariffVersionId: string
  readonly locale: Locale
  readonly configurationSnapshot: QuoteConfigurationSnapshot
  readonly breakdown: PriceBreakdown
  readonly validUntil: Date | null
  readonly createdAt: Date
  readonly updatedAt: Date

  private constructor(props: QuoteProps) {
    this.id = props.id
    this.reference = props.reference
    this.status = props.status
    this.seriesId = props.seriesId
    this.tariffVersionId = props.tariffVersionId
    this.locale = props.locale
    this.configurationSnapshot = props.configurationSnapshot
    this.breakdown = props.breakdown
    this.validUntil = props.validUntil
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  static create(props: QuoteProps): Quote {
    assertNonEmptyString(props.id, 'id')
    assertQuoteReference(props.reference)
    assertNonEmptyString(props.seriesId, 'seriesId')
    assertNonEmptyString(props.tariffVersionId, 'tariffVersionId')
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    if (!SUPPORTED_LOCALES.includes(props.locale)) {
      throw new InvalidQuoteError(
        `locale debe ser uno de ${SUPPORTED_LOCALES.join(', ')}; recibido "${props.locale}"`,
      )
    }

    if (!QUOTE_STATUSES.includes(props.status)) {
      throw new InvalidQuoteError(`status de presupuesto desconocido: "${props.status}"`)
    }

    if (props.validUntil !== null) {
      assertValidDate(props.validUntil, 'validUntil')

      if (props.validUntil.getTime() <= props.createdAt.getTime()) {
        throw new InvalidQuoteError('validUntil debe ser posterior a la fecha de emisión')
      }
    }

    assertBreakdownConsistent(props.breakdown)

    return new Quote({ ...props })
  }

  /** Emite un presupuesto ya calculado: exige desglose con precio. */
  static issue(props: {
    readonly id: string
    readonly reference: string
    readonly configuration: QuoteConfiguration
    readonly tariffVersionId: string
    readonly locale: Locale
    readonly breakdown: PriceBreakdown
    readonly validUntil: Date | null
    readonly createdAt: Date
  }): Quote {
    return Quote.create({
      id: props.id,
      reference: props.reference,
      status: 'issued',
      seriesId: props.configuration.seriesId,
      tariffVersionId: props.tariffVersionId,
      locale: props.locale,
      configurationSnapshot: props.configuration.toSnapshot(),
      breakdown: props.breakdown,
      validUntil: props.validUntil,
      createdAt: props.createdAt,
      updatedAt: props.createdAt,
    })
  }

  get lines(): readonly FrozenQuoteLine[] {
    return frozenLinesFromBreakdown(this.breakdown)
  }

  get totalCents(): bigint {
    return this.breakdown.total.cents
  }

  isExpiredAt(instant: Date): boolean {
    return this.validUntil !== null && instant.getTime() >= this.validUntil.getTime()
  }

  withStatus(next: QuoteStatus, at: Date): Quote {
    if (!ALLOWED_QUOTE_TRANSITIONS[this.status].includes(next)) {
      throw new InvalidQuoteTransitionError(
        `El presupuesto "${this.reference}" no puede pasar de "${this.status}" a "${next}"`,
      )
    }

    assertValidDate(at, 'updatedAt')

    return new Quote({ ...this, status: next, updatedAt: at })
  }

  accept(at: Date): Quote {
    return this.withStatus('accepted', at)
  }

  reject(at: Date): Quote {
    return this.withStatus('rejected', at)
  }

  expire(at: Date): Quote {
    return this.withStatus('expired', at)
  }
}

function assertBreakdownConsistent(breakdown: PriceBreakdown): void {
  assertNonEmptyString(breakdown.currency, 'breakdown.currency')

  const expectedSubtotal = breakdown.lines.reduce((accumulated, line) => {
    if (line.kind === 'discount') {
      return accumulated - line.amount.cents
    }

    return accumulated + line.amount.cents
  }, 0n)

  if (expectedSubtotal !== breakdown.subtotal.cents) {
    throw new InvalidQuoteError(
      `El desglose no cuadra: las líneas suman ${expectedSubtotal} céntimos y el subtotal es ${breakdown.subtotal.cents}`,
    )
  }

  const expectedTotal = breakdown.subtotal.cents + breakdown.taxAmount.cents

  if (expectedTotal !== breakdown.total.cents) {
    throw new InvalidQuoteError(
      `El total (${breakdown.total.cents}) no es subtotal + IVA (${expectedTotal})`,
    )
  }

  if (breakdown.subtotal.cents < 0n) {
    throw new InvalidQuoteError('El subtotal de un presupuesto no puede ser negativo')
  }
}
