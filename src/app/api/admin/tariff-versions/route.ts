import { z } from 'zod'

import { requireAdminAuth } from '@/app/api/_lib/admin-auth'
import { errorResponse, jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { uuidSchema } from '@/app/api/_lib/schemas'
import { createTariffVersionDraft } from '@/application/use-cases/create-tariff-version-draft'
import { createContainer } from '@/composition/container'
import { PRICING_STRATEGIES } from '@/domain/catalog/tariff-version'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/tariff-versions — abre la siguiente versión de tarifa en borrador (CIF-126a).
 *
 * Es la puerta de entrada del flujo de edición rápida de precio: una serie cuya última versión está
 * publicada no se puede editar (`409 TARIFF_NOT_EDITABLE`), así que el panel abre un borrador (con la
 * tabla de precios de la vigente clonada, si manda `cloneFromVersionId`), edita sus números con
 * `updateTariffPrice` y lo publica. Abrir el borrador no cambia lo que ve el configurador.
 *
 * La vigencia viaja como fecha ISO (`YYYY-MM-DD`, la columna es `@db.Date`); si se omite, el clon
 * continúa la vigencia de su origen y, sin origen, el borrador empieza el día en que se abre.
 */
const createTariffVersionDraftSchema = z.object({
  // El panel manda el id que le devuelve la lectura de administración: UUID en producción y un id
  // legible en el catálogo de demostración. Un id que no existe (o sin formato de UUID) responde
  // 404, nunca 500: el adaptador Prisma no deja que la columna `@db.Uuid` reviente.
  seriesId: z.string().min(1).max(100),
  cloneFromVersionId: uuidSchema.nullable().default(null),
  validFrom: z.iso.date().nullable().default(null),
  validUntil: z.iso.date().nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
  strategy: z.enum(PRICING_STRATEGIES).nullable().default(null),
  taxRatePercent: z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'El IVA es un porcentaje con dos decimales como máximo')
    .nullable()
    .default(null),
  currency: z.string().length(3).nullable().default(null),
})

export async function POST(request: Request): Promise<Response> {
  const auth = requireAdminAuth(request)

  if (!auth.ok) {
    return auth.response
  }

  const body = await readJsonBody(request, createTariffVersionDraftSchema)

  if (!body.ok) {
    return body.response
  }

  try {
    const container = createContainer()
    const draft = await createTariffVersionDraft(
      {
        tariffVersionRepository: container.tariffVersionRepository,
        seriesRepository: container.seriesRepository,
        idGenerator: container.idGenerator,
        clock: container.clock,
      },
      body.data,
    )

    return jsonResponse({ data: draft }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
