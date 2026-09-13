import { updateTariffPrice } from '@/application/use-cases/update-tariff-price'
import { toPriceTableOutput } from '@/application/use-cases/catalog-write-output'
import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { updateTariffPriceSchema, withoutAbsent } from '@/app/api/_lib/admin-catalog-schemas'
import { parseResourceId } from '@/app/api/_lib/admin-resource'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { createContainer } from '@/composition/container'
import { ResourceNotFoundError } from '@/domain/shared/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/tariff-versions/:id/prices — tabla de precios actual de una versión (CIF-243).
 *
 * Es la lectura que necesita la edición rápida para **precargar** los importes: sin ella el panel
 * pediría al propietario reescribir precios que ya existen. Responde `data: null` cuando el borrador
 * todavía no tiene tabla (nunca lo esconde como error: «sin precios» es un estado legítimo y el
 * aviso de publicación vacía ya se pinta a partir de él).
 *
 * La versión debe existir: un id válido sin fila responde `404 NOT_FOUND`.
 */
export async function GET(
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
    const version = await container.tariffVersionRepository.findById(parsedId.id)

    if (version === null) {
      throw new ResourceNotFoundError(`No existe la versión de tarifa "${parsedId.id}"`)
    }

    const table = await container.tariffVersionRepository.findPriceTableByVersionId(parsedId.id)

    return jsonResponse({
      data: table === null ? null : toPriceTableOutput(table, version.currency),
    })
  } catch (error) {
    return errorResponse(error)
  }
}

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
