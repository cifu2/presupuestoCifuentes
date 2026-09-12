import { NextResponse } from 'next/server'

import { getSystemStatus } from '@/application/use-cases/get-system-status'
import { createContainer } from '@/composition/container'
import { env, resolveEnvironment } from '@/config/env'

export const dynamic = 'force-dynamic'

/**
 * Código HTTP de la sonda: 503 cuando `getSystemStatus` no da el sistema por sano, es decir, cuando
 * la base está configurada pero no está sana (no responde o responde sin esquema migrado).
 *
 * El borde HTTP no redecide la salud a partir de `database`: `status` del caso de uso es la única
 * fuente de verdad (CIF-451). Así una regla nueva del caso de uso (otro modo de fallo, otro estado
 * sano) no puede quedar contradicha por la ruta.
 */
export const DEGRADED_STATUS = 503

export async function GET(): Promise<NextResponse> {
  const { status, database, checkedAt } = await getSystemStatus(createContainer())

  return NextResponse.json(
    {
      status,
      service: 'cifuentes-presupuestos',
      environment: resolveEnvironment(env),
      database,
      checkedAt,
    },
    { status: status === 'ok' ? 200 : DEGRADED_STATUS },
  )
}
