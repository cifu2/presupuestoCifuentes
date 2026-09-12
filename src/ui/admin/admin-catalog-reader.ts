import type {
  CatalogLanguageSummary,
  SeriesDetail,
  SeriesSummary,
  TariffVersionSummary,
} from './view-models'

/**
 * Puerto de lectura del panel (ADR-0023 §3).
 *
 * Lo declara la capa de presentación porque es su contrato de vista, no el del dominio: describe
 * exactamente lo que el shell necesita pintar. En la fase 1 lo sirve el adaptador de fixtures; la
 * fase 2 publica el adaptador real sin tocar los componentes.
 */
export interface AdminCatalogReader {
  /** Series del catálogo, incluidas las que no están publicadas. */
  readonly listSeries: () => Promise<readonly SeriesSummary[]>
  /** Detalle de una serie por su identificador web; `null` si no existe. */
  readonly getSeries: (slug: string) => Promise<SeriesDetail | null>
  /** Versiones de tarifa de todas las series (vigente, borrador y archivadas). */
  readonly listTariffVersions: () => Promise<readonly TariffVersionSummary[]>
  /** Idiomas del catálogo y cuántas series les faltan por traducir. */
  readonly listLanguages: () => Promise<readonly CatalogLanguageSummary[]>
}
