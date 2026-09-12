import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Clock } from '@/application/ports/clock'
import type { DatabaseHealth, HealthProbe } from '@/application/ports/health-probe'

import { HEALTH_PROBE_TIMEOUT_MS, getSystemStatus } from './get-system-status'

const fixedClock = (isoDate: string): Clock => ({
  now: () => new Date(isoDate),
})

const CHECKED_AT = '2026-09-11T10:00:00.000Z'

const probeReturning = (health: DatabaseHealth): HealthProbe => ({ ping: async () => health })

describe('getSystemStatus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devuelve ok y database ok cuando la sonda responde', async () => {
    const status = await getSystemStatus({
      clock: fixedClock(CHECKED_AT),
      healthProbe: probeReturning('ok'),
    })

    expect(status).toEqual({ status: 'ok', database: 'ok', checkedAt: CHECKED_AT })
  })

  it('devuelve degraded y database unreachable cuando la sonda falla', async () => {
    const status = await getSystemStatus({
      clock: fixedClock(CHECKED_AT),
      healthProbe: probeReturning('unreachable'),
    })

    expect(status).toEqual({ status: 'degraded', database: 'unreachable', checkedAt: CHECKED_AT })
  })

  it('devuelve ok y database unconfigured sin base de datos (healthProbe null)', async () => {
    const status = await getSystemStatus({ clock: fixedClock(CHECKED_AT), healthProbe: null })

    expect(status).toEqual({ status: 'ok', database: 'unconfigured', checkedAt: CHECKED_AT })
  })

  it('trata una sonda que lanza como unreachable sin propagar el error', async () => {
    const status = await getSystemStatus({
      clock: fixedClock(CHECKED_AT),
      healthProbe: {
        ping: () => Promise.reject(new Error('detalle-del-driver-no-debe-salir')),
      },
    })

    expect(status).toEqual({ status: 'degraded', database: 'unreachable', checkedAt: CHECKED_AT })
  })

  it('trata una sonda que no responde en 2 s como unreachable', async () => {
    vi.useFakeTimers()

    const pending = getSystemStatus({
      clock: fixedClock(CHECKED_AT),
      healthProbe: { ping: () => new Promise<never>(() => {}) },
    })

    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({
      status: 'degraded',
      database: 'unreachable',
      checkedAt: CHECKED_AT,
    })
  })
})
