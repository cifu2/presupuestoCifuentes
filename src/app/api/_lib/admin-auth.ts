/**
 * Guarda provisional del API del panel (CIF-9/CIF-14).
 *
 * La decisión de accesos del propietario sigue abierta, así que el API de administración no se
 * expone en abierto: exige un token compartido en `Authorization: Bearer …`. Si el token no está
 * configurado, el endpoint responde 503 y **nunca** queda accesible por defecto. Cuando CIF-9 defina
 * la sesión del panel, esta guarda se sustituye por la autenticación real sin tocar los casos de uso.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

import type { NextResponse } from 'next/server'

import { env } from '@/config/env'

import { jsonResponse } from './http'

export type AdminAuthResult =
  { readonly ok: true } | { readonly ok: false; readonly response: NextResponse }

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
  if (expectedToken === undefined || expectedToken.length === 0) {
    return {
      ok: false,
      response: jsonResponse(
        { error: { code: 'ADMIN_API_DISABLED', message: 'El API del panel no está configurada' } },
        503,
      ),
    }
  }

  const header = request.headers.get('authorization') ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''

  if (provided.length === 0 || !matchesAdminToken(provided, expectedToken)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: { code: 'UNAUTHORIZED', message: 'Credenciales de administración no válidas' } },
        401,
      ),
    }
  }

  return { ok: true }
}
