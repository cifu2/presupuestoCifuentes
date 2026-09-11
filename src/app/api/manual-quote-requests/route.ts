import { createContainer } from '@/composition/container'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { manualQuoteRequestSchema } from '@/app/api/_lib/schemas'
import { requestManualQuote } from '@/application/use-cases/request-manual-quote'

export const dynamic = 'force-dynamic'

/**
 * POST /api/manual-quote-requests — el configurador no pudo dar precio y el cliente deja sus datos.
 *
 * El motivo lo recalcula el servidor: si la configuración sí tiene precio, responde 200 con
 * `status: "price_available"` y el desglose. Si se crea la solicitud, 201.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request, manualQuoteRequestSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const result = await requestManualQuote(
      {
        seriesRepository: container.seriesRepository,
        tariffPricingRepository: container.tariffPricingRepository,
        colorRepository: container.colorRepository,
        manualQuoteRequestRepository: container.manualQuoteRequestRepository,
        idGenerator: container.idGenerator,
        clock: container.clock,
      },
      {
        slug: body.data.seriesSlug,
        widthMm: body.data.widthMm,
        heightMm: body.data.heightMm,
        finishId: body.data.finishId,
        colorId: body.data.colorId,
        accessoryIds: body.data.accessoryIds,
        extras: body.data.extras,
        discountCode: body.data.discountCode,
        locale: body.data.locale,
        requestedReason: body.data.customerRequested ? 'customer_requested' : null,
        contact: {
          name: body.data.contact.name,
          email: body.data.contact.email,
          phone: body.data.contact.phone,
          message: body.data.contact.message,
          locale: body.data.locale,
        },
      },
    )

    return jsonResponse(result, result.status === 'created' ? 201 : 200)
  } catch (error) {
    return errorResponse(error)
  }
}
