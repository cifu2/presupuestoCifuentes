import { createContainer } from '@/composition/container'
import { requireAdminToken } from '@/app/api/_lib/admin-auth'
import { errorResponse, jsonResponse } from '@/app/api/_lib/http'
import { publishTariffVersion } from '@/application/use-cases/publish-tariff-version'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/tariff-versions/:id/publish — publica una versión de tarifa (ADR-0003).
 *
 * La invariante de no solapamiento la aplica el caso de uso **antes** de escribir: si se solapa con
 * otra publicada de la serie responde 409 `AMBIGUOUS_TARIFF` y no modifica ninguna fila.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = requireAdminToken(request)

  if (!auth.ok) {
    return auth.response
  }

  const { id } = await context.params

  try {
    const container = createContainer()
    const published = await publishTariffVersion(
      { tariffVersionRepository: container.tariffVersionRepository, clock: container.clock },
      { tariffVersionId: id },
    )

    return jsonResponse({ data: published })
  } catch (error) {
    return errorResponse(error)
  }
}
