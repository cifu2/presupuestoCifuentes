/**
 * Test del borde HTTP de la sesión del panel (CIF-241, ADR-0024): la credencial se comprueba solo
 * en el servidor, la cookie sale HttpOnly y el endpoint falla cerrado sin configuración.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  verifyAdminSession,
} from '../../_lib/admin-session'

const SECRET = 's'.repeat(32)
const PASSWORD = 'credencial-de-prueba'

const state = vi.hoisted(() => ({
  env: {
    ADMIN_SESSION_SECRET: undefined as string | undefined,
    ADMIN_PANEL_PASSWORD: undefined as string | undefined,
  },
}))

vi.mock('@/config/env', () => ({ env: state.env }))

const { POST, DELETE } = await import('./route')

function configure(sessionSecret: string | undefined, password: string | undefined): void {
  state.env.ADMIN_SESSION_SECRET = sessionSecret
  state.env.ADMIN_PANEL_PASSWORD = password
}

function login(
  body: unknown,
  headers: Record<string, string> = {},
  url = 'http://localhost/api/admin/session',
): Promise<Response> {
  return POST(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

describe('POST /api/admin/session', () => {
  it('falla cerrado con 503 si el acceso al panel no está configurado', async () => {
    configure(undefined, undefined)

    const response = await login({ password: PASSWORD })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error.code).toBe('ADMIN_ACCESS_DISABLED')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('no abre sesión con un secreto o una credencial demasiado cortos', async () => {
    configure('corto', 'corta')

    const response = await login({ password: 'corta' })

    expect(response.status).toBe(503)
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('responde 401 con la credencial incorrecta y no emite cookie', async () => {
    configure(SECRET, PASSWORD)

    const response = await login({ password: 'credencial-incorrecta' })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('UNAUTHORIZED')
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('responde 400 si el cuerpo no cumple el contrato', async () => {
    configure(SECRET, PASSWORD)

    expect((await login({})).status).toBe(400)
    expect((await login('no-json')).status).toBe(400)
    expect((await login({ password: '' })).status).toBe(400)
  })

  it('emite una cookie de sesión HttpOnly, SameSite=Lax y de 8 h con la credencial correcta', async () => {
    configure(SECRET, PASSWORD)

    const response = await login({ password: PASSWORD })
    const cookie = response.headers.get('set-cookie') ?? ''
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain(`Max-Age=${ADMIN_SESSION_TTL_SECONDS}`)

    const token = cookie.split(';')[0]?.split('=')[1]
    const verification = verifyAdminSession(
      { sessionSecret: SECRET, password: PASSWORD },
      token,
      new Date(),
    )

    expect(verification.ok).toBe(true)
    expect(body.data.expiresAt).toBe(
      verification.ok ? verification.session.expiresAt.toISOString() : '',
    )
  })

  it('no marca Secure en local (http) y sí detrás de un proxy https', async () => {
    configure(SECRET, PASSWORD)

    const local = await login({ password: PASSWORD })

    expect(local.headers.get('set-cookie')).not.toContain('Secure')

    const forwarded = await login({ password: PASSWORD }, { 'x-forwarded-proto': 'https' })

    expect(forwarded.headers.get('set-cookie')).toContain('Secure')
  })
})

describe('DELETE /api/admin/session', () => {
  it('borra la cookie de sesión', () => {
    const response = DELETE()
    const cookie = response.headers.get('set-cookie') ?? ''

    expect(response.status).toBe(200)
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=;`)
    expect(cookie).toContain('Max-Age=0')
  })
})
