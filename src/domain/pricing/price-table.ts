/**
 * Tabla de precios de una versión de tarifa (ADR-0003).
 *
 * Una `TariffVersion` declara la estrategia y la vigencia; la `PriceTable` guarda los números con
 * los que el motor calcula: precio base (por m², fijo o por bandas) y los modificadores (acabado,
 * color, accesorios, instalación, portes, urgencia y descuentos).
 *
 * Igual que el resto del dominio, se construye por una factoría validada y no conoce Prisma.
 */

import type { LocalizedText } from '@/domain/catalog/catalog-text'
import type { Dimensions } from '@/domain/catalog/measurement'
import { PRICING_STRATEGIES, type PricingStrategy } from '@/domain/catalog/tariff-version'
import {
  assertIntegerInRange,
  assertNonEmptyString,
  normalizePercentage,
} from '@/domain/shared/assertions'
import { InvalidTariffVersionError } from '@/domain/shared/errors'
import { Money } from '@/domain/shared/money'

export const MODIFIER_KINDS = ['fixed', 'per_unit', 'percentage'] as const

export type ModifierKind = (typeof MODIFIER_KINDS)[number]

export const MODIFIER_TARGETS = [
  'finish',
  'color',
  'accessory',
  'installation',
  'shipping',
  'urgency',
  'discount',
] as const

export type ModifierTarget = (typeof MODIFIER_TARGETS)[number]

/** Objetivos que apuntan a un elemento de catálogo concreto (`targetId` obligatorio). */
const ITEM_TARGETS: readonly ModifierTarget[] = ['finish', 'color', 'accessory']

/** Objetivos sin `targetId`: se activan por la configuración, no por un elemento de catálogo. */
const FLAG_TARGETS: readonly ModifierTarget[] = ['installation', 'shipping', 'urgency']

export interface SizeBandProps {
  readonly id: string
  readonly label: LocalizedText | null
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
  readonly price: Money
}

export class SizeBand {
  readonly id: string
  readonly label: LocalizedText | null
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
  readonly price: Money

  private constructor(props: SizeBandProps) {
    this.id = props.id
    this.label = props.label
    this.minWidthMm = props.minWidthMm
    this.maxWidthMm = props.maxWidthMm
    this.minHeightMm = props.minHeightMm
    this.maxHeightMm = props.maxHeightMm
    this.price = props.price
  }

  static create(props: SizeBandProps): SizeBand {
    assertNonEmptyString(props.id, 'sizeBand.id')
    assertIntegerInRange(props.minWidthMm, 'sizeBand.minWidthMm', 1, 10_000)
    assertIntegerInRange(props.maxWidthMm, 'sizeBand.maxWidthMm', 1, 10_000)
    assertIntegerInRange(props.minHeightMm, 'sizeBand.minHeightMm', 1, 10_000)
    assertIntegerInRange(props.maxHeightMm, 'sizeBand.maxHeightMm', 1, 10_000)

    if (props.minWidthMm > props.maxWidthMm || props.minHeightMm > props.maxHeightMm) {
      throw new InvalidTariffVersionError(
        `La banda "${props.id}" tiene un mínimo mayor que su máximo`,
      )
    }

    if (props.price.isNegative()) {
      throw new InvalidTariffVersionError(`La banda "${props.id}" no puede tener precio negativo`)
    }

    return new SizeBand({ ...props })
  }

  contains(dimensions: Dimensions): boolean {
    return (
      dimensions.widthMm >= this.minWidthMm &&
      dimensions.widthMm <= this.maxWidthMm &&
      dimensions.heightMm >= this.minHeightMm &&
      dimensions.heightMm <= this.maxHeightMm
    )
  }

  overlaps(other: SizeBand): boolean {
    return (
      this.minWidthMm <= other.maxWidthMm &&
      other.minWidthMm <= this.maxWidthMm &&
      this.minHeightMm <= other.maxHeightMm &&
      other.minHeightMm <= this.maxHeightMm
    )
  }
}

export interface PriceModifierProps {
  readonly id: string
  readonly code: string
  readonly label: LocalizedText | null
  readonly kind: ModifierKind
  readonly target: ModifierTarget
  /**
   * Elemento de catálogo al que aplica (acabado, color o accesorio) o código de descuento para
   * `discount`. `null` en `discount` significa descuento automático.
   */
  readonly targetId: string | null
  /** Importe en céntimos para `fixed` y `per_unit`. */
  readonly amount: Money | null
  /** Porcentaje decimal exacto para `percentage`, p. ej. `"10"` o `"7.5"`. */
  readonly percentage: string | null
}

export class PriceModifier {
  readonly id: string
  readonly code: string
  readonly label: LocalizedText | null
  readonly kind: ModifierKind
  readonly target: ModifierTarget
  readonly targetId: string | null
  readonly amount: Money | null
  readonly percentage: string | null

  private constructor(props: PriceModifierProps) {
    this.id = props.id
    this.code = props.code
    this.label = props.label
    this.kind = props.kind
    this.target = props.target
    this.targetId = props.targetId
    this.amount = props.amount
    this.percentage = props.percentage
  }

  static create(props: PriceModifierProps): PriceModifier {
    let percentage = props.percentage

    assertNonEmptyString(props.id, 'modifier.id')
    assertNonEmptyString(props.code, 'modifier.code')

    if (!MODIFIER_KINDS.includes(props.kind)) {
      throw new InvalidTariffVersionError(
        `modifier.kind debe ser uno de ${MODIFIER_KINDS.join(', ')}; recibido "${props.kind}"`,
      )
    }

    if (!MODIFIER_TARGETS.includes(props.target)) {
      throw new InvalidTariffVersionError(
        `modifier.target debe ser uno de ${MODIFIER_TARGETS.join(', ')}; recibido "${props.target}"`,
      )
    }

    const needsTargetId = ITEM_TARGETS.includes(props.target)

    if (needsTargetId && (props.targetId === null || props.targetId.trim().length === 0)) {
      throw new InvalidTariffVersionError(
        `El modificador "${props.code}" apunta a "${props.target}" y necesita targetId`,
      )
    }

    if (FLAG_TARGETS.includes(props.target) && props.targetId !== null) {
      throw new InvalidTariffVersionError(
        `El modificador "${props.code}" no puede llevar targetId para "${props.target}"`,
      )
    }

    if (
      props.target === 'discount' &&
      props.targetId !== null &&
      props.targetId.trim().length === 0
    ) {
      throw new InvalidTariffVersionError(
        `El modificador "${props.code}" lleva un código de descuento vacío`,
      )
    }

    if (props.kind === 'percentage') {
      if (props.percentage === null) {
        throw new InvalidTariffVersionError(
          `El modificador "${props.code}" es porcentual y necesita percentage`,
        )
      }

      percentage = normalizePercentage(props.percentage, `modifier(${props.code}).percentage`)

      if (props.amount !== null) {
        throw new InvalidTariffVersionError(
          `El modificador "${props.code}" es porcentual y no puede llevar importe`,
        )
      }
    } else {
      if (props.amount === null) {
        throw new InvalidTariffVersionError(
          `El modificador "${props.code}" necesita importe en céntimos`,
        )
      }

      if (props.amount.isNegative()) {
        throw new InvalidTariffVersionError(
          `El modificador "${props.code}" no puede tener importe negativo; los descuentos son del tipo "discount"`,
        )
      }

      if (props.percentage !== null) {
        throw new InvalidTariffVersionError(
          `El modificador "${props.code}" lleva importe y no puede llevar porcentaje`,
        )
      }
    }

    return new PriceModifier({ ...props, percentage })
  }

  get isDiscount(): boolean {
    return this.target === 'discount'
  }
}

export interface PriceTableProps {
  readonly tariffVersionId: string
  readonly strategy: PricingStrategy
  readonly perSquareMetre: Money | null
  readonly fixedPrice: Money | null
  readonly bands: readonly SizeBand[]
  readonly modifiers: readonly PriceModifier[]
}

export class PriceTable {
  readonly tariffVersionId: string
  readonly strategy: PricingStrategy
  readonly perSquareMetre: Money | null
  readonly fixedPrice: Money | null
  readonly bands: readonly SizeBand[]
  readonly modifiers: readonly PriceModifier[]

  private constructor(props: PriceTableProps) {
    this.tariffVersionId = props.tariffVersionId
    this.strategy = props.strategy
    this.perSquareMetre = props.perSquareMetre
    this.fixedPrice = props.fixedPrice
    this.bands = props.bands
    this.modifiers = props.modifiers
  }

  static create(props: PriceTableProps): PriceTable {
    assertNonEmptyString(props.tariffVersionId, 'priceTable.tariffVersionId')

    if (!PRICING_STRATEGIES.includes(props.strategy)) {
      throw new InvalidTariffVersionError(
        `priceTable.strategy debe ser una de ${PRICING_STRATEGIES.join(', ')}; recibido "${props.strategy}"`,
      )
    }

    if (props.strategy === 'per_square_metre') {
      assertBasePrice(props.perSquareMetre, 'per_square_metre')
      assertNoBandsFor(props)
      assertNoFixedPrice(props)
    }

    if (props.strategy === 'fixed') {
      assertBasePrice(props.fixedPrice, 'fixed')
      assertNoBandsFor(props)
      assertNoPerSquareMetre(props)
    }

    if (props.strategy === 'size_bands') {
      if (props.bands.length === 0) {
        throw new InvalidTariffVersionError(
          'La estrategia "size_bands" necesita al menos una banda de medida',
        )
      }

      assertNoPerSquareMetre(props)
      assertNoFixedPrice(props)
      assertBandsDoNotOverlap(props.bands)
    }

    return new PriceTable({ ...props, bands: [...props.bands], modifiers: [...props.modifiers] })
  }

  /** Precio base para una medida, o `null` si ninguna banda la cubre. */
  basePriceFor(dimensions: Dimensions): Money | null {
    if (this.strategy === 'per_square_metre') {
      return (
        this.perSquareMetre?.multiplyByRatio(dimensions.areaInMilliSquareMetres(), 1_000n) ?? null
      )
    }

    if (this.strategy === 'fixed') {
      return this.fixedPrice
    }

    return this.bandFor(dimensions)?.price ?? null
  }

  bandFor(dimensions: Dimensions): SizeBand | null {
    return this.bands.find((band) => band.contains(dimensions)) ?? null
  }
}

function assertBasePrice(value: Money | null, strategy: PricingStrategy): void {
  if (value === null) {
    throw new InvalidTariffVersionError(
      `La estrategia "${strategy}" necesita el precio base en la tabla de tarifa`,
    )
  }

  if (value.isNegative()) {
    throw new InvalidTariffVersionError('El precio base no puede ser negativo')
  }
}

function assertNoBandsFor(props: PriceTableProps): void {
  if (props.bands.length > 0) {
    throw new InvalidTariffVersionError(
      `La estrategia "${props.strategy}" no admite bandas de medida`,
    )
  }
}

function assertNoFixedPrice(props: PriceTableProps): void {
  if (props.fixedPrice !== null) {
    throw new InvalidTariffVersionError(`La estrategia "${props.strategy}" no admite precio fijo`)
  }
}

function assertNoPerSquareMetre(props: PriceTableProps): void {
  if (props.perSquareMetre !== null) {
    throw new InvalidTariffVersionError(
      `La estrategia "${props.strategy}" no admite precio por metro cuadrado`,
    )
  }
}

function assertBandsDoNotOverlap(bands: readonly SizeBand[]): void {
  bands.forEach((band, index) => {
    for (const other of bands.slice(index + 1)) {
      if (band.overlaps(other)) {
        throw new InvalidTariffVersionError(
          `Las bandas "${band.id}" y "${other.id}" se solapan; una medida no puede tener dos precios`,
        )
      }
    }
  })
}
