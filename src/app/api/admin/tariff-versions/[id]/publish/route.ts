import { createContainer } from '@/composition/container'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { errorResponse, jsonResponse } from '@/app/api/_lib/http'
import { uuidSchema } from '@/app/api/_lib/schemas'
import { publishTariffVersion } from '@/application/use-cases/publish-tariff-version'
import { ResourceNotFoundError } from '@/domain/shared/errors'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/tariff-versions/:id/publish — publica una versión de tarifa (ADR-0003).
 *
 * La invariante de no solapamiento la aplica el caso de uso **antes** de escribir: si se solapa con
 * otra publicada de la serie responde 409 `AMBIGUOUS_TARIFF` y no modifica ninguna fila.
 *
 * El `id` se valida en el borde (es una columna `@db.Uuid`): un id malformado responde 404
 * `NOT_FOUND` sin consultar la base de datos (hallazgo N2 de CIF-85).
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

  const parsedId = uuidSchema.safeParse(id)

  if (!parsedId.success) {
    return errorResponse(
      new ResourceNotFoundError('No existe ninguna versión de tarifa con ese identificador'),
    )
  }

  try {
    const container = createContainer()
    const published = await publishTariffVersion(
      { tariffVersionRepository: container.tariffVersionRepository, clock: container.clock },
      { tariffVersionId: parsedId.data },
    )

    return jsonResponse({ data: published })
  } catch (error) {
    return errorResponse(error)
  }
}
