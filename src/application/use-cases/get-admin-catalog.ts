/**
 * Caso de uso: lectura de administración del catálogo (ADR-0023 §6, fase 2 del panel).
 *
 * Traduce la foto completa del puerto de lectura a las vistas que el shell del panel consume
 * (`ADR-0023` §3), resolviendo el idioma de la petición con el mismo fallback que el configurador y
 * calculando lo derivado: qué series tienen tarifa vigente, qué traducciones faltan y cuántos
 * colores cuelgan de cada acabado.
 *
 * Los tipos de salida son deliberadamente **estructuralmente idénticos** al contrato congelado de
 * `src/ui/admin/view-models.ts`: la capa de presentación es la dueña del contrato y este caso de uso
 * no la importa (la presentación no se importa desde la aplicación; ADR-0001). El punto de
 * intercambio del shell hace el mapeo explícito, de modo que una divergencia de forma sea un error
 * de compilación y no una sorpresa en tiempo de ejecución.
 */

import type { AccessoryCategory } from '@/domain/catalog/accessory'
import type { CatalogStatus } from '@/domain/catalog/catalog-status'
import { SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

import type { Clock } from '@/application/ports/clock'
import type {
  AdminCatalogReadPort,
  AdminCatalogSnapshot,
  AdminColorRecord,
  AdminMeasurementLimits,
  AdminSeriesRecord,
  AdminTariffVersionRecord,
} from '@/application/ports/admin-catalog-reader'

export interface AdminSeriesSummary {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly status: CatalogStatus
  readonly limits: AdminMeasurementLimits
  readonly finishCount: number
  readonly tariffVersionNumber: number | null
  readonly missingLocales: readonly Locale[]
}

export interface AdminSeriesDetail {
  readonly id: string
  readonly slug: string
  readonly status: CatalogStatus
  readonly names: Readonly<Record<Locale, string>>
  readonly translatedLocales: readonly Locale[]
  readonly limits: AdminMeasurementLimits
  readonly finishCount: number
  readonly tariffVersionNumber: number | null
}

export interface AdminTariffVersionSummary {
  readonly id: string
  readonly seriesId: string
  readonly seriesName: string
  readonly versionNumber: number
  readonly status: CatalogStatus
  readonly effectiveFrom: string | null
  readonly priceCount: number
}

export interface AdminCatalogLanguageSummary {
  readonly code: Locale
  readonly isActive: boolean
  /** Series a las que les falta el nombre o la descripción en este idioma. */
  readonly missingSeries: number
}

export interface AdminCatalogColor {
  readonly id: string
  readonly code: string
  readonly status: CatalogStatus
  readonly name: string
  readonly hex: string | null
}

export interface AdminCatalogFinish {
  readonly id: string
  readonly code: string
  readonly status: CatalogStatus
  readonly name: string
  readonly description: string | null
  readonly colors: readonly AdminCatalogColor[]
}

export interface AdminCatalogAccessory {
  readonly id: string
  readonly code: string
  readonly category: AccessoryCategory
  readonly status: CatalogStatus
  readonly name: string
  readonly description: string | null
}

export interface AdminCatalogUseCase {
  listSeries(): Promise<readonly AdminSeriesSummary[]>
  getSeries(slug: string): Promise<AdminSeriesDetail | null>
  listTariffVersions(): Promise<readonly AdminTariffVersionSummary[]>
  listLanguages(): Promise<readonly AdminCatalogLanguageSummary[]>
  listFinishes(): Promise<readonly AdminCatalogFinish[]>
  listAccessories(): Promise<readonly AdminCatalogAccessory[]>
}

export interface GetAdminCatalogDeps {
  readonly reader: AdminCatalogReadPort
  readonly clock: Clock
  /** Idioma de la petición: fija los nombres resueltos y el detalle de una serie. */
  readonly locale: Locale
}

/**
 * Un idioma está traducido para una serie cuando tiene **nombre y descripción**. El panel avisa de
 * lo que falta por traducir, así que una descripción ausente cuenta como pendiente en todos los
 * idiomas (es lo que el propietario tiene que completar antes de publicar).
 */
function missingLocales(series: AdminSeriesRecord): readonly Locale[] {
  return SUPPORTED_LOCALES.filter(
    (locale) =>
      !series.name.hasTranslation(locale) ||
      series.description === null ||
      !series.description.hasTranslation(locale),
  )
}

function resolvedNames(series: AdminSeriesRecord): Readonly<Record<Locale, string>> {
  const names = {} as Record<Locale, string>

  for (const locale of SUPPORTED_LOCALES) {
    names[locale] = series.name.resolve(locale)
  }

  return names
}

/** Día de vigencia en ISO `YYYY-MM-DD` (las tarifas se guardan como `@db.Date`). */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isInForce(version: AdminTariffVersionRecord, instant: Date): boolean {
  if (version.status !== 'published') {
    return false
  }

  if (instant.getTime() < version.validFrom.getTime()) {
    return false
  }

  return version.validUntil === null || instant.getTime() < version.validUntil.getTime()
}

export function createAdminCatalogUseCase(deps: GetAdminCatalogDeps): AdminCatalogUseCase {
  const { reader, clock, locale } = deps

  const load = (): Promise<AdminCatalogSnapshot> => reader.loadAdminCatalog()

  const tariffVersionNumberInForce = (
    seriesId: string,
    versions: readonly AdminTariffVersionRecord[],
    instant: Date,
  ): number | null => {
    const inForce = versions.filter(
      (version) => version.seriesId === seriesId && isInForce(version, instant),
    )

    if (inForce.length === 0) {
      return null
    }

    return Math.max(...inForce.map((version) => version.versionNumber))
  }

  return {
    async listSeries() {
      const snapshot = await load()
      const instant = clock.now()

      return snapshot.series
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((series): AdminSeriesSummary => {
          const finishCount = series.allowedFinishIds.length

          return {
            id: series.id,
            slug: series.slug,
            name: series.name.resolve(locale),
            status: series.status,
            limits: series.limits,
            finishCount,
            tariffVersionNumber: tariffVersionNumberInForce(
              series.id,
              snapshot.tariffVersions,
              instant,
            ),
            missingLocales: missingLocales(series),
          }
        })
    },

    async getSeries(slug) {
      const snapshot = await load()
      const series = snapshot.series.find((candidate) => candidate.slug === slug)

      if (series === undefined) {
        return null
      }

      const missing = missingLocales(series)

      return {
        id: series.id,
        slug: series.slug,
        status: series.status,
        names: resolvedNames(series),
        translatedLocales: SUPPORTED_LOCALES.filter((candidate) => !missing.includes(candidate)),
        limits: series.limits,
        finishCount: series.allowedFinishIds.length,
        tariffVersionNumber: tariffVersionNumberInForce(
          series.id,
          snapshot.tariffVersions,
          clock.now(),
        ),
      }
    },

    async listTariffVersions() {
      const snapshot = await load()
      // Mismo orden que la lista de series: por `sortOrder`, no por el orden en que llegan las filas.
      const orderedSeries = snapshot.series
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
      const order = new Map(orderedSeries.map((series, index) => [series.id, index] as const))

      return snapshot.tariffVersions
        .slice()
        .sort((left, right) => {
          const bySeries = (order.get(left.seriesId) ?? 0) - (order.get(right.seriesId) ?? 0)

          return bySeries === 0 ? left.versionNumber - right.versionNumber : bySeries
        })
        .map((version): AdminTariffVersionSummary => {
          const series = orderedSeries.find((candidate) => candidate.id === version.seriesId)

          return {
            id: version.id,
            seriesId: version.seriesId,
            seriesName: series === undefined ? version.seriesId : series.name.resolve(locale),
            versionNumber: version.versionNumber,
            status: version.status,
            // Un borrador todavía no tiene día de entrada en vigor; la vigencia llega al publicar.
            effectiveFrom: version.status === 'draft' ? null : isoDay(version.validFrom),
            priceCount: version.priceCount,
          }
        })
    },

    async listLanguages() {
      const snapshot = await load()

      return SUPPORTED_LOCALES.map((code): AdminCatalogLanguageSummary => {
        const missing = snapshot.series.filter((series) =>
          missingLocales(series).includes(code),
        ).length

        // Los idiomas del catálogo todavía no tienen interruptor en base de datos (ADR-0005): el
        // propietario elige idiomas editando las traducciones, y todos los soportados están activos.
        return { code, isActive: true, missingSeries: missing }
      })
    },

    async listFinishes() {
      const snapshot = await load()

      return snapshot.finishes
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((finish): AdminCatalogFinish => ({
          id: finish.id,
          code: finish.code,
          status: finish.status,
          name: finish.name.resolve(locale),
          description: finish.description === null ? null : finish.description.resolve(locale),
          colors: colorsOf(snapshot.colors, finish.id, locale),
        }))
    },

    async listAccessories() {
      const snapshot = await load()

      return snapshot.accessories
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((accessory): AdminCatalogAccessory => ({
          id: accessory.id,
          code: accessory.code,
          category: accessory.category,
          status: accessory.status,
          name: accessory.name.resolve(locale),
          description:
            accessory.description === null ? null : accessory.description.resolve(locale),
        }))
    },
  }
}

function colorsOf(
  colors: readonly AdminColorRecord[],
  finishId: string,
  locale: Locale,
): readonly AdminCatalogColor[] {
  return colors
    .filter((color) => color.finishId === finishId)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((color) => ({
      id: color.id,
      code: color.code,
      status: color.status,
      name: color.name.resolve(locale),
      hex: color.hex,
    }))
}
