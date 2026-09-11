import { describe, expect, it } from 'vitest'

import { isPublishedTariffOverlapViolation } from './repositories'

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
