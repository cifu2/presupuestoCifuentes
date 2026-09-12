/**
 * Guarda del API del panel.
 *
 * Dos credenciales válidas, ninguna en el repositorio (ADR-0014):
 *
 * - `Authorization: Bearer <ADMIN_API_TOKEN>`: token compartido de operación;
 * - cookie de sesión firmada del panel (CIF-241/ADR-0024), para que la interfaz del propietario
 *   pueda llamar al API sin manejar el token.
 *
 * Falla cerrado: si no hay token **ni** sesión configurados, el endpoint responde `503` y nunca
 * queda accesible por defecto. Sin credencial válida responde `401`.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

import type { NextResponse } from 'next/server'

import { env } from '@/config/env'

import {
  isAdminSessionConfigured,
  readAdminSessionCookies,
  verifyAdminSession,
  type AdminSessionCredentials,
} from './admin-session'
import { jsonResponse } from './http'

export type AdminAuthResult =
  { readonly ok: true } | { readonly ok: false; readonly response: NextResponse }

export interface AdminAuthConfig extends AdminSessionCredentials {
  readonly token: string | undefined
}

function defaultAdminAuthConfig(): AdminAuthConfig {
  return {
    token: env.ADMIN_API_TOKEN,
    sessionSecret: env.ADMIN_SESSION_SECRET,
    password: env.ADMIN_PANEL_PASSWORD,
  }
}

function configuredToken(token: string | undefined): string | undefined {
  return token !== undefined && token.length > 0 ? token : undefined
}

/** Comparación en tiempo constante sobre el digest (las longitudes siempre coinciden). */
export function matchesAdminToken(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()

  return timingSafeEqual(providedDigest, expectedDigest)
}

export function requireAdminToken(
  request: Request,
  expectedToken: string | undefined = env.ADMIN_API_TOKEN,
): AdminAuthResult {
  const token = configuredToken(expectedToken)

  if (token === undefined) {
    return { ok: false, response: adminDisabledResponse() }
  }

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''

  if (provided.length === 0 || !matchesAdminToken(provided, token)) {
    return { ok: false, response: unauthorizedResponse() }
  }

  return { ok: true }
}

/** Acepta el token de operación o la sesión del panel; si no hay ninguna configurada, `503`. */
export function requireAdminAuth(
  request: Request,
  config: AdminAuthConfig = defaultAdminAuthConfig(),
): AdminAuthResult {
  const token = configuredToken(config.token)
  const sessionConfigured = isAdminSessionConfigured(config)

  if (token === undefined && !sessionConfigured) {
    return { ok: false, response: adminDisabledResponse() }
  }

  if (sessionConfigured) {
    const now = new Date()

    // Cualquier cookie del nombre que verifique vale: si un subdominio siembra una copia inválida
    // (N1 de CIF-241), la sesión real sigue funcionando; falsificarla exige la clave de firma.
    if (
      readAdminSessionCookies(request).some((token) => verifyAdminSession(config, token, now).ok)
    ) {
      return { ok: true }
    }
  }

  if (token !== undefined) {
    const header = request.headers.get('authorization') ?? ''
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''

    if (provided.length > 0 && matchesAdminToken(provided, token)) {
      return { ok: true }
    }
  }

  return { ok: false, response: unauthorizedResponse() }
}

function adminDisabledResponse(): NextResponse {
  return jsonResponse(
    { error: { code: 'ADMIN_API_DISABLED', message: 'El API del panel no está configurada' } },
    503,
  )
}

function unauthorizedResponse(): NextResponse {
  return jsonResponse(
    { error: { code: 'UNAUTHORIZED', message: 'Credenciales de administración no válidas' } },
    401,
  )
}
