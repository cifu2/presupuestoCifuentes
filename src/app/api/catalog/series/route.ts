import { createContainer } from '@/composition/container'
import { errorResponse, jsonResponse } from '@/app/api/_lib/http'
import { parseLocale } from '@/app/api/_lib/schemas'
import { getPublishedSeries } from '@/application/use-cases/get-published-series'

export const dynamic = 'force-dynamic'

/** GET /api/catalog/series?locale=es — series publicadas para el configurador. */
export async function GET(request: Request): Promise<Response> {
  const locale = parseLocale(new URL(request.url).searchParams)

  if (!locale.ok) {
    return locale.response
  }

  try {
    const container = createContainer()
    const series = await getPublishedSeries(
      { seriesRepository: container.seriesRepository },
      { locale: locale.locale },
    )

    return jsonResponse({ data: series, meta: { locale: locale.locale, mode: container.mode } })
  } catch (error) {
    return errorResponse(error)
  }
}
