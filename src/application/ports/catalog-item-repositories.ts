/**
 * Puertos de lectura de acabados, colores y accesorios.
 *
 * Son interfaces pequeñas y específicas por agregado (ver docs/coding-conventions.md): el panel
 * y el configurador piden lo que necesitan, no un repositorio genérico. Las lecturas del
 * configurador (`listPublished*`) devuelven solo elementos publicados.
 */

import type { Accessory } from '@/domain/catalog/accessory'
import type { Color } from '@/domain/catalog/color'
import type { Finish } from '@/domain/catalog/finish'

export interface FinishRepository {
  findById(id: string): Promise<Finish | null>
  listPublished(): Promise<readonly Finish[]>
  listPublishedByIds(ids: readonly string[]): Promise<readonly Finish[]>
}

export interface ColorRepository {
  findById(id: string): Promise<Color | null>
  /** Colores publicados de un acabado, ordenados por `sortOrder`. */
  listPublishedByFinishId(finishId: string): Promise<readonly Color[]>
}

export interface AccessoryRepository {
  findById(id: string): Promise<Accessory | null>
  listPublished(): Promise<readonly Accessory[]>
  listPublishedByIds(ids: readonly string[]): Promise<readonly Accessory[]>
}
