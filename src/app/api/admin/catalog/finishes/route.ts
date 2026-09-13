import { upsertFinish } from '@/application/use-cases/upsert-finish'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { upsertFinishSchema, withoutAbsent } from '@/app/api/_lib/admin-catalog-schemas'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/catalog/finishes — alta o edición de un acabado por `code` (CIF-243).
 *
 * Idempotente y **sin borrado**: para retirar un acabado se desactiva a `archived`
 * (`/api/admin/catalog/items/finish/:id/deactivate`), que es reversible.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = requireAdminAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  const body = await readJsonBody(request, upsertFinishSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const finish = await upsertFinish(
      {
        finishWriteRepository: container.finishWriteRepository,
        idGenerator: container.idGenerator,
        clock: container.clock,
      },
      withoutAbsent(body.data),
    )

    return jsonResponse({ data: finish })
  } catch (error) {
    return errorResponse(error)
  }
}
