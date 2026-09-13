import { deactivateSeries } from '@/application/use-cases/deactivate-series'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { parseResourceId } from '@/app/api/_lib/admin-resource'
import { errorResponse, jsonResponse } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/catalog/series/:id/deactivate — archiva una serie (CIF-243).
 *
 * Nunca borra: desactivar es pasar a `archived` (criterio de CIF-9). Si la serie tiene una tarifa
 * publicada y vigente el caso de uso responde `SERIES_IN_USE` (409) y **no** escribe: el propietario
 * debe cerrar antes la tarifa o publicar su sucesora.
 */
export async function POST(
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

  try {
    const container = createContainer()
    const series = await deactivateSeries(
      {
        seriesRepository: container.seriesRepository,
        seriesWriteRepository: container.seriesWriteRepository,
        catalogUsageReader: container.catalogUsageReader,
        clock: container.clock,
      },
      { seriesId: parsedId.id },
    )

    return jsonResponse({ data: series })
  } catch (error) {
    return errorResponse(error)
  }
}
