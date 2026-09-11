import { createContainer } from '@/composition/container'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { configurationSchema } from '@/app/api/_lib/schemas'
import { calculatePrice } from '@/application/use-cases/calculate-price'

export const dynamic = 'force-dynamic'

/**
 * POST /api/quotes/price — precio en vivo del configurador.
 *
 * Responde 200 con `status: "priced"` (desglose completo) o `status: "manual_quote_required"`
 * con el motivo. El precio lo calcula siempre el servidor.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request, configurationSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const result = await calculatePrice(
      {
        seriesRepository: container.seriesRepository,
        tariffPricingRepository: container.tariffPricingRepository,
        colorRepository: container.colorRepository,
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
      },
    )

    return jsonResponse(result)
  } catch (error) {
    return errorResponse(error)
  }
}
