import type { Clock } from '@/application/ports/clock'

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}

/**
 * Reloj fijo: devuelve siempre el mismo instante. Se usa en tests de integración para que la
 * vigencia de tarifas y la validez de los presupuestos sean deterministas.
 */
export class CurrentInstantClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return this.instant
  }
}
