import { describe, expect, it } from 'vitest'

import { matchesAdminToken, requireAdminToken } from './admin-auth'

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
