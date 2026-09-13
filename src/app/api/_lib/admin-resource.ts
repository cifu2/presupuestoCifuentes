/**
 * Utilidades compartidas por las rutas de escritura del panel (CIF-243).
 *
 * El `:id` de una ruta del panel es una columna `@db.Uuid`: un valor con otro formato no puede
 * existir en la base de datos, así que el borde lo corta con `404 NOT_FOUND` **antes** de consultar
 * nada (hallazgo N2 de CIF-85, la misma regla que la ruta de publicación de tarifas). Sin esto, un
 * id legible llegaría a Prisma y PostgreSQL respondería con un error de sintaxis —un `500`— en vez
 * de un «no existe».
 */

import type { NextResponse } from 'next/server'

import { ResourceNotFoundError } from '@/domain/shared/errors'

import { errorResponse } from './http'
import { uuidSchema } from './schemas'

export type ParsedResourceId =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly response: NextResponse }

/** Valida el identificador de ruta; si no es un UUID, la respuesta de error ya está construida. */
export function parseResourceId(raw: string): ParsedResourceId {
  const parsed = uuidSchema.safeParse(raw)

  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(
        new ResourceNotFoundError('No existe ningún recurso con ese identificador'),
      ),
    }
  }

  return { ok: true, id: parsed.data }
}
