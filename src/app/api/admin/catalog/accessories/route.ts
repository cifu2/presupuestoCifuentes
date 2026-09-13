import { upsertAccessory } from '@/application/use-cases/upsert-accessory'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { upsertAccessorySchema, withoutAbsent } from '@/app/api/_lib/admin-catalog-schemas'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/catalog/accessories — alta o edición de un complemento por `code` (CIF-243).
 *
 * Los complementos se ofrecen por serie (`allowedAccessoryIds`); desactivar uno que una serie viva
 * sigue permitiendo responde `ITEM_IN_USE` (409) y no escribe.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = requireAdminAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  const body = await readJsonBody(request, upsertAccessorySchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const accessory = await upsertAccessory(
      {
        accessoryWriteRepository: container.accessoryWriteRepository,
        idGenerator: container.idGenerator,
        clock: container.clock,
      },
      withoutAbsent(body.data),
    )

    return jsonResponse({ data: accessory })
  } catch (error) {
    return errorResponse(error)
  }
}
