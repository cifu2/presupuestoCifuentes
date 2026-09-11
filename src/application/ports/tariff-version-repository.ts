/**
 * Puerto de tarifas versionadas (ADR-0003).
 *
 * El caso de uso no conoce Prisma: pide las versiones de una serie o directamente la vigente en
 * un instante, y decide con las reglas de dominio si hay precio automático o presupuesto manual.
 */

import type { TariffVersion } from '@/domain/catalog/tariff-version'

export interface TariffVersionRepository {
  listBySeriesId(seriesId: string): Promise<readonly TariffVersion[]>
  findInForceAt(seriesId: string, instant: Date): Promise<TariffVersion | null>
}
