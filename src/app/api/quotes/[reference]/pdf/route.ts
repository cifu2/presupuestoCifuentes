import { errorResponse } from '@/app/api/_lib/http'
import { quoteDeliveryDependencies } from '@/composition/quote-delivery'
import { renderQuotePdf } from '@/application/use-cases/render-quote-pdf'
import { quoteDocumentFileName } from '@/domain/quote/quote-document'

export const dynamic = 'force-dynamic'

/**
 * GET /api/quotes/:reference/pdf — descarga inmediata del presupuesto (ADR-0004 §1).
 *
 * Solo lectura: no envía correo ni cambia el estado del presupuesto. El PDF sale en el idioma
 * guardado en el presupuesto (ADR-0005) y `404 NOT_FOUND` si la referencia no existe.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ reference: string }> },
): Promise<Response> {
  try {
    const { reference } = await context.params
    const { document, pdf } = await renderQuotePdf(quoteDeliveryDependencies(), { reference })

    // Copia con `ArrayBuffer` propio: el cuerpo de la respuesta no comparte memoria con el Buffer
    // interno del renderizador.
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${quoteDocumentFileName(document)}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
