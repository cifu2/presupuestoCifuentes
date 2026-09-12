/**
 * Caso de uso: editar la tabla de precios de una versión de tarifa en borrador (CIF-126a, ADR-0003).
 *
 * La edición reemplaza la tabla **completa** de la versión (precio base, bandas y modificadores) en
 * una sola escritura, así que es idempotente por contenido: reenviar la misma tabla deja las mismas
 * filas. El panel puede conservar los `id` de las filas que ya existían y omite los de las nuevas,
 * que se generan aquí.
 *
 * Una versión publicada es inmutable: el precio de un presupuesto emitido está congelado en su
 * instantánea, así que editar la tarifa publicada en caliente cambiaría precios ya comunicados
 * (`TariffVersionNotEditableError`). La estrategia de cálculo la fija la versión (ADR-0003); este
 * caso de uso solo escribe sus números.
 */

import { Money } from '@/domain/shared/money'
import { PriceModifier, PriceTable, SizeBand } from '@/domain/pricing/price-table'
import { ResourceNotFoundError, TariffVersionNotEditableError } from '@/domain/shared/errors'
import { LocalizedText, type LocalizedTextInput } from '@/domain/catalog/catalog-text'
import type { ModifierKind, ModifierTarget } from '@/domain/pricing/price-table'

import type { IdGenerator } from '@/application/ports/id-generator'
import type { TariffVersionRepository } from '@/application/ports/tariff-version-repository'

import { toPriceTableOutput, type PriceTableOutput } from './catalog-write-output'

export interface PriceBandInput {
  /** Si falta, se genera uno: una fila nueva del panel todavía no tiene id. */
  readonly id?: string
  readonly label?: LocalizedTextInput | null
  readonly minWidthMm: number
  readonly maxWidthMm: number
  readonly minHeightMm: number
  readonly maxHeightMm: number
  /** Precio en euros como cadena decimal exacta (`"450.00"`). */
  readonly price: string
}

export interface PriceModifierInput {
  readonly id?: string
  readonly code: string
  readonly label?: LocalizedTextInput | null
  readonly kind: ModifierKind
  readonly target: ModifierTarget
  readonly targetId?: string | null
  /** Importe en euros como cadena decimal exacta; `null` en los modificadores porcentuales. */
  readonly amount?: string | null
  readonly percentage?: string | null
}

export interface UpdateTariffPriceDeps {
  readonly tariffVersionRepository: TariffVersionRepository
  readonly idGenerator: IdGenerator
}

export interface UpdateTariffPriceInput {
  readonly tariffVersionId: string
  readonly perSquareMetre?: string | null
  readonly fixedPrice?: string | null
  readonly bands?: readonly PriceBandInput[]
  readonly modifiers?: readonly PriceModifierInput[]
}

export async function updateTariffPrice(
  deps: UpdateTariffPriceDeps,
  input: UpdateTariffPriceInput,
): Promise<PriceTableOutput> {
  const version = await deps.tariffVersionRepository.findById(input.tariffVersionId)

  if (version === null) {
    throw new ResourceNotFoundError(`No existe la versión de tarifa "${input.tariffVersionId}"`)
  }

  if (version.status !== 'draft') {
    throw new TariffVersionNotEditableError(
      `La versión ${version.versionNumber} de la serie "${version.seriesId}" está "${version.status}": solo se editan los precios en borrador`,
    )
  }

  const table = PriceTable.create({
    tariffVersionId: version.id,
    strategy: version.strategy,
    perSquareMetre: toMoney(input.perSquareMetre),
    fixedPrice: toMoney(input.fixedPrice),
    bands: (input.bands ?? []).map((band) =>
      SizeBand.create({
        id: band.id ?? deps.idGenerator.nextId(),
        label: band.label === undefined || band.label === null ? null : toText(band.label),
        minWidthMm: band.minWidthMm,
        maxWidthMm: band.maxWidthMm,
        minHeightMm: band.minHeightMm,
        maxHeightMm: band.maxHeightMm,
        price: Money.fromDecimalString(band.price),
      }),
    ),
    modifiers: (input.modifiers ?? []).map((modifier) =>
      PriceModifier.create({
        id: modifier.id ?? deps.idGenerator.nextId(),
        code: modifier.code,
        label:
          modifier.label === undefined || modifier.label === null ? null : toText(modifier.label),
        kind: modifier.kind,
        target: modifier.target,
        targetId: modifier.targetId ?? null,
        amount: toMoney(modifier.amount ?? null),
        percentage: modifier.percentage ?? null,
      }),
    ),
  })

  await deps.tariffVersionRepository.savePriceTable(table)

  return toPriceTableOutput(table, version.currency)
}

function toText(input: LocalizedTextInput): LocalizedText {
  return LocalizedText.of(input)
}

function toMoney(value: string | null | undefined): Money | null {
  return value === undefined || value === null ? null : Money.fromDecimalString(value)
}
