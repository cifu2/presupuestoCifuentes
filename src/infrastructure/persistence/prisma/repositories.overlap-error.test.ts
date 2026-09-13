import { describe, expect, it } from 'vitest'

import type { PrismaClient } from '@prisma/client'

import { makeTariffVersion } from '@/domain/catalog/testing/factories'
import { AmbiguousTariffError } from '@/domain/shared/errors'

import {
  PrismaTariffVersionRepository,
  isDeadlockDetected,
  isPublishedTariffOverlapViolation,
} from './repositories'

/**
 * Test unitario (sin base de datos) del traductor de la violación de la restricción de exclusión
 * de tarifas publicadas (CIF-89). La forma real del error se cubre además en el test de
 * integración contra PostgreSQL; aquí se fija para que un cambio de forma de Prisma no convierta
 * el 409 en un 500 sin que salte ningún test.
 */
describe('isPublishedTariffOverlapViolation', () => {
  // Forma real de Prisma 7 con el adaptador `pg`: `P2039` envolviendo el SQLSTATE 23P01.
  const prismaDriverAdapterError = {
    name: 'PrismaClientKnownRequestError',
    code: 'P2039',
    message:
      'Database error. Code: `23P01`. Message: `conflicting key value violates exclusion constraint',
    meta: {
      modelName: 'TariffVersion',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '23P01',
          kind: 'postgres',
          code: '23P01',
          message:
            'conflicting key value violates exclusion constraint "tariff_version_published_no_overlap"',
        },
      },
    },
  }

  it('reconoce el error del adaptador de Prisma 7 por el SQLSTATE 23P01', () => {
    expect(isPublishedTariffOverlapViolation(prismaDriverAdapterError)).toBe(true)
  })

  it('reconoce el nombre de la restricción aunque falte el código', () => {
    const error = new Error('violates exclusion constraint "tariff_version_published_no_overlap"')

    expect(isPublishedTariffOverlapViolation(error)).toBe(true)
  })

  it('no confunde otras violaciones ni errores ajenos con el solape', () => {
    const unique = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

    expect(isPublishedTariffOverlapViolation(unique)).toBe(false)
    expect(isPublishedTariffOverlapViolation(null)).toBe(false)
    expect(isPublishedTariffOverlapViolation('texto suelto')).toBe(false)
  })

  it('trata cualquier violación de exclusión (23P01) como solape: es el único EXCLUDE del esquema', () => {
    const exclusion = Object.assign(
      new Error('conflicting key value violates exclusion constraint'),
      {
        code: 'P2039',
        meta: { driverAdapterError: { cause: { originalCode: '23P01' } } },
      },
    )

    expect(isPublishedTariffOverlapViolation(exclusion)).toBe(true)
  })

  it('no se queda colgado con referencias circulares', () => {
    const error: { code: string; cause?: unknown } = { code: 'P2039' }
    error.cause = error

    expect(isPublishedTariffOverlapViolation(error)).toBe(false)
  })
})

/**
 * Test unitario del traductor del bloqueo mutuo (CIF-542). PostgreSQL resuelve dos publicaciones
 * solapadas que se cruzan de dos maneras —violación de la restricción de exclusión (23P01) o bloqueo
 * mutuo, abortando una de las dos transacciones (40P01)—, y las dos significan lo mismo para el
 * llamante: la que pierde no ha publicado nada (su transacción se deshace entera) y el borde
 * responde el mismo 409. Sin esta traducción, el desenlace que destapó el rojo intermitente de
 * `calidad` (CIF-542) salía como un 500.
 *
 * La forma de abajo **no está inventada**: es el error que devolvió Prisma 7.10.0 (adaptador `pg`)
 * al forzar un bloqueo mutuo real contra PostgreSQL 17, y el test de integración
 * («la base aborta el cruce de dos transacciones y el adaptador lo reconoce») la vuelve a producir
 * en cada pasada contra la base.
 */
describe('isDeadlockDetected', () => {
  const realDeadlockError = {
    name: 'PrismaClientKnownRequestError',
    code: 'P2034',
    message:
      'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
    meta: {
      modelName: 'TariffVersion',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '40P01',
          originalMessage: 'deadlock detected',
          kind: 'TransactionWriteConflict',
        },
      },
    },
  }

  it('reconoce la forma real de Prisma 7 (P2034 con el SQLSTATE 40P01 anidado)', () => {
    expect(isDeadlockDetected(realDeadlockError)).toBe(true)
  })

  it('reconoce el bloqueo mutuo aunque Prisma deje de anotar el SQLSTATE (solo el `kind`)', () => {
    const withoutSqlstate = {
      code: 'P2034',
      message:
        'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
      meta: { driverAdapterError: { cause: { kind: 'TransactionWriteConflict' } } },
    }

    expect(isDeadlockDetected(withoutSqlstate)).toBe(true)
  })

  it('reconoce el SQLSTATE cuando solo viene dentro del mensaje (camino de consulta cruda)', () => {
    const error = new Error('Raw query failed. Code: `40P01`. Message: `deadlock detected`')

    expect(isDeadlockDetected(error)).toBe(true)
  })

  it('no confunde la violación de exclusión (23P01) ni otros errores con el bloqueo mutuo', () => {
    const exclusion = Object.assign(
      new Error('conflicting key value violates exclusion constraint'),
      { code: 'P2039', meta: { driverAdapterError: { cause: { originalCode: '23P01' } } } },
    )
    const unique = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

    expect(isDeadlockDetected(exclusion)).toBe(false)
    expect(isDeadlockDetected(unique)).toBe(false)
    expect(isDeadlockDetected(null)).toBe(false)
    expect(isDeadlockDetected('texto suelto')).toBe(false)
  })

  it('no se queda colgado con referencias circulares', () => {
    const error: { code: string; cause?: unknown } = { code: 'P2039' }
    error.cause = error

    expect(isDeadlockDetected(error)).toBe(false)
  })
})

/**
 * Traducción del borde en `save` (CIF-89/CIF-542). El test de integración fuerza los dos desenlaces
 * contra PostgreSQL, pero el bloqueo mutuo solo aparece con un entrelazado concreto, así que aquí se
 * fija la cadena completa —error de Prisma → `AmbiguousTariffError` (409)— con las formas reales.
 */
describe('PrismaTariffVersionRepository.save ante una publicación concurrente', () => {
  const repositoryThrowing = (error: unknown): PrismaTariffVersionRepository =>
    new PrismaTariffVersionRepository({
      tariffVersion: {
        upsert: () => Promise.reject(error),
      },
    } as unknown as PrismaClient)

  it('traduce el bloqueo mutuo (40P01/P2034) al error de dominio, no a un 500', async () => {
    const repository = repositoryThrowing({
      name: 'PrismaClientKnownRequestError',
      code: 'P2034',
      message:
        'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
      meta: {
        driverAdapterError: {
          cause: {
            originalCode: '40P01',
            originalMessage: 'deadlock detected',
            kind: 'TransactionWriteConflict',
          },
        },
      },
    })

    await expect(repository.save(makeTariffVersion())).rejects.toThrow(AmbiguousTariffError)
  })

  it('traduce la violación de exclusión (23P01) al mismo error de dominio', async () => {
    const repository = repositoryThrowing({
      name: 'PrismaClientKnownRequestError',
      code: 'P2039',
      message:
        'Database error. Code: `23P01`. Message: `conflicting key value violates exclusion constraint',
      meta: { driverAdapterError: { cause: { originalCode: '23P01', kind: 'postgres' } } },
    })

    await expect(repository.save(makeTariffVersion())).rejects.toThrow(AmbiguousTariffError)
  })

  it('deja pasar cualquier otro error de escritura sin disfrazarlo de solape', async () => {
    const failure = Object.assign(new Error('conexión cerrada'), { code: 'P1017' })
    const repository = repositoryThrowing(failure)

    await expect(repository.save(makeTariffVersion())).rejects.toBe(failure)
  })
})
