import { describe, expect, it } from 'vitest'

import { matchesAdminToken, requireAdminAuth, requireAdminToken } from './admin-auth'
import { ADMIN_SESSION_COOKIE, issueAdminSession } from './admin-session'

const TOKEN = 'token-de-prueba-suficientemente-largo'

function request(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/admin/tariff-versions/x/publish', {
    method: 'POST',
    headers,
  })
}

describe('requireAdminToken', () => {
  it('acepta el token correcto en Authorization: Bearer', async () => {
    const result = requireAdminToken(request({ authorization: `Bearer ${TOKEN}` }), TOKEN)

    expect(result.ok).toBe(true)
  })

  it('rechaza con 401 si falta el token o no coincide', async () => {
    const missing = requireAdminToken(request(), TOKEN)
    const wrong = requireAdminToken(request({ authorization: 'Bearer otro-token' }), TOKEN)

    expect(missing.ok).toBe(false)
    expect(wrong.ok).toBe(false)

    if (!missing.ok && !wrong.ok) {
      expect(missing.response.status).toBe(401)
      expect(wrong.response.status).toBe(401)
      await expect(wrong.response.json()).resolves.toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Credenciales de administración no válidas' },
      })
    }
  })

  it('falla cerrado con 503 si el token no está configurado', async () => {
    const result = requireAdminToken(request({ authorization: `Bearer ${TOKEN}` }), undefined)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.response.status).toBe(503)
    }
  })
})

describe('matchesAdminToken', () => {
  it('compara cadenas sin filtrar la longitud por cortocircuito', () => {
    expect(matchesAdminToken('abc', 'abc')).toBe(true)
    expect(matchesAdminToken('abc', 'abd')).toBe(false)
    expect(matchesAdminToken('', 'abc')).toBe(false)
  })
})

describe('requireAdminAuth', () => {
  const SECRET = 's'.repeat(32)
  const PASSWORD = 'credencial-de-prueba'
  const SESSION_ONLY = { token: undefined, sessionSecret: SECRET, password: PASSWORD }
  const BOTH = { token: TOKEN, sessionSecret: SECRET, password: PASSWORD }
  const NOTHING = { token: undefined, sessionSecret: undefined, password: undefined }

  function sessionCookie(now: Date): string {
    const issued = issueAdminSession({ sessionSecret: SECRET, password: PASSWORD }, now)

    if (!issued.ok) throw new Error('No se pudo emitir la sesión de prueba')

    return `${ADMIN_SESSION_COOKIE}=${issued.token}`
  }

  it('acepta la sesión del panel sin token de operación', () => {
    const result = requireAdminAuth(request({ cookie: sessionCookie(new Date()) }), SESSION_ONLY)

    expect(result.ok).toBe(true)
  })

  it('acepta la sesión aunque el nombre de cookie vaya repetido (N1)', () => {
    const header = `${ADMIN_SESSION_COOKIE}=manipulada; ${sessionCookie(new Date())}`
    const result = requireAdminAuth(request({ cookie: header }), SESSION_ONLY)

    expect(result.ok).toBe(true)
  })

  it('acepta el token de operación sin sesión configurada', () => {
    const result = requireAdminAuth(request({ authorization: `Bearer ${TOKEN}` }), {
      token: TOKEN,
      sessionSecret: undefined,
      password: undefined,
    })

    expect(result.ok).toBe(true)
  })

  it('rechaza con 401 si la cookie no es válida aunque haya token configurado', () => {
    const result = requireAdminAuth(request({ cookie: `${ADMIN_SESSION_COOKIE}=manipulada` }), BOTH)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.response.status).toBe(401)
    }
  })

  it('rechaza con 401 una sesión caducada', () => {
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const result = requireAdminAuth(request({ cookie: sessionCookie(expired) }), SESSION_ONLY)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.response.status).toBe(401)
    }
  })

  it('falla cerrado con 503 si no hay token ni sesión configurados', () => {
    const result = requireAdminAuth(request(), NOTHING)

    expect(result.ok).toBe(false)

    if (!result.ok) {
      expect(result.response.status).toBe(503)
    }
  })
})
