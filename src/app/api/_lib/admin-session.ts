/**
 * Sesión firmada del panel de administración (CIF-241, ADR-0024).
 *
 * El panel vive en el mismo despliegue de producción que el configurador (ADR-0007), así que su
 * acceso no se delega en la protección de despliegue de Vercel —que es todo-o-nada por proyecto y
 * dejaría fuera al configurador público (docs/despliegue.md §1)—. En su lugar hay una **cookie de
 * sesión firmada** que emite la página de acceso a cambio de la credencial de entorno del
 * propietario: un único dueño, sin usuarios ni roles (ADR-0023 §7).
 *
 * La firma es HMAC-SHA256 con Node (`node:crypto`); el Proxy de Next.js 16 corre en el runtime de
 * Node por defecto, así que el mismo módulo sirve en el borde y en los route handlers.
 *
 * Nada de esto imprime la credencial ni el secreto: los fallos son motivos cerrados
 * (`not_configured`, `malformed`, `invalid_signature`, `expired`, `not_yet_valid`) y nunca llevan
 * datos personales.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** Nombre de la cookie de sesión del panel. */
export const ADMIN_SESSION_COOKIE = 'admin_session'

/** Duración de la sesión: 8 h, una jornada de trabajo del propietario. */
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60

/** Longitud mínima del secreto de firma (32 caracteres ≈ `openssl rand -hex 16`). */
export const MIN_ADMIN_SESSION_SECRET_LENGTH = 32

/**
 * Longitud mínima de la credencial del propietario. La sesión no se abre con una credencial más
 * corta: la guarda falla cerrada en vez de aceptar una contraseña débil.
 */
export const MIN_ADMIN_PASSWORD_LENGTH = 16

const TOKEN_VERSION = 'v1'

/** Margen de reloj tolerado al validar el `iat` (Vercel y el navegador no van al segundo). */
const CLOCK_SKEW_SECONDS = 60

export interface AdminSessionCredentials {
  readonly sessionSecret: string | undefined
  readonly password: string | undefined
}

export interface AdminSession {
  readonly issuedAt: Date
  readonly expiresAt: Date
}

export type AdminSessionFailure =
  'not_configured' | 'malformed' | 'invalid_signature' | 'expired' | 'not_yet_valid'

export type AdminSessionVerification =
  | { readonly ok: true; readonly session: AdminSession }
  | { readonly ok: false; readonly reason: AdminSessionFailure }

export type AdminSessionIssueResult =
  | { readonly ok: true; readonly token: string; readonly expiresAt: Date }
  | { readonly ok: false; readonly reason: AdminSessionFailure }

interface ConfiguredAdminSessionCredentials {
  readonly sessionSecret: string
  readonly password: string
}

/**
 * Credenciales utilizables o `undefined`. La sesión solo existe si hay secreto de firma y
 * credencial **suficientemente largos**; cualquier otra cosa (ausente, vacía o corta) deja el panel
 * en `503`/denegado: nunca en abierto.
 */
function configuredCredentials(
  credentials: AdminSessionCredentials,
): ConfiguredAdminSessionCredentials | undefined {
  const { sessionSecret, password } = credentials

  if (sessionSecret === undefined || sessionSecret.length < MIN_ADMIN_SESSION_SECRET_LENGTH) {
    return undefined
  }

  if (password === undefined || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return undefined
  }

  return { sessionSecret, password }
}

export function isAdminSessionConfigured(credentials: AdminSessionCredentials): boolean {
  return configuredCredentials(credentials) !== undefined
}

/**
 * Clave de firma derivada del secreto de sesión **y** de la credencial vigente: rotar cualquiera de
 * las dos invalida todas las sesiones emitidas, sin necesidad de una lista de revocación.
 */
function signingKey(credentials: ConfiguredAdminSessionCredentials): Buffer {
  return createHmac('sha256', credentials.sessionSecret)
    .update(`${TOKEN_VERSION}\n${credentials.password}`, 'utf8')
    .digest()
}

function signatureFor(credentials: ConfiguredAdminSessionCredentials, payload: string): string {
  return createHmac('sha256', signingKey(credentials)).update(payload, 'utf8').digest('base64url')
}

function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

/** Emite una sesión nueva. `not_configured` si falta secreto o credencial (falla cerrado). */
export function issueAdminSession(
  credentials: AdminSessionCredentials,
  now: Date,
): AdminSessionIssueResult {
  const configured = configuredCredentials(credentials)

  if (configured === undefined) {
    return { ok: false, reason: 'not_configured' }
  }

  const issuedAt = epochSeconds(now)
  const expiresAt = issuedAt + ADMIN_SESSION_TTL_SECONDS
  const payload = `${TOKEN_VERSION}.${Buffer.from(
    JSON.stringify({ iat: issuedAt, exp: expiresAt }),
    'utf8',
  ).toString('base64url')}`

  return {
    ok: true,
    token: `${payload}.${signatureFor(configured, payload)}`,
    expiresAt: new Date(expiresAt * 1000),
  }
}

function parseSessionPayload(decoded: unknown): { iat: number; exp: number } | undefined {
  if (typeof decoded !== 'object' || decoded === null) return undefined

  const { iat, exp } = decoded as { iat?: unknown; exp?: unknown }

  if (typeof iat !== 'number' || !Number.isInteger(iat)) return undefined
  if (typeof exp !== 'number' || !Number.isInteger(exp)) return undefined

  return { iat, exp }
}

/** Verifica una cookie de sesión: formato, firma y vigencia (con margen de reloj). */
export function verifyAdminSession(
  credentials: AdminSessionCredentials,
  token: string | undefined,
  now: Date,
): AdminSessionVerification {
  const configured = configuredCredentials(credentials)

  if (configured === undefined) {
    return { ok: false, reason: 'not_configured' }
  }

  if (token === undefined || token.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  const parts = token.split('.')

  if (parts.length !== 3) {
    return { ok: false, reason: 'malformed' }
  }

  const [version, encodedPayload, providedSignature] = parts as [string, string, string]

  if (version !== TOKEN_VERSION || encodedPayload.length === 0 || providedSignature.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  // El formato se valida antes de la firma: no se gasta cripto en basura y el motivo del rechazo
  // es más útil en los tests y en los logs (que nunca llevan el token).
  let payload: { iat: number; exp: number } | undefined

  try {
    payload = parseSessionPayload(
      JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')),
    )
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (payload === undefined || payload.exp <= payload.iat) {
    return { ok: false, reason: 'malformed' }
  }

  const expectedSignature = signatureFor(configured, `${version}.${encodedPayload}`)
  const expectedDigest = createHash('sha256').update(expectedSignature, 'utf8').digest()
  const providedDigest = createHash('sha256').update(providedSignature, 'utf8').digest()

  if (!timingSafeEqual(expectedDigest, providedDigest)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  const nowSeconds = epochSeconds(now)

  if (payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'not_yet_valid' }
  }

  if (nowSeconds >= payload.exp) {
    return { ok: false, reason: 'expired' }
  }

  return {
    ok: true,
    session: { issuedAt: new Date(payload.iat * 1000), expiresAt: new Date(payload.exp * 1000) },
  }
}

/** Comparación en tiempo constante sobre el digest (las longitudes siempre coinciden). */
export function matchesAdminPassword(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()

  return timingSafeEqual(providedDigest, expectedDigest)
}

/**
 * Lee **todas** las cookies del nombre indicado. Un mismo nombre puede viajar repetido (p. ej. una
 * cookie sembrada desde un subdominio, N1 de CIF-241): quien verifique credenciales debe poder
 * probarlas todas en vez de quedarse con la primera.
 */
export function readCookieValues(cookieHeader: string | null, name: string): string[] {
  if (cookieHeader === null || cookieHeader.length === 0) return []

  const values: string[] = []

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')

    if (separator === -1) continue

    if (part.slice(0, separator).trim() !== name) continue

    const value = part.slice(separator + 1).trim()

    if (value.length > 0) values.push(value)
  }

  return values
}

/**
 * Primera cookie del nombre indicado (`readCookieValues` si hay que probar más de una).
 */
export function readCookieValue(cookieHeader: string | null, name: string): string | undefined {
  return readCookieValues(cookieHeader, name)[0]
}

/** Cookies de sesión del panel de una petición (puede haber más de una con el mismo nombre). */
export function readAdminSessionCookies(request: Request): string[] {
  return readCookieValues(request.headers.get('cookie'), ADMIN_SESSION_COOKIE)
}
