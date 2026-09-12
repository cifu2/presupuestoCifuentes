/**
 * Invariante del catálogo de demostración que sostiene el E2E del panel (CIF-86 → CIF-9, criterio 2).
 *
 * `e2e/admin-tariff-publish.spec.ts` publica un borrador por proyecto de Playwright porque, en local,
 * `chromium` y `movil` corren en paralelo (`fullyParallel`) contra el mismo servidor y no pueden
 * compartir estado mutable. Eso solo es seguro si el catálogo siembra **al menos tantos borradores
 * publicables** como proyectos y esos borradores no se solapan entre sí: si un cambio futuro estrecha
 * una ventana, el E2E deja de aislar los proyectos sin que nada avise.
 */

import { describe, expect, it } from 'vitest'

import { buildDemoCatalog } from './demo-catalog'

describe('catálogo de demostración', () => {
  it('siembra un borrador publicable por proyecto de Playwright, sin solapes entre ellos', () => {
    const { tariffVersions } = buildDemoCatalog()
    const published = tariffVersions.filter((version) => version.isPublished())
    const publishable = tariffVersions.filter(
      (version) =>
        !version.isPublished() &&
        !published.some(
          (other) =>
            other.seriesId === version.seriesId && other.validity.overlaps(version.validity),
        ),
    )

    // Proyectos de `playwright.config.ts`: `chromium` y `movil`.
    expect(publishable.length).toBeGreaterThanOrEqual(2)

    publishable.forEach((left, index) => {
      for (const right of publishable.slice(index + 1)) {
        expect(
          left.seriesId === right.seriesId && left.validity.overlaps(right.validity),
          `los borradores ${left.id} y ${right.id} se solapan y no pueden publicarse los dos`,
        ).toBe(false)
      }
    })
  })
})
