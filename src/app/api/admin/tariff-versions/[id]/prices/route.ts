import { updateTariffPrice } from '@/application/use-cases/update-tariff-price'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { updateTariffPriceSchema, withoutAbsent } from '@/app/api/_lib/admin-catalog-schemas'
import { parseResourceId } from '@/app/api/_lib/admin-resource'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/admin/tariff-versions/:id/prices — edición rápida de la tabla de precios (CIF-243).
 *
 * Solo un **borrador** se edita: una versión publicada responde `TARIFF_NOT_EDITABLE` (409) y no se
 * toca, porque su precio ya está congelado en los presupuestos emitidos (ADR-0003). Los campos
 * ausentes del cuerpo no se reescriben, así que el panel puede mandar solo el precio cambiado.
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

  const body = await readJsonBody(request, updateTariffPriceSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const priceTable = await updateTariffPrice(
      {
        tariffVersionRepository: container.tariffVersionRepository,
        idGenerator: container.idGenerator,
      },
      withoutAbsent({ tariffVersionId: parsedId.id, ...body.data }),
    )

    return jsonResponse({ data: priceTable })
  } catch (error) {
    return errorResponse(error)
  }
}
