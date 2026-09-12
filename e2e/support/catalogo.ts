/**
 * Ids del catálogo que sirve el servidor, indexados por `code` (`LACADO`, `RAL-7016`, `MANILLA-A`).
 *
 * Los specs del configurador no pueden fijar ids literales: en modo `prisma` son los del catálogo
 * sembrado en PostgreSQL y en modo demostración los ids legibles del catálogo en memoria
 * (`src/infrastructure/demo/demo-catalog.ts`). Leerlos de la API mantiene los specs válidos en los
 * dos modos y también contra un entorno ya desplegado.
 */

import type { APIRequestContext } from '@playwright/test'

export interface CatalogoIds {
  /** Id por `code` del acabado. */
  readonly finishes: Readonly<Record<string, string>>
  /** Id por `code` del color (los códigos son únicos entre acabados en el catálogo de demostración). */
  readonly colors: Readonly<Record<string, string>>
  /** Id por `code` del accesorio. */
  readonly accessories: Readonly<Record<string, string>>
}

interface CatalogSeriesDetailBody {
  readonly data: {
    readonly finishes: readonly {
      readonly id: string
      readonly code: string
      readonly colors: readonly { readonly id: string; readonly code: string }[]
    }[]
    readonly accessories: readonly { readonly id: string; readonly code: string }[]
  }
}

/**
 * Ids del catálogo publicado de una serie. Uso típico en un spec: `const ids = await catalogoIds(request)`
 * y después `selectOption(ids.finishes.MADERA)` o `getByTestId(`accessory-${ids.accessories['MANILLA-A']}`)`.
 */
export async function catalogoIds(
  request: APIRequestContext,
  seriesSlug = 'ci-100',
): Promise<CatalogoIds> {
  const response = await request.get(`/api/catalog/series/${seriesSlug}?locale=es`)

  if (!response.ok()) {
    throw new Error(
      `El catálogo de "${seriesSlug}" no responde (${response.status()}): sin catálogo los ids de los elementos no se pueden resolver`,
    )
  }

  const { data } = (await response.json()) as CatalogSeriesDetailBody
  const finishes: Record<string, string> = {}
  const colors: Record<string, string> = {}
  const accessories: Record<string, string> = {}

  for (const finish of data.finishes) {
    finishes[finish.code] = finish.id

    for (const color of finish.colors) {
      colors[color.code] = color.id
    }
  }

  for (const accessory of data.accessories) {
    accessories[accessory.code] = accessory.id
  }

  return { finishes, colors, accessories }
}
