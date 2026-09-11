import { describe, expect, it } from 'vitest'

import type { Clock } from '@/application/ports/clock'

import { getSystemStatus } from './get-system-status'

const fixedClock = (isoDate: string): Clock => ({
  now: () => new Date(isoDate),
})

describe('getSystemStatus', () => {
  it('devuelve ok con la hora del puerto Clock', () => {
    const status = getSystemStatus({ clock: fixedClock('2026-09-11T10:00:00.000Z') })

    expect(status).toEqual({ status: 'ok', checkedAt: '2026-09-11T10:00:00.000Z' })
  })
})
