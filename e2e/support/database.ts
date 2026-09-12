/**
 * Base de datos efímera del E2E (ADR-0027 §5).
 *
 * La suite se ejecuta en modo `prisma` para que la escritura del panel y la lectura del
 * configurador compartan estado (flujo 3): los dos `webServer` de la suite son procesos distintos y,
 * en modo demostración, cada uno tendría su catálogo en memoria (`src/composition/container.ts`).
 *
 * La conexión llega por `DATABASE_URL` —la misma variable que usa la aplicación— y **nunca** apunta
 * a datos reales:
 *
 * - el nombre de la base tiene que delatarse como desechable (`test` o `e2e`), y
 * - cualquier nombre con `prod` aborta sin escribir.
 *
 * El E2E emite presupuestos y publica tarifas, así que la guarda protege tanto la lectura como la
 * escritura: sin credenciales reales en el repositorio (ADR-0014 §1), en CI las inyecta el servicio
 * `postgres` del runner y en local las pone quien levanta la base (docs/e2e-playbook.md).
 */

/** Nombres de base que el E2E acepta: desechables, sembradas en cada ejecución. */
const EPHEMERAL_DATABASE_NAME = /(test|e2e)/i

/** Nombres que nunca se aceptan: el E2E escribe presupuestos y publica tarifas. */
const PRODUCTION_DATABASE_NAME = /prod/i

export class EphemeralDatabaseError extends Error {}

/** Nombre de la base, sin usuario ni contraseña: es lo único que se puede imprimir sin filtrar. */
export function databaseName(connectionString: string): string {
  try {
    return new URL(connectionString).pathname.replace(/^\/+/, '')
  } catch {
    throw new EphemeralDatabaseError(
      'DATABASE_URL no es una cadena de conexión válida; el E2E no puede saber contra qué base corre',
    )
  }
}

/**
 * Valida que la conexión apunta a una base efímera y la devuelve tal cual. El mensaje de error no
 * repite la cadena: puede llevar credenciales.
 */
export function assertEphemeralDatabase(connectionString: string): string {
  const name = databaseName(connectionString)

  if (name === '') {
    throw new EphemeralDatabaseError(
      'DATABASE_URL no lleva el nombre de ninguna base; el E2E no puede confirmar el destino',
    )
  }

  if (PRODUCTION_DATABASE_NAME.test(name)) {
    throw new EphemeralDatabaseError(
      `«${name}» parece una base de producción: el E2E emite presupuestos y publica tarifas, así que no se ejecuta contra ella`,
    )
  }

  if (!EPHEMERAL_DATABASE_NAME.test(name)) {
    throw new EphemeralDatabaseError(
      `«${name}» no se anuncia como base desechable (falta «test» o «e2e» en el nombre): el E2E solo siembra y escribe bases efímeras`,
    )
  }

  return connectionString
}

/**
 * `DATABASE_URL` de la suite hermética. Falla en alto —y con instrucciones— si falta: sin base no
 * hay modo `prisma` y el flujo 3 dejaría de ser observable en silencio, que es justo el fallo que
 * esta tarea cierra.
 */
export function e2eDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL?.trim() ?? ''

  if (connectionString === '') {
    throw new EphemeralDatabaseError(
      [
        'Falta DATABASE_URL: la suite E2E se ejecuta en modo `prisma` contra un PostgreSQL efímero (ADR-0027 §5).',
        'Levanta una base desechable y migra el esquema; el comando completo está en docs/e2e-playbook.md.',
      ].join(' '),
    )
  }

  return assertEphemeralDatabase(connectionString)
}
