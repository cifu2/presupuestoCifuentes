import { upsertSeries } from '@/application/use-cases/upsert-series'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { upsertSeriesSchema, withoutAbsent } from '@/app/api/_lib/admin-catalog-schemas'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/catalog/series — alta o edición de una serie por `code` (CIF-243).
 *
 * Es un *upsert* idempotente: repetir la petición con el mismo `code` no duplica la serie. Las
 * respuestas de conflicto (`CONFLICT` al chocar el `slug` con otra serie) y de validación de negocio
 * las produce el caso de uso; el borde solo comprueba forma.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = requireAdminAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  const body = await readJsonBody(request, upsertSeriesSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const series = await upsertSeries(
      {
        seriesWriteRepository: container.seriesWriteRepository,
        idGenerator: container.idGenerator,
        clock: container.clock,
      },
      withoutAbsent(body.data),
    )

    return jsonResponse({ data: series })
  } catch (error) {
    return errorResponse(error)
  }
}
