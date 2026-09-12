/**
 * Test del borde HTTP de la sonda de salud (ADR-0015 §5).
 *
 * El contenedor se sustituye por un doble para cubrir los tres estados sin base de datos real:
 * `ok` (200), `unreachable` (503) y `unconfigured` (200, modo demo).
 */

import { describe, expect, it, vi } from 'vitest'

import type { DatabaseHealth, HealthProbe } from '@/application/ports/health-probe'

const { createContainer } = vi.hoisted(() => ({ createContainer: vi.fn() }))

vi.mock('@/composition/container', () => ({ createContainer }))

const { GET, UNREACHABLE_STATUS } = await import('./route')

const CHECKED_AT = '2026-09-11T10:00:00.000Z'

function containerWith(healthProbe: HealthProbe | null) {
  return {
    mode: healthProbe === null ? 'demo' : 'prisma',
    clock: { now: () => new Date(CHECKED_AT) },
    healthProbe,
  }
}

const probeReturning = (health: DatabaseHealth): HealthProbe => ({ ping: async () => health })

describe('GET /api/health', () => {
  it('responde 200 con database ok cuando la base responde', async () => {
    createContainer.mockReturnValue(containerWith(probeReturning('ok')))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: 'ok',
      service: 'cifuentes-presupuestos',
      database: 'ok',
      checkedAt: CHECKED_AT,
    })
  })

  it('responde 503 con database unreachable cuando la base no responde', async () => {
    createContainer.mockReturnValue(containerWith(probeReturning('unreachable')))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(UNREACHABLE_STATUS)
    expect(body).toMatchObject({ status: 'degraded', database: 'unreachable' })
  })

  it('responde 200 con database unconfigured en modo demo', async () => {
    createContainer.mockReturnValue(containerWith(null))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ status: 'ok', database: 'unconfigured' })
  })

  it('no expone la cadena de conexión cuando la base falla', async () => {
    createContainer.mockReturnValue(
      containerWith({
        ping: () => Promise.reject(new Error('detalle-del-driver-no-debe-salir')),
      }),
    )

    const response = await GET()
    const rawBody = await response.text()

    expect(response.status).toBe(UNREACHABLE_STATUS)
    expect(rawBody).not.toContain('postgres')
    expect(rawBody).not.toContain('detalle-del-driver-no-debe-salir')
  })
})
