/**
 * Integración del borde HTTP con el **contenedor demo real** (sin mocks): el panel publica contra
 * los ids del catálogo de demostración, así que deben ser UUID válidos para el `:id` del endpoint.
 * Es la regresión R1 de la revisión de CIF-87.
 */

import { describe, expect, it } from 'vitest'

const TOKEN = 'token-de-prueba-suficientemente-largo'
const DEMO_TARIFF_ID = '0192f1b0-0000-7000-8000-000000000101'

process.env.ADMIN_API_TOKEN = TOKEN

const { POST } = await import('./route')

function publish(id: string, token: string | null = TOKEN): Promise<Response> {
  return Promise.resolve(
    new Request(`http://localhost/api/admin/tariff-versions/${id}/publish`, {
      method: 'POST',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    }),
  ).then((request) => POST(request, { params: Promise.resolve({ id }) }))
}

describe('POST /api/admin/tariff-versions/[id]/publish en modo demo', () => {
  it('publica una tarifa del catálogo demo (republicar es idempotente)', async () => {
    const response = await publish(DEMO_TARIFF_ID)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.id).toBe(DEMO_TARIFF_ID)
    expect(body.data.status).toBe('published')
    expect(body.data.publishedAt).not.toBeNull()
  })

  it('responde 401 sin credenciales de administración', async () => {
    const response = await publish(DEMO_TARIFF_ID, null)

    expect(response.status).toBe(401)
  })
})
