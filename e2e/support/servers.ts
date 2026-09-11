/**
 * Servidores que levanta la suite E2E (CIF-86).
 *
 * La guarda del API del panel (`src/app/api/_lib/admin-auth.ts`) tiene dos comportamientos
 * excluyentes según el entorno del **servidor**: sin `ADMIN_API_TOKEN` responde `503` y con él
 * exige credenciales (`401`). No se pueden observar en el mismo proceso, así que la suite levanta
 * dos servidores de producción: el principal, sin token, y el de administración, con token. Este
 * módulo es la única fuente de sus puertos y credenciales, compartida por `playwright.config.ts` y
 * por los specs.
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
