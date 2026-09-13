/**
 * Precondición de catálogo para los E2E que lo necesitan (ADR-0026 §7, dentro de ADR-0015 §7).
 *
 * Un entorno destino sin series publicadas (producción mientras el propietario no cargue su catálogo)
 * no es un fallo del código que se está validando: producción sirve el configurador vacío como estado
 * esperado y los datos de demostración solo se siembran en entornos desechables. Antes esto se
 * manifestaba como el timeout del selector `configurator-series`; ahora el spec comprueba
 * `GET /api/catalog/series` antes de interactuar y falla como **precondición** con un mensaje que
 * nombra la decisión y el entorno donde sí se valida (preview sembrado, CIF-330).
 */

/** Respuesta mínima que necesita la precondición; encaja con `APIResponse` de Playwright. */
export type CatalogResponseLike = {
  ok(): boolean
  status(): number
  json(): Promise<unknown>
}

/** Cliente mínimo que necesita la precondición; encaja con `APIRequestContext`. */
export type CatalogFetcher = {
  get(url: string): Promise<CatalogResponseLike>
}

/** Mensaje único de precondición: qué falta, por qué y dónde se valida de verdad. */
export const CATALOG_PRECONDITION =
  'ADR-0026 §7 (dentro de ADR-0015 §7): este E2E necesita un entorno con catálogo publicado. ' +
  'El catálogo real lo carga el propietario desde el panel y los datos de demostración solo se ' +
  'siembran en entornos desechables: hermético con CATALOG_DEMO_MODE=true, o preview sembrado con ' +
  'scripts/seed-preview-catalogo.sh (CIF-330). Nunca contra producción (ADR-0025 §5).'

/** `true` si el cuerpo de `GET /api/catalog/series` no trae ninguna serie publicada. */
export function catalogIsEmpty(payload: unknown): boolean {
  const data = (payload as { data?: unknown } | null | undefined)?.data

  return !Array.isArray(data) || data.length === 0
}

/**
 * Comprueba la precondición de catálogo y lanza un error con mensaje si no se cumple. El fallo debe
 * ser inmediato y explicar la causa, nunca agotar el timeout esperando un selector que no existirá.
 */
export async function requirePublishedCatalog(
  fetcher: CatalogFetcher,
  locale = 'es',
): Promise<void> {
  const url = `/api/catalog/series?locale=${locale}`
  const response = await fetcher.get(url)

  if (!response.ok()) {
    throw new Error(`${url} respondió ${response.status()} en vez de 2xx. ${CATALOG_PRECONDITION}`)
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    throw new Error(`${url} no devolvió JSON legible. ${CATALOG_PRECONDITION}`)
  }

  if (catalogIsEmpty(payload)) {
    throw new Error(`${url} devolvió 200 sin series publicadas. ${CATALOG_PRECONDITION}`)
  }
}
