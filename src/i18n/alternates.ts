/**
 * Alternativas por ruta para los buscadores: `canonical`, `hreflang` y `x-default`.
 *
 * El layout `[locale]` no puede declarar una canónica fija: al aplicarse a cualquier página
 * descendiente, todas las rutas (configurador, panel, presupuesto…) quedarían declaradas como la
 * portada y como alternativas `/es` y `/en` en vez de su ruta hermana. Por eso el cálculo vive
 * aquí y lo consume el metadata de cada página con su propia ruta.
 */

import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from '@/domain/catalog/locale'

/**
 * Valor listo para el campo `alternates` de `Metadata` de Next.js. La clave `x-default` viaja
 * dentro de `languages`, que es donde Next.js la espera.
 */
export type LocaleAlternates = {
  canonical: string
  languages: Record<string, string>
}

/** Descarta query y fragmento y normaliza la ruta a segmentos sin barras vacías. */
function toRouteSegments(pathname: string): string[] {
  const [withoutQueryOrHash] = pathname.split(/[?#]/, 1)

  return (withoutQueryOrHash ?? '').split('/').filter((segment) => segment.length > 0)
}

/**
 * Calcula la canónica y las alternativas de idioma de una ruta.
 *
 * @param pathname Ruta sin idioma (`/`, `/configurador`) o con él (`/en/configurador`). La query
 *   y el fragmento se ignoran: una canónica nunca los incluye.
 * @param locale Idioma activo de la página. Si se omite, se usa el prefijo de `pathname` cuando
 *   lo lleva y, si no, el idioma por defecto del sitio.
 */
export function buildLocaleAlternates(pathname: string, locale?: Locale): LocaleAlternates {
  const segments = toRouteSegments(pathname)
  const first = segments[0]
  const routeLocale = first !== undefined && isSupportedLocale(first) ? first : undefined
  const activeLocale = locale ?? routeLocale ?? DEFAULT_LOCALE
  const route = routeLocale ? segments.slice(1) : segments
  const suffix = route.length > 0 ? `/${route.join('/')}` : ''

  const languages = Object.fromEntries(
    SUPPORTED_LOCALES.map((supported) => [supported, `/${supported}${suffix}`] as const),
  )

  return {
    canonical: `/${activeLocale}${suffix}`,
    languages: { ...languages, 'x-default': `/${DEFAULT_LOCALE}${suffix}` },
  }
}
