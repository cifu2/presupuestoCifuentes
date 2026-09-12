/**
 * Test de integración del adaptador de la sonda de salud (ADR-0015 §5).
 *
 * Dos escenarios reales, no dobles:
 * - base de test viva (`TEST_DATABASE_URL`, se salta si no existe, como el resto de integración);
 * - base inalcanzable de verdad: un puerto TCP cerrado en `127.0.0.1`.
 */

import { createServer } from 'node:net'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { createPrismaClient } from './client'
import { PrismaHealthProbe } from './health-probe'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/** Puerto que estaba abierto y se cierra: nadie escucha, así que la conexión se rechaza. */
async function closedPort(): Promise<number> {
  const server = createServer()

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  await new Promise<void>((resolve) => server.close(() => resolve()))

  return port
}

describe.runIf(TEST_DATABASE_URL !== undefined)('PrismaHealthProbe (integración)', () => {
  const prisma = createPrismaClient(TEST_DATABASE_URL ?? '')

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('devuelve ok contra la base real', async () => {
    await expect(new PrismaHealthProbe(prisma).ping()).resolves.toBe('ok')
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
