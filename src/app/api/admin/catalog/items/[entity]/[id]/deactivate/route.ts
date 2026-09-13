import { deactivateCatalogItem } from '@/application/use-cases/deactivate-catalog-item'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { catalogItemEntitySchema } from '@/app/api/_lib/admin-catalog-schemas'
import { parseResourceId } from '@/app/api/_lib/admin-resource'
import { errorResponse, jsonResponse } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'
import { ResourceNotFoundError } from '@/domain/shared/errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/catalog/items/:entity/:id/deactivate — archiva un acabado, un color o un
 * complemento (CIF-243). Una sola ruta para las tres entidades: el caso de uso ya las despacha por
 * `entity` y así el panel tiene un contrato único de «desactivar».
 *
 * `entity` fuera del enumerado es un recurso inexistente (404), no un error de forma del cuerpo. Las
 * guardas de uso las aplica el caso de uso: un acabado o complemento referenciado por una serie viva,
 * o un acabado con colores vivos, responden `ITEM_IN_USE` (409) sin escribir.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ entity: string; id: string }> },
): Promise<Response> {
  const auth = requireAdminAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  const { entity, id } = await context.params
  const parsedEntity = catalogItemEntitySchema.safeParse(entity)

  if (!parsedEntity.success) {
    return errorResponse(new ResourceNotFoundError('No existe ese tipo de elemento de catálogo'))
  }

  const parsedId = parseResourceId(id)

  if (!parsedId.ok) {
    return parsedId.response
  }

  try {
    const container = createContainer()
    const deactivated = await deactivateCatalogItem(
      {
        finishRepository: container.finishRepository,
        colorRepository: container.colorRepository,
        accessoryRepository: container.accessoryRepository,
        finishWriteRepository: container.finishWriteRepository,
        colorWriteRepository: container.colorWriteRepository,
        accessoryWriteRepository: container.accessoryWriteRepository,
        catalogUsageReader: container.catalogUsageReader,
        clock: container.clock,
      },
      { entity: parsedEntity.data, id: parsedId.id },
    )

    return jsonResponse({ data: deactivated })
  } catch (error) {
    return errorResponse(error)
  }
}
