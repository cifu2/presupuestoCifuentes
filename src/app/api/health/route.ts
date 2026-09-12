import { NextResponse } from 'next/server'

import { getSystemStatus } from '@/application/use-cases/get-system-status'
import { createContainer } from '@/composition/container'
import { env, resolveEnvironment } from '@/config/env'

export const dynamic = 'force-dynamic'

/**
 * Código HTTP de la sonda: 503 cuando la base está configurada pero no está sana, ya sea porque no
 * responde (`unreachable`) o porque responde sin esquema migrado (`unmigrated`).
 */
export const DEGRADED_STATUS = 503

export async function GET(): Promise<NextResponse> {
  const { status, database, checkedAt } = await getSystemStatus(createContainer())
  const degraded = database === 'unreachable' || database === 'unmigrated'

  return NextResponse.json(
    {
      status,
      service: 'cifuentes-presupuestos',
      environment: resolveEnvironment(env),
      database,
      checkedAt,
    },
    { status: degraded ? DEGRADED_STATUS : 200 },
  )
}
