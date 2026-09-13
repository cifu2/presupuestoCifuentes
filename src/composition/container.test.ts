/**
 * El contenedor del modo demostración es **uno por proceso**, no uno por grafo de módulos (CIF-577,
 * hallazgo de CIF-545).
 *
 * Next.js compila el servidor en varios grafos —la capa RSC de las páginas y la de las rutas HTTP,
 * entre otras— y cada uno evaluaba su propio `container.ts`: con una caché de módulo, cada capa se
 * quedaba con su `createDemoCatalogStore()` y la página del panel no veía lo que publicaba la ruta
 * HTTP del **mismo** proceso. Este test reproduce la separación de grafos con `vi.resetModules()`
 * (importar dos veces el módulo tras vaciar el registro es lo que hace el bundler capa por capa) y
 * comprueba las dos cosas: que las dos capas reciben el mismo contenedor y que la escritura de una
 * se lee desde la otra.
 *
 * No hay import estático de `./container` a propósito: el test necesita **dos** instancias del
 * módulo, no una compartida por el registro de este fichero.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

/** Token de pruebas: vive solo aquí, contra el contenedor en memoria de este proceso. */
const ADMIN_TOKEN = 'token-de-pruebas-del-contenedor-por-proceso'

/**
 * Borrador publicable de CI-400 (ventana 2027) del catálogo de demostración: no tiene predecesora de
 * vigencia abierta, así que publicarlo no cambia el precio vigente de ninguna serie.
 */
const TARIFF_CI_400_2027_DRAFT = '0192f1b0-0000-7000-8000-000000000401'

/** Importa un módulo en un grafo **nuevo**, como hace el bundler con cada capa del servidor. */
async function freshGraph<T>(loader: () => Promise<T>): Promise<T> {
  vi.resetModules()

  return loader()
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('contenedor de demostración por proceso (CIF-577)', () => {
  // El primer `import('./container')` de este fichero compila todo el grafo del contenedor —render
  // de PDF incluido—, muy por encima del `testTimeout` por defecto de Vitest.
  it('las dos capas del servidor comparten el mismo contenedor en el mismo proceso', async () => {
    const httpLayer = await freshGraph(() => import('./container'))
    const pageLayer = await freshGraph(() => import('./container'))

    // Dos instancias del módulo (dos grafos), un solo contenedor: con la caché a nivel de módulo
    // esto serían dos objetos y cada capa tendría su propio catálogo en memoria.
    expect(pageLayer.createContainer()).toBe(httpLayer.createContainer())
  }, 60_000)

  it('lo que publica la ruta HTTP lo lee el lector de administración del panel', async () => {
    vi.stubEnv('ADMIN_API_TOKEN', ADMIN_TOKEN)

    const publishRoute = await freshGraph(
      () => import('@/app/api/admin/tariff-versions/[id]/publish/route'),
    )

    const response = await publishRoute.POST(
      new Request(
        `http://localhost/api/admin/tariff-versions/${TARIFF_CI_400_2027_DRAFT}/publish`,
        { method: 'POST', headers: { authorization: `Bearer ${ADMIN_TOKEN}` } },
      ),
      { params: Promise.resolve({ id: TARIFF_CI_400_2027_DRAFT }) },
    )

    expect(response.status).toBe(200)

    // Y la lectura del panel se resuelve en **otro** grafo de módulos: el de la página (RSC).
    const pageLayer = await freshGraph(() => import('@/ui/admin/admin-catalog-reader.factory'))
    const versions = await pageLayer.createAdminCatalogReader('es').listTariffVersions()
    const published = versions.find((version) => version.id === TARIFF_CI_400_2027_DRAFT)

    // Publicada de verdad: la página pinta el estado y la fecha de entrada en vigor, no el «Borrador
    // / —» de la semilla. Es exactamente lo que el panel no veía antes de compartir el contenedor.
    expect(published).toMatchObject({ status: 'published', effectiveFrom: '2027-01-01' })
  })
})
