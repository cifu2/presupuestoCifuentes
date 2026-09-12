/**
 * Test de la sonda de salud (ADR-0015 §5).
 *
 * Cuatro escenarios:
 * - doble del cliente Prisma: la tabla de decisión completa (`ok` / `unmigrated` / `unreachable`)
 *   sin base de datos ni driver;
 * - base de test viva y migrada (`TEST_DATABASE_URL`, se salta si no existe): `ok`;
 * - base real alcanzable pero sin el esquema de la aplicación: se crea un esquema vacío y se apunta
 *   `search_path` a él, de modo que `_prisma_migrations` y `door_series` no se resuelven. Es el modo
 *   de fallo del incidente del 2026-09-11 (ADR-0015, hechos 1-2): la base responde y la sonda no
 *   puede dar `ok`;
 * - base inalcanzable de verdad: un puerto TCP cerrado en `127.0.0.1`.
 */

import { createServer } from 'node:net'

import type { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { createPrismaClient } from './client'
import { PrismaHealthProbe } from './health-probe'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/** Cliente falso: la sonda solo usa `$queryRaw`, así que el doble no necesita nada más. */
function fakePrisma(queryRaw: () => Promise<unknown>): PrismaClient {
  return { $queryRaw: queryRaw } as unknown as PrismaClient
}

function rowWith(hasMigrations: boolean, hasSchema: boolean) {
  return [{ hasMigrations, hasSchema }]
}

/** Puerto que estaba abierto y se cierra: nadie escucha, así que la conexión se rechaza. */
async function closedPort(): Promise<number> {
  const server = createServer()

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  await new Promise<void>((resolve) => server.close(() => resolve()))

  return port
}

/** Añade `search_path` a la cadena de conexión sin pisar otros parámetros. */
function withSearchPath(connectionString: string, schema: string): string {
  const separator = connectionString.includes('?') ? '&' : '?'

  return `${connectionString}${separator}options=${encodeURIComponent(`-c search_path=${schema}`)}`
}

describe('PrismaHealthProbe (doble)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve ok cuando la base responde y tiene esquema e historial de migraciones', async () => {
    const probe = new PrismaHealthProbe(fakePrisma(async () => rowWith(true, true)))

    await expect(probe.ping()).resolves.toBe('ok')
  })

  it('devuelve unmigrated cuando falta el historial de migraciones', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const probe = new PrismaHealthProbe(fakePrisma(async () => rowWith(false, true)))

    await expect(probe.ping()).resolves.toBe('unmigrated')
    expect(errorSpy).toHaveBeenCalledWith(
      '[health] la base de datos responde pero no tiene el esquema migrado',
    )
    // El aviso no lleva detalle del driver ni de la conexión.
    for (const [message] of errorSpy.mock.calls) {
      expect(String(message)).not.toContain('postgres')
    }
  })

  it('devuelve unmigrated cuando falta el esquema del catálogo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const probe = new PrismaHealthProbe(fakePrisma(async () => rowWith(true, false)))

    await expect(probe.ping()).resolves.toBe('unmigrated')
  })

  it('devuelve unmigrated si la consulta no devuelve ninguna fila', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const probe = new PrismaHealthProbe(fakePrisma(async () => []))

    await expect(probe.ping()).resolves.toBe('unmigrated')
  })

  it('devuelve unreachable cuando la consulta falla, sin registrar el error crudo', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const probe = new PrismaHealthProbe(
      fakePrisma(() =>
        Promise.reject(new Error('postgresql://sonda:credencial-secreta@127.0.0.1:5432/sonda')),
      ),
    )

    await expect(probe.ping()).resolves.toBe('unreachable')
    expect(errorSpy).toHaveBeenCalledWith('[health] la base de datos no responde a la sonda')
    for (const [message] of errorSpy.mock.calls) {
      expect(String(message)).not.toContain('credencial-secreta')
    }
  })
})

describe.runIf(TEST_DATABASE_URL !== undefined)('PrismaHealthProbe (integración)', () => {
  const prisma = createPrismaClient(TEST_DATABASE_URL ?? '')
  const emptySchema = `cif144_sin_esquema_${process.pid}`

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('devuelve ok contra la base real migrada', async () => {
    await expect(new PrismaHealthProbe(prisma).ping()).resolves.toBe('ok')
  })

  it('devuelve unmigrated contra una base real sin el esquema de la aplicación', async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${emptySchema}" CASCADE`)
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${emptySchema}"`)

    const client = createPrismaClient(withSearchPath(TEST_DATABASE_URL ?? '', emptySchema))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const health = await new PrismaHealthProbe(client).ping()

      // La base responde de verdad (no es `unreachable`), pero no puede darse por sana.
      expect(health).toBe('unmigrated')
    } finally {
      errorSpy.mockRestore()
      await client.$disconnect()
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${emptySchema}" CASCADE`)
    }
  })
})

describe('PrismaHealthProbe contra una base inalcanzable real', () => {
  it('devuelve unreachable con un puerto cerrado y no filtra la cadena en el log', async () => {
    const port = await closedPort()
    const connectionString = `postgresql://sonda:credencial-secreta@127.0.0.1:${port}/sonda`
    const prisma = createPrismaClient(connectionString)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const startedAt = Date.now()
      const health = await new PrismaHealthProbe(prisma).ping()

      expect(health).toBe('unreachable')
      // `pg` rechaza la conexión al instante; el tope real lo pone el caso de uso (2 s).
      expect(Date.now() - startedAt).toBeLessThan(2000)
      expect(errorSpy).toHaveBeenCalled()
      for (const [message] of errorSpy.mock.calls) {
        expect(String(message)).not.toContain('credencial-secreta')
        expect(String(message)).not.toContain(connectionString)
      }
    } finally {
      errorSpy.mockRestore()
      await prisma.$disconnect()
    }
  })
})
