import { NextResponse } from 'next/server'

import { getSystemStatus } from '@/application/use-cases/get-system-status'
import { createContainer } from '@/composition/container'
import { env } from '@/config/env'

export const dynamic = 'force-dynamic'

export function GET(): NextResponse {
  const { status, checkedAt } = getSystemStatus(createContainer())

  return NextResponse.json({
    status,
    service: 'cifuentes-presupuestos',
    environment: env.NODE_ENV,
    database: env.DATABASE_URL ? 'configured' : 'unconfigured',
    checkedAt,
  })
}
