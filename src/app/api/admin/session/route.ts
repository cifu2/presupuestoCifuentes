import type { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  isAdminSessionConfigured,
  issueAdminSession,
  matchesAdminPassword,
  type AdminSessionCredentials,
} from '@/app/api/_lib/admin-session'
import { jsonResponse, readJsonBody } from '@/app/api/_lib/http'
import { env } from '@/config/env'

export const dynamic = 'force-dynamic'

/**
 * Sesión de la interfaz del panel (CIF-241, ADR-0024).
 *
 * `POST` canjea la credencial de entorno del propietario (`ADMIN_PANEL_PASSWORD`) por una cookie de
 * sesión firmada; `DELETE` la borra. Falla cerrado: sin secreto de firma o sin credencial
 * configurados responde `503 ADMIN_ACCESS_DISABLED` y nunca abre sesión.
 */
const loginSchema = z.object({
  password: z.string().min(1).max(200),
})

function adminSessionCredentials(): AdminSessionCredentials {
  return { sessionSecret: env.ADMIN_SESSION_SECRET, password: env.ADMIN_PANEL_PASSWORD }
}

function disabledResponse(): NextResponse {
  return jsonResponse(
    {
      error: {
        code: 'ADMIN_ACCESS_DISABLED',
        message: 'El acceso al panel no está configurado en este despliegue',
      },
    },
    503,
  )
}

function unauthorizedResponse(): NextResponse {
  return jsonResponse(
    { error: { code: 'UNAUTHORIZED', message: 'La credencial del panel no es válida' } },
    401,
  )
}

/**
 * La cookie viaja cifrada por HTTPS en cualquier despliegue real. En local (`http://127.0.0.1`) no
 * se marca `Secure` o el navegador la descartaría y el acceso sería imposible.
 */
function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')

  if (forwardedProto !== null) {
    return forwardedProto.split(',')[0]?.trim() === 'https'
  }

  return new URL(request.url).protocol === 'https:'
}

export async function POST(request: Request): Promise<NextResponse> {
  const credentials = adminSessionCredentials()

  if (!isAdminSessionConfigured(credentials)) {
    return disabledResponse()
  }

  const body = await readJsonBody(request, loginSchema)

  if (!body.ok) {
    return body.response
  }

  const expectedPassword = credentials.password

  if (
    expectedPassword === undefined ||
    !matchesAdminPassword(body.data.password, expectedPassword)
  ) {
    return unauthorizedResponse()
  }

  const issued = issueAdminSession(credentials, new Date())

  if (!issued.ok) {
    return disabledResponse()
  }

  const response = jsonResponse({ data: { expiresAt: issued.expiresAt.toISOString() } })

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: issued.token,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  })

  return response
}

export function DELETE(): NextResponse {
  const response = jsonResponse({ data: { status: 'signed_out' } })

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  return response
}
