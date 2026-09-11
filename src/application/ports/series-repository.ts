/**
 * Puerto de lectura de series de puertas.
 *
 * El caso de uso pregunta por lo que necesita (una serie publicada por slug, el listado del
 * configurador); el adaptador Prisma concreto se inyecta en la raíz de composición.
 */

import type { DoorSeries } from '@/domain/catalog/series'

export interface SeriesRepository {
  findPublishedBySlug(slug: string): Promise<DoorSeries | null>
  findById(id: string): Promise<DoorSeries | null>
  listPublished(): Promise<readonly DoorSeries[]>
}
