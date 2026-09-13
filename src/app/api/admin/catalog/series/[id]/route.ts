import { updateSeries } from '@/application/use-cases/update-series'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { updateSeriesSchema, withoutAbsent } from '@/app/api/_lib/admin-catalog-schemas'
import { parseResourceId } from '@/app/api/_lib/admin-resource'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/catalog/series/:id — edición parcial de una serie (CIF-243).
 *
 * Solo se toca lo que llega: los campos ausentes conservan su valor y, en los textos, `null` borra
 * esa traducción (`LocalizedTextPatch`). El estado se valida contra las transiciones del dominio, así
 * que archivar y republicar de un salto responde `INVALID_CATALOG_TRANSITION`.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = requireAdminAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  const { id } = await context.params
  const parsedId = parseResourceId(id)

  if (!parsedId.ok) {
    return parsedId.response
  }

  const body = await readJsonBody(request, updateSeriesSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const series = await updateSeries(
      {
        seriesRepository: container.seriesRepository,
        seriesWriteRepository: container.seriesWriteRepository,
        clock: container.clock,
      },
      withoutAbsent({ seriesId: parsedId.id, ...body.data }),
    )

    return jsonResponse({ data: series })
  } catch (error) {
    return errorResponse(error)
  }
}
