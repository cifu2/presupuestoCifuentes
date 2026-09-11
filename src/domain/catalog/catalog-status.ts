/**
 * Ciclo de vida de los elementos de catálogo editables desde el panel.
 *
 * `draft` es lo que se está preparando, `published` lo que ve el configurador y `archived` lo
 * que se conserva por trazabilidad pero ya no se ofrece. Las transiciones se validan para que
 * el panel no pueda, por ejemplo, archivar y volver a publicar sin pasar por borrador.
 */

import { InvalidCatalogTransitionError } from '@/domain/shared/errors'

export const CATALOG_STATUSES = ['draft', 'published', 'archived'] as const

export type CatalogStatus = (typeof CATALOG_STATUSES)[number]

const ALLOWED_TRANSITIONS: Record<CatalogStatus, readonly CatalogStatus[]> = {
  draft: ['published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft'],
}

export function canTransitionCatalogStatus(from: CatalogStatus, to: CatalogStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function assertCatalogTransition(from: CatalogStatus, to: CatalogStatus): void {
  if (!canTransitionCatalogStatus(from, to)) {
    throw new InvalidCatalogTransitionError(
      `Transición de estado no permitida: "${from}" → "${to}"`,
    )
  }
}

export function isPublishedStatus(status: CatalogStatus): boolean {
  return status === 'published'
}
