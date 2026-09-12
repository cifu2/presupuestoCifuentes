/**
 * Test del borde HTTP de la sonda de salud (ADR-0015 §5).
 *
 * El contenedor se sustituye por un doble para cubrir los cuatro estados sin base de datos real:
 * `ok` (200), `unreachable` (503), `unmigrated` (503) y `unconfigured` (200, modo demo).
 *
 * El último test sustituye el caso de uso para comprobar que el código HTTP sigue su `status` y no
 * una regla propia del borde: `status` es la única fuente de verdad de la salud (CIF-451).
 */

import { describe, expect, it, vi } from 'vitest'

import type { DatabaseHealth, HealthProbe } from '@/application/ports/health-probe'
import { getSystemStatus } from '@/application/use-cases/get-system-status'

const { createContainer } = vi.hoisted(() => ({ createContainer: vi.fn() }))

vi.mock('@/composition/container', () => ({ createContainer }))

vi.mock('@/application/use-cases/get-system-status', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/application/use-cases/get-system-status')>()

  return { ...actual, getSystemStatus: vi.fn(actual.getSystemStatus) }
})

const { GET, DEGRADED_STATUS } = await import('./route')

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

    expect(response.status).toBe(DEGRADED_STATUS)
    expect(body).toMatchObject({ status: 'degraded', database: 'unreachable' })
  })

  it('responde 503 con database unmigrated cuando la base responde sin esquema', async () => {
    createContainer.mockReturnValue(containerWith(probeReturning('unmigrated')))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(DEGRADED_STATUS)
    expect(body).toMatchObject({ status: 'degraded', database: 'unmigrated' })
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

    expect(response.status).toBe(DEGRADED_STATUS)
    expect(rawBody).not.toContain('postgres')
    expect(rawBody).not.toContain('detalle-del-driver-no-debe-salir')
  })

  it('fija el código HTTP por el status del caso de uso, sin recalcularlo desde database', async () => {
    createContainer.mockReturnValue(containerWith(probeReturning('ok')))
    vi.mocked(getSystemStatus).mockResolvedValueOnce({
      status: 'degraded',
      database: 'unconfigured',
      checkedAt: CHECKED_AT,
    })

    const response = await GET()
    const body = await response.json()

    // `database: unconfigured` es sano por sí solo: si el borde redecidiera la salud a partir de
    // `database`, esta respuesta sería 200 y estaría contradiciendo al caso de uso.
    expect(response.status).toBe(DEGRADED_STATUS)
    expect(body).toMatchObject({ status: 'degraded', database: 'unconfigured' })
  })
})
