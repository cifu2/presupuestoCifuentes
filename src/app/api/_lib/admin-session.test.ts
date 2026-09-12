/**
 * Test del codec de sesión del panel (CIF-241, ADR-0024): emisión, verificación, caducidad,
 * manipulación, rotación de credenciales y fallo cerrado sin configuración.
 */

import { describe, expect, it } from 'vitest'

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  isAdminSessionConfigured,
  issueAdminSession,
  matchesAdminPassword,
  readAdminSessionCookies,
  readCookieValue,
  readCookieValues,
  verifyAdminSession,
  type AdminSessionCredentials,
} from './admin-session'

const SECRET = 's'.repeat(32)
const PASSWORD = 'credencial-de-prueba'
const NOW = new Date('2026-09-12T08:00:00.000Z')

const CREDENTIALS: AdminSessionCredentials = { sessionSecret: SECRET, password: PASSWORD }

function issuedToken(credentials: AdminSessionCredentials = CREDENTIALS): string {
  const issued = issueAdminSession(credentials, NOW)

  if (!issued.ok) throw new Error(`No se pudo emitir la sesión: ${issued.reason}`)

  return issued.token
}

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

describe('issueAdminSession', () => {
  it('emite una sesión de 8 h desde el instante indicado', () => {
    const issued = issueAdminSession(CREDENTIALS, NOW)

    expect(issued).toEqual({
      ok: true,
      token: expect.stringMatching(/^v1\.[\w-]+\.[\w-]+$/),
      expiresAt: new Date(NOW.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000),
    })
  })

  it('no emite nada si falta el secreto o la credencial (falla cerrado)', () => {
    expect(issueAdminSession({ sessionSecret: undefined, password: PASSWORD }, NOW)).toEqual({
      ok: false,
      reason: 'not_configured',
    })
    expect(issueAdminSession({ sessionSecret: SECRET, password: undefined }, NOW)).toEqual({
      ok: false,
      reason: 'not_configured',
    })
  })

  it('no emite nada con un secreto o una credencial demasiado cortos', () => {
    expect(issueAdminSession({ sessionSecret: 's'.repeat(31), password: PASSWORD }, NOW).ok).toBe(
      false,
    )
    expect(issueAdminSession({ sessionSecret: SECRET, password: 'corta' }, NOW).ok).toBe(false)
    expect(
      isAdminSessionConfigured({ sessionSecret: 's'.repeat(32), password: 'p'.repeat(16) }),
    ).toBe(true)
  })
})

describe('verifyAdminSession', () => {
  it('acepta la cookie recién emitida y devuelve su vigencia', () => {
    const verification = verifyAdminSession(CREDENTIALS, issuedToken(), NOW)

    expect(verification).toEqual({
      ok: true,
      session: {
        issuedAt: NOW,
        expiresAt: new Date(NOW.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000),
      },
    })
  })

  it('rechaza una cookie manipulada (payload distinto, firma vieja)', () => {
    const token = issuedToken()
    const tampered = `v1.${b64url({
      iat: Math.floor(NOW.getTime() / 1000),
      exp: Math.floor(NOW.getTime() / 1000) + ADMIN_SESSION_TTL_SECONDS * 10,
    })}.${token.split('.')[2]}`

    expect(verifyAdminSession(CREDENTIALS, tampered, NOW)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    })
  })

  it('rechaza una cookie firmada con otro secreto', () => {
    const token = issuedToken({ sessionSecret: 'x'.repeat(32), password: PASSWORD })

    expect(verifyAdminSession(CREDENTIALS, token, NOW)).toEqual({
      ok: false,
      reason: 'invalid_signature',
    })
  })

  it('invalida las sesiones abiertas cuando rota la credencial del propietario', () => {
    const token = issuedToken()

    expect(
      verifyAdminSession({ sessionSecret: SECRET, password: 'credencial-nueva-1234' }, token, NOW),
    ).toEqual({ ok: false, reason: 'invalid_signature' })
  })

  it('rechaza una cookie caducada', () => {
    const token = issuedToken()
    const expiry = new Date(NOW.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000)

    expect(verifyAdminSession(CREDENTIALS, token, expiry)).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('rechaza una cookie emitida en el futuro más allá del margen de reloj', () => {
    const token = issuedToken()

    expect(verifyAdminSession(CREDENTIALS, token, new Date(NOW.getTime() - 5 * 60 * 1000))).toEqual(
      {
        ok: false,
        reason: 'not_yet_valid',
      },
    )
  })

  it('rechaza cookies malformadas sin llegar a la firma', () => {
    const malformed = [
      undefined,
      '',
      'sin-puntos',
      'v1.solo-dos-partes',
      'v2.abc.def',
      `v1..firma`,
      `v1.${b64url({ iat: 1 })}.firma`,
      `v1.${b64url({ iat: 5, exp: 5 })}.firma`,
      'v1.no-es-base64-valido.%20%20.firma',
    ]

    for (const token of malformed) {
      expect(verifyAdminSession(CREDENTIALS, token, NOW), String(token)).toEqual({
        ok: false,
        reason: 'malformed',
      })
    }
  })

  it('rechaza cualquier cookie si la sesión no está configurada', () => {
    expect(
      verifyAdminSession({ sessionSecret: undefined, password: undefined }, issuedToken(), NOW),
    ).toEqual({ ok: false, reason: 'not_configured' })
  })
})

describe('matchesAdminPassword', () => {
  it('acepta la credencial correcta y rechaza el resto', () => {
    expect(matchesAdminPassword(PASSWORD, PASSWORD)).toBe(true)
    expect(matchesAdminPassword(`${PASSWORD}x`, PASSWORD)).toBe(false)
    expect(matchesAdminPassword('', PASSWORD)).toBe(false)
    expect(matchesAdminPassword(PASSWORD, '')).toBe(false)
  })
})

describe('readCookieValue / readCookieValues', () => {
  it('encuentra una cookie entre varias y tolera espacios', () => {
    expect(readCookieValue('NEXT_LOCALE=en; admin_session=abc; otra=1', ADMIN_SESSION_COOKIE)).toBe(
      'abc',
    )
    expect(readCookieValue('admin_session = abc ', ADMIN_SESSION_COOKIE)).toBe('abc')
  })

  it('devuelve undefined si no está, viene vacía o el encabezado no existe', () => {
    expect(readCookieValue('NEXT_LOCALE=en', ADMIN_SESSION_COOKIE)).toBeUndefined()
    expect(readCookieValue('admin_session=', ADMIN_SESSION_COOKIE)).toBeUndefined()
    expect(readCookieValue(null, ADMIN_SESSION_COOKIE)).toBeUndefined()
  })

  it('devuelve todas las cookies del nombre, en orden, descartando las vacías (N1)', () => {
    expect(
      readCookieValues(
        'admin_session=uno; otra=1; admin_session=dos; admin_session=',
        ADMIN_SESSION_COOKIE,
      ),
    ).toEqual(['uno', 'dos'])
    expect(readCookieValues(null, ADMIN_SESSION_COOKIE)).toEqual([])
  })

  it('lee las cookies de sesión de una petición', () => {
    const request = new Request('http://localhost/es/admin', {
      headers: { cookie: `admin_session=manipulada; admin_session=${issuedToken()}` },
    })

    expect(readAdminSessionCookies(request)).toEqual(['manipulada', issuedToken()])
  })
})
