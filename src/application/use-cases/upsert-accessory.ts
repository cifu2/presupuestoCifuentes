/**
 * Caso de uso: alta o actualización idempotente de un complemento por `code` (CIF-126a).
 */

import { Accessory, type AccessoryCategory } from '@/domain/catalog/accessory'
import { LocalizedText } from '@/domain/catalog/catalog-text'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { LocalizedTextInput } from '@/domain/catalog/catalog-text'

import type { AccessoryWriteRepository } from '@/application/ports/catalog-write-repositories'
import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'

import { toAccessoryWriteOutput, type AccessoryWriteOutput } from './catalog-write-output'

export interface UpsertAccessoryDeps {
  readonly accessoryWriteRepository: AccessoryWriteRepository
  readonly idGenerator: IdGenerator
  readonly clock: Clock
}

export interface UpsertAccessoryInput {
  readonly code: string
  readonly name: LocalizedTextInput
  readonly description?: LocalizedTextInput | null
  readonly category?: AccessoryCategory
  readonly sortOrder?: number
  readonly status?: CatalogStatus
}

export async function upsertAccessory(
  deps: UpsertAccessoryDeps,
  input: UpsertAccessoryInput,
): Promise<AccessoryWriteOutput> {
  const existing = await deps.accessoryWriteRepository.findByCode(input.code)
  const now = deps.clock.now()

  const defined = Accessory.create({
    id: existing?.id ?? deps.idGenerator.nextId(),
    code: input.code,
    name: LocalizedText.of(input.name),
    description:
      input.description === undefined
        ? (existing?.description ?? null)
        : input.description === null
          ? null
          : LocalizedText.of(input.description),
    category: input.category ?? existing?.category ?? 'other',
    status: existing?.status ?? 'draft',
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })

  const accessory =
    input.status === undefined || input.status === defined.status
      ? defined
      : defined.withStatus(input.status, now)

  await deps.accessoryWriteRepository.save(accessory)

  return toAccessoryWriteOutput(accessory)
}
