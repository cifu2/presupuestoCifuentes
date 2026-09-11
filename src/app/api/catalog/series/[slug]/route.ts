import { createContainer } from '@/composition/container'
import { errorResponse, jsonResponse } from '@/app/api/_lib/http'
import { parseLocale } from '@/app/api/_lib/schemas'
import { getSeriesDetail } from '@/application/use-cases/get-series-detail'

export const dynamic = 'force-dynamic'

/** GET /api/catalog/series/:slug?locale=es — ficha de serie con acabados, colores y accesorios. */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const locale = parseLocale(new URL(request.url).searchParams)

  if (!locale.ok) {
    return locale.response
  }

  try {
    const { slug } = await context.params
    const container = createContainer()
    const detail = await getSeriesDetail(
      {
        seriesRepository: container.seriesRepository,
        finishRepository: container.finishRepository,
        colorRepository: container.colorRepository,
        accessoryRepository: container.accessoryRepository,
      },
      { slug, locale: locale.locale },
    )

    return jsonResponse({ data: detail, meta: { locale: locale.locale, mode: container.mode } })
  } catch (error) {
    return errorResponse(error)
  }
}
