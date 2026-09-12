/**
 * Servidores que levanta la suite E2E (CIF-86).
 *
 * Las guardas del panel tienen dos comportamientos excluyentes según el entorno del **servidor**: el
 * API responde `503` sin `ADMIN_API_TOKEN` y exige credenciales con él (`401`), y el acceso a la
 * interfaz (`/[locale]/admin`, CIF-241) redirige al acceso sin `ADMIN_SESSION_SECRET` ni
 * `ADMIN_PANEL_PASSWORD` y abre sesión con ellos. No se pueden observar en el mismo proceso, así que
 * la suite levanta dos servidores de producción: el principal, sin ninguna credencial, y el de
 * administración, con token y sesión. Este módulo es la única fuente de sus puertos y credenciales,
 * compartida por `playwright.config.ts` y por los specs.
 *
 * Los valores por defecto son de pruebas: el token no es un secreto real y vive en el repositorio a
 * propósito, porque el E2E lo usa contra su propio servidor (Definition of Done, apartado
 * _Seguridad_: nada de credenciales reales).
 */

function readPort(name: string, fallback: string): string {
  const value = process.env[name]

  return value === undefined || value.trim() === '' ? fallback : value
}

export const E2E_PORT = readPort('E2E_PORT', '3000')

/** Puerto del servidor con `ADMIN_API_TOKEN`; por defecto, el siguiente al principal. */
export const E2E_ADMIN_PORT = readPort('E2E_ADMIN_PORT', String(Number(E2E_PORT) + 1))

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`

export const E2E_ADMIN_BASE_URL =
  process.env.E2E_ADMIN_BASE_URL ?? `http://127.0.0.1:${E2E_ADMIN_PORT}`

/** Token del servidor de administración del E2E. No es un secreto: es un valor de pruebas. */
export const E2E_ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN ?? 'token-de-e2e-solo-para-pruebas'

/**
 * Buzón interno (aviso al comercial) que configura el servidor de administración del E2E. Es un
 * valor de pruebas: la entrega de CIF-173 no envía correo real, usa el adaptador de consola.
 */
export const E2E_SALES_MAILBOX = 'avisos-presupuestos@example.com'

/**
 * Sesión del panel en el servidor de administración (CIF-241): secreto de firma y credencial del
 * propietario. No son secretos: son valores de pruebas que solo valen contra el servidor que
 * levanta la propia suite (DoD, apartado _Seguridad_).
 */
export const E2E_ADMIN_SESSION_SECRET =
  process.env.E2E_ADMIN_SESSION_SECRET ?? 'secreto-de-e2e-solo-para-pruebas-0123456789'

export const E2E_ADMIN_PANEL_PASSWORD =
  process.env.E2E_ADMIN_PANEL_PASSWORD ?? 'credencial-de-e2e-solo-pruebas'
