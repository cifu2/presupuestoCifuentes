import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { requireAdminToken } from '@/app/api/_lib/admin-auth'
import { quoteDeliverySchema } from '@/app/api/_lib/schemas'
import { quoteDeliveryDependencies } from '@/composition/quote-delivery'
import { deliverQuote } from '@/application/use-cases/deliver-quote'

export const dynamic = 'force-dynamic'

/**
 * POST /api/quotes/:reference/delivery — entrega el presupuesto en PDF y por email.
 *
 * El orden es el de ADR-0004 §5: el presupuesto ya está persistido, la entrega queda registrada
 * antes de renderizar y, si algo falla, responde `502` con el detalle por destinatario sin perder
 * el presupuesto (se reintenta con `/delivery/retry`). Si la entrega ya gastó sus intentos responde
 * `200` con `status: "attempts_exhausted"`: es terminal, no un error del cliente (CIF-186).
 *
 * Va detrás de la guarda del API del panel (CIF-9/CIF-14): enviar correo es una acción con coste y
 * superficie de abuso, así que no queda abierta mientras el propietario no decida quién la lanza.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ reference: string }> },
): Promise<Response> {
  const auth = requireAdminToken(request)

  if (!auth.ok) {
    return auth.response
  }

  const body = await readJsonBody(request, quoteDeliverySchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const { reference } = await context.params
    const result = await deliverQuote(quoteDeliveryDependencies(), {
      reference,
      version: body.data.version,
      customer: body.data.customer,
    })

    return jsonResponse(result, result.status === 'incomplete' ? 502 : 200)
  } catch (error) {
    return errorResponse(error)
  }
}
