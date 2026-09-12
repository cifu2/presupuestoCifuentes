import { errorResponse, jsonResponse, readOptionalJsonBody } from '@/app/api/_lib/http'
import { requireAdminToken } from '@/app/api/_lib/admin-auth'
import { quoteDeliveryRetrySchema } from '@/app/api/_lib/schemas'
import { quoteDeliveryDependencies } from '@/composition/quote-delivery'
import { retryQuoteDeliveries } from '@/application/use-cases/deliver-quote'

export const dynamic = 'force-dynamic'

/**
 * POST /api/quotes/:reference/delivery/retry — reintenta las entregas pendientes o fallidas.
 *
 * No duplica correos: cada entrega tiene su clave de idempotencia y las ya enviadas no se reenvían
 * (ADR-0004 §6). Si no queda nada por enviar responde `200` con `status: "nothing_to_retry"`.
 * Cuerpo opcional: `{ "version": 1 }` para reintentar solo una versión del documento.
 *
 * Una entrega que agotó su tope de intentos (`MAX_QUOTE_DELIVERY_ATTEMPTS`) no se reintenta: queda
 * fallida con el motivo persistido y responde `200` con `status: "attempts_exhausted"` (CIF-186).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ reference: string }> },
): Promise<Response> {
  const auth = requireAdminToken(request)

  if (!auth.ok) {
    return auth.response
  }

  const body = await readOptionalJsonBody(request, quoteDeliveryRetrySchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const { reference } = await context.params
    const result = await retryQuoteDeliveries(quoteDeliveryDependencies(), {
      reference,
      version: body.data.version,
    })

    return jsonResponse(result, result.status === 'incomplete' ? 502 : 200)
  } catch (error) {
    return errorResponse(error)
  }
}
