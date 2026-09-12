import { NextResponse } from 'next/server'

import { getSystemStatus } from '@/application/use-cases/get-system-status'
import { createContainer } from '@/composition/container'
import { env, resolveEnvironment } from '@/config/env'

export const dynamic = 'force-dynamic'

/** Código HTTP de la sonda: 503 cuando la base está configurada pero no responde. */
export const UNREACHABLE_STATUS = 503

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
    { status: database === 'unreachable' ? UNREACHABLE_STATUS : 200 },
  )
}
