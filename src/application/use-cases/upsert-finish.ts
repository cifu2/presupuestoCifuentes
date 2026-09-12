/**
 * Caso de uso: alta o actualización idempotente de un acabado por `code` (CIF-126a).
 *
 * Igual que `upsertSeries`, define el elemento entero: los textos que llegan sustituyen a los
 * guardados. El estado editorial se valida con las transiciones del dominio.
 */

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { Finish } from '@/domain/catalog/finish'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import type { LocalizedTextInput } from '@/domain/catalog/catalog-text'

import type { FinishWriteRepository } from '@/application/ports/catalog-write-repositories'
import type { Clock } from '@/application/ports/clock'
import type { IdGenerator } from '@/application/ports/id-generator'

import { toFinishWriteOutput, type FinishWriteOutput } from './catalog-write-output'

export interface UpsertFinishDeps {
  readonly finishWriteRepository: FinishWriteRepository
  readonly idGenerator: IdGenerator
  readonly clock: Clock
}

export interface UpsertFinishInput {
  readonly code: string
  readonly name: LocalizedTextInput
  readonly description?: LocalizedTextInput | null
  readonly sortOrder?: number
  readonly status?: CatalogStatus
}

export async function upsertFinish(
  deps: UpsertFinishDeps,
  input: UpsertFinishInput,
): Promise<FinishWriteOutput> {
  const existing = await deps.finishWriteRepository.findByCode(input.code)
  const now = deps.clock.now()

  const defined = Finish.create({
    id: existing?.id ?? deps.idGenerator.nextId(),
    code: input.code,
    name: LocalizedText.of(input.name),
    description:
      input.description === undefined
        ? (existing?.description ?? null)
        : input.description === null
          ? null
          : LocalizedText.of(input.description),
    status: existing?.status ?? 'draft',
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })

  const finish =
    input.status === undefined || input.status === defined.status
      ? defined
      : defined.withStatus(input.status, now)

  await deps.finishWriteRepository.save(finish)

  return toFinishWriteOutput(finish)
}
