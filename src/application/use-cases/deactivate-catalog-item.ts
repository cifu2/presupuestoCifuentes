/**
 * Caso de uso: desactivar (archivar) un acabado, un color o un complemento (CIF-126a).
 *
 * Desactivar nunca borra. La guarda es no dejar referencias colgando desde el catálogo vivo
 * (`ItemInUseError`): un acabado o un complemento que una serie no archivada sigue permitiendo, y un
 * acabado que todavía tiene colores vivos. Un color no tiene guarda: es una opción opcional dentro de
 * su acabado y archivarlo solo lo retira del configurador.
 *
 * Es idempotente: desactivar algo ya archivado no escribe.
 */

import { ItemInUseError, ResourceNotFoundError } from '@/domain/shared/errors'
import type { Accessory } from '@/domain/catalog/accessory'
import type { Color } from '@/domain/catalog/color'
import type { Finish } from '@/domain/catalog/finish'

import type {
  AccessoryWriteRepository,
  CatalogUsageReader,
  ColorWriteRepository,
  FinishWriteRepository,
} from '@/application/ports/catalog-write-repositories'
import type { Clock } from '@/application/ports/clock'
import type {
  AccessoryRepository,
  ColorRepository,
  FinishRepository,
} from '@/application/ports/catalog-item-repositories'

import {
  toAccessoryWriteOutput,
  toColorWriteOutput,
  toFinishWriteOutput,
  type AccessoryWriteOutput,
  type ColorWriteOutput,
  type FinishWriteOutput,
} from './catalog-write-output'

export type CatalogItemEntity = 'finish' | 'color' | 'accessory'

export interface DeactivateCatalogItemDeps {
  readonly finishRepository: FinishRepository
  readonly colorRepository: ColorRepository
  readonly accessoryRepository: AccessoryRepository
  readonly finishWriteRepository: FinishWriteRepository
  readonly colorWriteRepository: ColorWriteRepository
  readonly accessoryWriteRepository: AccessoryWriteRepository
  readonly catalogUsageReader: CatalogUsageReader
  readonly clock: Clock
}

export interface DeactivateCatalogItemInput {
  readonly entity: CatalogItemEntity
  readonly id: string
}

export type DeactivatedCatalogItemOutput =
  | { readonly entity: 'finish'; readonly item: FinishWriteOutput }
  | { readonly entity: 'color'; readonly item: ColorWriteOutput }
  | { readonly entity: 'accessory'; readonly item: AccessoryWriteOutput }

export async function deactivateCatalogItem(
  deps: DeactivateCatalogItemDeps,
  input: DeactivateCatalogItemInput,
): Promise<DeactivatedCatalogItemOutput> {
  if (input.entity === 'finish') {
    return { entity: 'finish', item: toFinishWriteOutput(await deactivateFinish(deps, input.id)) }
  }

  if (input.entity === 'color') {
    return { entity: 'color', item: toColorWriteOutput(await deactivateColor(deps, input.id)) }
  }

  return {
    entity: 'accessory',
    item: toAccessoryWriteOutput(await deactivateAccessory(deps, input.id)),
  }
}

async function deactivateFinish(deps: DeactivateCatalogItemDeps, id: string): Promise<Finish> {
  const current = await deps.finishRepository.findById(id)

  if (current === null) {
    throw new ResourceNotFoundError(`No existe el acabado "${id}"`)
  }

  if (current.status === 'archived') {
    return current
  }

  if (
    (await deps.catalogUsageReader.isFinishAllowedByLiveSeries(current.id)) ||
    (await deps.catalogUsageReader.finishHasLiveColors(current.id))
  ) {
    throw new ItemInUseError(
      `El acabado "${current.code}" está en uso (una serie viva lo permite o tiene colores vivos); retíralo antes de desactivarlo`,
    )
  }

  const archived = current.archive(deps.clock.now())

  await deps.finishWriteRepository.save(archived)

  return archived
}

async function deactivateAccessory(
  deps: DeactivateCatalogItemDeps,
  id: string,
): Promise<Accessory> {
  const current = await deps.accessoryRepository.findById(id)

  if (current === null) {
    throw new ResourceNotFoundError(`No existe el complemento "${id}"`)
  }

  if (current.status === 'archived') {
    return current
  }

  if (await deps.catalogUsageReader.isAccessoryAllowedByLiveSeries(current.id)) {
    throw new ItemInUseError(
      `El complemento "${current.code}" está en uso: una serie viva lo permite. Quítalo de la serie antes de desactivarlo`,
    )
  }

  const archived = current.archive(deps.clock.now())

  await deps.accessoryWriteRepository.save(archived)

  return archived
}

async function deactivateColor(deps: DeactivateCatalogItemDeps, id: string): Promise<Color> {
  const current = await deps.colorRepository.findById(id)

  if (current === null) {
    throw new ResourceNotFoundError(`No existe el color "${id}"`)
  }

  if (current.status === 'archived') {
    return current
  }

  const archived = current.archive(deps.clock.now())

  await deps.colorWriteRepository.save(archived)

  return archived
}
