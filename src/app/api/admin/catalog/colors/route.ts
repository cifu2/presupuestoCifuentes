import { upsertColor } from '@/application/use-cases/upsert-color'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { upsertColorSchema, withoutAbsent } from '@/app/api/_lib/admin-catalog-schemas'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/catalog/colors — alta o edición de un color de un acabado (CIF-243).
 *
 * La clave del *upsert* es `(finishId, code)`, no el `code` suelto: dos acabados pueden tener un
 * color «ROBLE» distinto. El `hex` es opcional (lo pinta la vista previa 2D) y el dominio exige
 * `#RRGGBB` cuando llega.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = requireAdminAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  const body = await readJsonBody(request, upsertColorSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const color = await upsertColor(
      {
        finishRepository: container.finishRepository,
        colorWriteRepository: container.colorWriteRepository,
        idGenerator: container.idGenerator,
        clock: container.clock,
      },
      withoutAbsent(body.data),
    )

    return jsonResponse({ data: color })
  } catch (error) {
    return errorResponse(error)
  }
}
