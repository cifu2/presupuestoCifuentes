import { createContainer } from '@/composition/container'
import { errorResponse, jsonResponse } from '@/app/api/_lib/http'
import { parseLocale } from '@/app/api/_lib/schemas'
import { getQuote } from '@/application/use-cases/get-quote'

export const dynamic = 'force-dynamic'

/** GET /api/quotes/:reference — presupuesto emitido con su desglose congelado. */
export async function GET(
  request: Request,
  context: { params: Promise<{ reference: string }> },
): Promise<Response> {
  const locale = parseLocale(new URL(request.url).searchParams)

  if (!locale.ok) {
    return locale.response
  }

  try {
    const { reference } = await context.params
    const container = createContainer()
    const quote = await getQuote(
      { quoteRepository: container.quoteRepository },
      { reference, locale: locale.locale },
    )

    return jsonResponse({ data: quote })
  } catch (error) {
    return errorResponse(error)
  }
}
