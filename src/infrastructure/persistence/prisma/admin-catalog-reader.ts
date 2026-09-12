/**
 * Adaptador Prisma del puerto de lectura de administración (ADR-0023 §6, fase 2 del panel).
 *
 * Lee el catálogo completo **sin filtrar por estado editorial** (el panel administra borradores y
 * archivados) y reutiliza los mapeadores fila ↔ dominio de `mappers.ts`; la capa de aplicación
 * recibe entidades de dominio y no tipos de Prisma. Lo único propio de este adaptador es la foto
 * completa y el recuento de filas de precio de cada tabla de tarifa.
 */

import type { $Enums, PrismaClient } from '@prisma/client'

import type {
  AdminAccessoryRecord,
  AdminCatalogReadPort,
  AdminCatalogSnapshot,
  AdminColorRecord,
  AdminFinishRecord,
  AdminSeriesRecord,
  AdminTariffVersionRecord,
} from '@/application/ports/admin-catalog-reader'

import {
  groupCatalogTexts,
  toAccessory,
  toColor,
  toDoorSeries,
  toFinish,
  toTariffVersion,
  type CatalogTextRow,
} from './mappers'

type TextMap = ReturnType<typeof groupCatalogTexts>

async function fetchTexts(
  prisma: PrismaClient,
  entityType: $Enums.CatalogEntityType,
  entityIds: readonly string[],
): Promise<TextMap> {
  if (entityIds.length === 0) {
    return new Map()
  }

  const rows: CatalogTextRow[] = await prisma.catalogText.findMany({
    where: { entityType, entityId: { in: [...entityIds] } },
    select: { entityId: true, field: true, locale: true, value: true },
  })

  return groupCatalogTexts(rows)
}

export class PrismaAdminCatalogReader implements AdminCatalogReadPort {
  constructor(private readonly prisma: PrismaClient) {}

  async loadAdminCatalog(): Promise<AdminCatalogSnapshot> {
    // Una sola foto, aunque sean consultas en paralelo: así la lista de series y el detalle no se
    // calculan con lecturas de instantes distintos. El catálogo del panel es pequeño por diseño.
    const [seriesRows, finishRows, colorRows, accessoryRows, tariffRows] = await Promise.all([
      this.prisma.doorSeries.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          finishLinks: { select: { finishId: true } },
          accessoryLinks: { select: { accessoryId: true } },
        },
      }),
      this.prisma.finish.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.color.findMany({ orderBy: [{ finishId: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.accessory.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.tariffVersion.findMany({
        orderBy: [{ seriesId: 'asc' }, { versionNumber: 'asc' }],
        include: {
          priceTable: { include: { _count: { select: { bands: true, modifiers: true } } } },
        },
      }),
    ])

    const [seriesTexts, finishTexts, colorTexts, accessoryTexts] = await Promise.all([
      fetchTexts(
        this.prisma,
        'SERIES',
        seriesRows.map((row) => row.id),
      ),
      fetchTexts(
        this.prisma,
        'FINISH',
        finishRows.map((row) => row.id),
      ),
      fetchTexts(
        this.prisma,
        'COLOR',
        colorRows.map((row) => row.id),
      ),
      fetchTexts(
        this.prisma,
        'ACCESSORY',
        accessoryRows.map((row) => row.id),
      ),
    ])

    const series: readonly AdminSeriesRecord[] = seriesRows.map((row) => {
      const entity = toDoorSeries(row, seriesTexts)

      return {
        id: entity.id,
        code: entity.code,
        slug: entity.slug,
        status: entity.status,
        name: entity.name,
        description: entity.description,
        limits: {
          minWidthMm: entity.sizeRange.minWidthMm,
          maxWidthMm: entity.sizeRange.maxWidthMm,
          minHeightMm: entity.sizeRange.minHeightMm,
          maxHeightMm: entity.sizeRange.maxHeightMm,
        },
        allowedFinishIds: entity.allowedFinishIds,
        allowedAccessoryIds: entity.allowedAccessoryIds,
        sortOrder: entity.sortOrder,
      }
    })

    const finishes: readonly AdminFinishRecord[] = finishRows.map((row) => {
      const entity = toFinish(row, finishTexts.get(row.id))

      return {
        id: entity.id,
        code: entity.code,
        status: entity.status,
        name: entity.name,
        description: entity.description,
        sortOrder: entity.sortOrder,
      }
    })

    const colors: readonly AdminColorRecord[] = colorRows.map((row) => {
      const entity = toColor(row, colorTexts.get(row.id))

      return {
        id: entity.id,
        finishId: entity.finishId,
        code: entity.code,
        status: entity.status,
        name: entity.name,
        hex: entity.hex,
        sortOrder: entity.sortOrder,
      }
    })

    const accessories: readonly AdminAccessoryRecord[] = accessoryRows.map((row) => {
      const entity = toAccessory(row, accessoryTexts.get(row.id))

      return {
        id: entity.id,
        code: entity.code,
        category: entity.category,
        status: entity.status,
        name: entity.name,
        description: entity.description,
        sortOrder: entity.sortOrder,
      }
    })

    const tariffVersions: readonly AdminTariffVersionRecord[] = tariffRows.map((row) => {
      const entity = toTariffVersion(row)

      return {
        id: entity.id,
        seriesId: entity.seriesId,
        versionNumber: entity.versionNumber,
        status: entity.status,
        strategy: entity.strategy,
        validFrom: entity.validity.validFrom,
        validUntil: entity.validity.validUntil,
        priceCount:
          row.priceTable === null
            ? 0
            : row.priceTable._count.bands + row.priceTable._count.modifiers,
      }
    })

    return { series, finishes, colors, accessories, tariffVersions }
  }
}
