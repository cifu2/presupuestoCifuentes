import { createContainer } from '@/composition/container'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { configurationSchema } from '@/app/api/_lib/schemas'
import { issueQuote } from '@/application/use-cases/issue-quote'

export const dynamic = 'force-dynamic'

/**
 * POST /api/quotes — emite un presupuesto con el precio congelado.
 *
 * 201 con el presupuesto emitido (referencia `PC-AAAA-NNNNNN`), o 200 con
 * `status: "manual_quote_required"` cuando la configuración no tiene precio automático.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request, configurationSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const result = await issueQuote(
      {
        seriesRepository: container.seriesRepository,
        tariffPricingRepository: container.tariffPricingRepository,
        colorRepository: container.colorRepository,
        quoteRepository: container.quoteRepository,
        quoteNumberSequence: container.quoteNumberSequence,
        idGenerator: container.idGenerator,
        clock: container.clock,
        validityDays: container.quoteValidityDays,
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

    return jsonResponse(result, result.status === 'issued' ? 201 : 200)
  } catch (error) {
    return errorResponse(error)
  }
}
