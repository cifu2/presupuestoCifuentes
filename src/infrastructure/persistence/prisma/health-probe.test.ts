/**
 * Test de la sonda de salud (ADR-0015 §5).
 *
 * Escenarios sin base de datos (doble del pool):
 * - tabla de decisión completa (`ok` / `unmigrated` / `unreachable`);
 * - cancelación: al abortarse la señal se destruye la conexión que ejecuta la consulta, de modo que
 *   no queda ninguna consulta en vuelo (CIF-451).
 *
 * Con base real (`TEST_DATABASE_URL`, se salta si no existe):
 * - base de test viva y migrada (`ok`);
 * - base real alcanzable pero sin el esquema de la aplicación: se crea un esquema vacío y se apunta
 *   `search_path` a él, de modo que `_prisma_migrations` y `door_series` no se resuelven. Es el modo
 *   de fallo del incidente del 2026-09-11 (ADR-0015, hechos 1-2): la base responde y la sonda no
 *   puede dar `ok`;
 * - base inalcanzable de verdad: un puerto TCP cerrado en `127.0.0.1`;
 * - `release(true)` corta de verdad una consulta colgada: es la primitiva en la que se apoya la
 *   cancelación de la sonda.
 */

import { createServer } from 'node:net'

import pg, { type Pool } from 'pg'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { HEALTH_PROBE_TIMEOUT_MS } from '@/application/use-cases/get-system-status'

import { PgHealthProbe } from './health-probe'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

type SchemaPresenceRow = { hasMigrations: boolean; hasSchema: boolean }

function rowWith(hasMigrations: boolean, hasSchema: boolean): { rows: SchemaPresenceRow[] } {
  return { rows: [{ hasMigrations, hasSchema }] }
}

/** Pool doble: la sonda solo usa `connect`, y el cliente solo `query` y `release`. */
function fakePool(query: () => Promise<{ rows: SchemaPresenceRow[] }>) {
  const releases: Array<boolean | undefined> = []
  let connects = 0

  const client = {
    query,
    release: (destroy?: boolean) => {
      releases.push(destroy)
    },
  }

  const pool = {
    connect: async () => {
      connects += 1

      return client
    },
  } as unknown as Pool

  return { pool, releases, connects: () => connects }
}

/**
 * Pool doble que imita a `pg`: mientras hay una consulta en vuelo, `release(true)` destruye la
 * conexión y la consulta rechaza. Si la cancelación no llegara al socket, la consulta seguiría en
 * vuelo y el test lo detecta.
 */
function hangingPool() {
  const releases: Array<boolean | undefined> = []
  let rejectQuery: ((error: Error) => void) | undefined
  let inFlight = false

  const client = {
    query: () => {
      inFlight = true

      return new Promise<never>((_resolve, reject) => {
        rejectQuery = reject
      }).finally(() => {
        inFlight = false
      })
    },
    release: (destroy?: boolean) => {
      releases.push(destroy)

      if (destroy === true) {
        rejectQuery?.(new Error('Connection terminated unexpectedly'))
      }
    },
  }

  const pool = { connect: async () => client } as unknown as Pool

  return { pool, releases, queryInFlight: () => inFlight }
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

describe('PgHealthProbe (doble)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('devuelve ok cuando la base responde y tiene esquema e historial de migraciones', async () => {
    const { pool } = fakePool(async () => rowWith(true, true))

    await expect(new PgHealthProbe(pool).ping()).resolves.toBe('ok')
  })

  it('devuelve unmigrated cuando falta el historial de migraciones', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { pool } = fakePool(async () => rowWith(false, true))

    await expect(new PgHealthProbe(pool).ping()).resolves.toBe('unmigrated')
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
    const { pool } = fakePool(async () => rowWith(true, false))

    await expect(new PgHealthProbe(pool).ping()).resolves.toBe('unmigrated')
  })

  it('devuelve unmigrated si la consulta no devuelve ninguna fila', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { pool } = fakePool(async () => ({ rows: [] }))

    await expect(new PgHealthProbe(pool).ping()).resolves.toBe('unmigrated')
  })

  it('devuelve unreachable cuando la consulta falla, sin registrar el error crudo', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { pool } = fakePool(() =>
      Promise.reject(new Error('postgresql://sonda:credencial-secreta@127.0.0.1:5432/sonda')),
    )

    await expect(new PgHealthProbe(pool).ping()).resolves.toBe('unreachable')
    expect(errorSpy).toHaveBeenCalledWith('[health] la base de datos no responde a la sonda')
    for (const [message] of errorSpy.mock.calls) {
      expect(String(message)).not.toContain('credencial-secreta')
    }
  })

  it('devuelve unreachable sin consultar si la señal ya está abortada', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { pool, connects } = fakePool(async () => rowWith(true, true))
    const controller = new AbortController()

    controller.abort()

    await expect(new PgHealthProbe(pool).ping({ signal: controller.signal })).resolves.toBe(
      'unreachable',
    )
    expect(connects()).toBe(0)
    // Cancelar no es un fallo de la base: no se registra como tal.
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('devuelve la conexión al pool cuando la consulta termina', async () => {
    const { pool, releases } = fakePool(async () => rowWith(true, true))

    await expect(new PgHealthProbe(pool).ping()).resolves.toBe('ok')
    expect(releases).toEqual([undefined])
  })

  it('destruye la conexión y no deja la consulta en vuelo cuando la señal se aborta', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { pool, releases, queryInFlight } = hangingPool()
    const controller = new AbortController()
    const pending = new PgHealthProbe(pool).ping({ signal: controller.signal })

    // `ping` es asíncrono: la consulta arranca después del `connect` del pool.
    await vi.waitFor(() => {
      expect(queryInFlight()).toBe(true)
    })

    controller.abort()

    await expect(pending).resolves.toBe('unreachable')
    // Una sola devolución, y es la que destruye: la conexión no vuelve al pool con la consulta viva.
    expect(releases).toEqual([true])
    expect(queryInFlight()).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith(
      '[health] la sonda de la base de datos se canceló al agotarse el tiempo de espera',
    )
  })
})

describe.runIf(TEST_DATABASE_URL !== undefined)('PgHealthProbe (integración)', () => {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL, max: 1 })
  const emptySchema = `cif451_sin_esquema_${process.pid}`

  afterAll(async () => {
    await pool.end()
  })

  it('devuelve ok contra la base real migrada', async () => {
    await expect(new PgHealthProbe(pool).ping()).resolves.toBe('ok')
  })

  it('devuelve unmigrated contra una base real sin el esquema de la aplicación', async () => {
    await pool.query(`DROP SCHEMA IF EXISTS "${emptySchema}" CASCADE`)
    await pool.query(`CREATE SCHEMA "${emptySchema}"`)

    const emptyPool = new pg.Pool({
      connectionString: withSearchPath(TEST_DATABASE_URL ?? '', emptySchema),
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      // La base responde de verdad (no es `unreachable`), pero no puede darse por sana.
      await expect(new PgHealthProbe(emptyPool).ping()).resolves.toBe('unmigrated')
    } finally {
      errorSpy.mockRestore()
      await emptyPool.end()
      await pool.query(`DROP SCHEMA IF EXISTS "${emptySchema}" CASCADE`)
    }
  })

  it('corta de verdad una consulta colgada al destruir la conexión (primitiva de la cancelación)', async () => {
    const client = await pool.connect()
    const startedAt = Date.now()
    const hanging = client.query('SELECT pg_sleep(30)')

    // Deja que la consulta llegue al servidor antes de destruir la conexión.
    await new Promise((resolve) => setImmediate(resolve))
    client.release(true)

    await expect(hanging).rejects.toThrow()
    expect(Date.now() - startedAt).toBeLessThan(HEALTH_PROBE_TIMEOUT_MS)
  })
})

describe('PgHealthProbe contra una base inalcanzable real', () => {
  it('devuelve unreachable con un puerto cerrado y no filtra la cadena en el log', async () => {
    const port = await closedPort()
    const connectionString = `postgresql://sonda:credencial-secreta@127.0.0.1:${port}/sonda`
    const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 1000 })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const startedAt = Date.now()
      const health = await new PgHealthProbe(pool).ping()

      expect(health).toBe('unreachable')
      // `pg` rechaza la conexión al instante; el tope real lo pone el caso de uso (2 s).
      expect(Date.now() - startedAt).toBeLessThan(HEALTH_PROBE_TIMEOUT_MS)
      expect(errorSpy).toHaveBeenCalled()
      for (const [message] of errorSpy.mock.calls) {
        expect(String(message)).not.toContain('credencial-secreta')
        expect(String(message)).not.toContain(connectionString)
      }
    } finally {
      errorSpy.mockRestore()
      await pool.end()
    }
  })
})
