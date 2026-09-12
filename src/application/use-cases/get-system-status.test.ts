import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Clock } from '@/application/ports/clock'
import type {
  DatabaseHealth,
  HealthProbe,
  HealthProbeOptions,
} from '@/application/ports/health-probe'

import { HEALTH_PROBE_TIMEOUT_MS, getSystemStatus } from './get-system-status'

const fixedClock = (isoDate: string): Clock => ({
  now: () => new Date(isoDate),
})

const CHECKED_AT = '2026-09-11T10:00:00.000Z'

const probeReturning = (health: DatabaseHealth): HealthProbe => ({ ping: async () => health })

/** Sonda que no responde nunca y deja ver la señal que le pasa el caso de uso. */
function hangingProbe(): { healthProbe: HealthProbe; signal: () => AbortSignal | undefined } {
  let received: AbortSignal | undefined

  return {
    healthProbe: {
      ping: (options: HealthProbeOptions = {}) => {
        received = options.signal

        return new Promise<never>(() => {})
      },
    },
    signal: () => received,
  }
}

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

  it('devuelve degraded y database unmigrated cuando la base responde sin esquema', async () => {
    const status = await getSystemStatus({
      clock: fixedClock(CHECKED_AT),
      healthProbe: probeReturning('unmigrated'),
    })

    expect(status).toEqual({ status: 'degraded', database: 'unmigrated', checkedAt: CHECKED_AT })
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

    const { healthProbe } = hangingProbe()
    const pending = getSystemStatus({ clock: fixedClock(CHECKED_AT), healthProbe })

    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({
      status: 'degraded',
      database: 'unreachable',
      checkedAt: CHECKED_AT,
    })
  })

  it('pasa a la sonda una señal de cancelación', async () => {
    vi.useFakeTimers()

    const { healthProbe, signal } = hangingProbe()
    const pending = getSystemStatus({ clock: fixedClock(CHECKED_AT), healthProbe })

    expect(signal()).toBeInstanceOf(AbortSignal)

    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_TIMEOUT_MS)
    await pending
  })

  it('aborta la señal al agotarse el tope, para que el adaptador cancele la consulta', async () => {
    vi.useFakeTimers()

    const { healthProbe, signal } = hangingProbe()
    const pending = getSystemStatus({ clock: fixedClock(CHECKED_AT), healthProbe })

    expect(signal()?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(HEALTH_PROBE_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({
      status: 'degraded',
      database: 'unreachable',
      checkedAt: CHECKED_AT,
    })
    expect(signal()?.aborted).toBe(true)
  })

  it('no aborta la señal cuando la sonda responde dentro del tope', async () => {
    let received: AbortSignal | undefined

    const status = await getSystemStatus({
      clock: fixedClock(CHECKED_AT),
      healthProbe: {
        ping: async (options: HealthProbeOptions = {}) => {
          received = options.signal

          return 'ok'
        },
      },
    })

    expect(status.status).toBe('ok')
    expect(received?.aborted).toBe(false)
  })
})
