/**
 * Caso de uso: alta o actualización idempotente de un color por `(finishId, code)` (CIF-126a).
 *
 * El color pertenece a un acabado: si el acabado no existe, `ResourceNotFoundError`. La clave del
 * `@@unique` es la pareja acabado + código, así que el mismo código puede repetirse en acabados
 * distintos.
 */

import { Color } from '@/domain/catalog/color'
import { LocalizedText } from '@/domain/catalog/catalog-text'
import { ResourceNotFoundError } from '@/domain/shared/errors'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { LocalizedTextInput } from '@/domain/catalog/catalog-text'

import type { ColorWriteRepository } from '@/application/ports/catalog-write-repositories'
import type { FinishRepository } from '@/application/ports/catalog-item-repositories'
import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'

import { toColorWriteOutput, type ColorWriteOutput } from './catalog-write-output'

export interface UpsertColorDeps {
  readonly finishRepository: FinishRepository
  readonly colorWriteRepository: ColorWriteRepository
  readonly idGenerator: IdGenerator
  readonly clock: Clock
}

export interface UpsertColorInput {
  readonly finishId: string
  readonly code: string
  readonly name: LocalizedTextInput
  readonly hex?: string | null
  readonly sortOrder?: number
  readonly status?: CatalogStatus
}

export async function upsertColor(
  deps: UpsertColorDeps,
  input: UpsertColorInput,
): Promise<ColorWriteOutput> {
  const finish = await deps.finishRepository.findById(input.finishId)

  if (finish === null) {
    throw new ResourceNotFoundError(`No existe el acabado "${input.finishId}"`)
  }

  const existing = await deps.colorWriteRepository.findByFinishIdAndCode(input.finishId, input.code)
  const now = deps.clock.now()

  const defined = Color.create({
    id: existing?.id ?? deps.idGenerator.nextId(),
    finishId: input.finishId,
    code: input.code,
    name: LocalizedText.of(input.name),
    hex: input.hex === undefined ? (existing?.hex ?? null) : input.hex,
    status: existing?.status ?? 'draft',
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })

  const color =
    input.status === undefined || input.status === defined.status
      ? defined
      : defined.withStatus(input.status, now)

  await deps.colorWriteRepository.save(color)

  return toColorWriteOutput(color)
}
