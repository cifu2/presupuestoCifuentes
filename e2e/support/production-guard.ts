/**
 * Guarda de destino de la suite E2E (CIF-525).
 *
 * Por qué existe: la suite **escribe**. `POST /api/quotes`, `POST /api/manual-quote-requests` y
 * `POST /api/quotes/:ref/delivery` emiten presupuestos y piden entregas, y los specs de
 * administración autoaprovisionan estado. Contra producción eso son datos reales de negocio, así que
 * **producción no es banco de pruebas de E2E** ([ADR-0025](../../docs/adr/0025-validacion-via-envio-por-entorno.md) §5,
 * ratificado en [ADR-0026](../../docs/adr/0026-catalogo-de-produccion-y-validacion-desplegada.md) §7).
 *
 * Hasta CIF-525 esa política solo estaba en prosa: nada impedía `E2E_BASE_URL=https://<producción>`.
 * Esta guarda la hace cumplir **cerrando en falso**: `playwright.config.ts` la evalúa al cargarse, de
 * modo que la suite aborta antes de levantar servidores y antes de ejecutar el primer test. No hay
 * variable de escape: si un host deja de ser producción, se corrige la lista declarada de abajo.
 *
 * Lo que **no** es: no valida que la URL sea alcanzable ni que el entorno tenga catálogo. Eso es la
 * precondición de CIF-383 (un entorno sin datos debe informar de precondición fallida, no agotar el
 * timeout).
 */

/** Variables de la suite cuyo destino no puede ser producción. */
export const E2E_TARGET_VARIABLES = ['E2E_BASE_URL', 'E2E_ADMIN_BASE_URL'] as const

export type E2eTargetVariable = (typeof E2E_TARGET_VARIABLES)[number]

/**
 * Hosts declarados como producción en el repositorio: la única fuente de la verdad de la guarda.
 *
 * Se comparan sin `www.`, sin puerto, sin esquema y sin distinguir mayúsculas, así que declarar
 * `ejemplo.com` cubre `https://www.ejemplo.com:443/…`. Un destino nuevo de producción —el dominio del
 * propietario que cierre CIF-14, un alias nuevo en Vercel— se añade **aquí**, con su PR y su test.
 */
export const PRODUCTION_HOSTS: readonly string[] = [
  // Alias de producción del proyecto de Vercel `presupuesto-cifuentes` (docs/despliegue.md §2).
  'presupuesto-cifuentes.vercel.app',
  // Dominio del propietario (puertascifuentes.com): destino del despliegue de producción del MVP.
  'puertascifuentes.com',
]

/**
 * Alias de la rama `main` de Vercel (`<proyecto>-git-main-<equipo>.vercel.app`): sirve el despliegue
 * de _Production_, no un preview ([ADR-0007](../../docs/adr/0007-despliegue-vercel-github.md)). Un
 * `-git-main` es producción aunque el resto del host parezca un preview.
 */
const MAIN_BRANCH_ALIAS = /^presupuesto-cifuentes-git-main(?:[.-]|$)/

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '')
    .replace(/^www\./, '')
}

/** Host de una URL, sin esquema, puerto ni `www.`; `undefined` si no se puede leer una URL. */
export function hostOf(rawValue: string): string | undefined {
  const value = rawValue.trim()

  if (value === '') return undefined

  try {
    const { hostname } = new URL(SCHEME.test(value) ? value : `http://${value}`)

    return hostname === '' ? undefined : normalizeHost(hostname)
  } catch {
    // Una URL ilegible no es un destino de producción demostrable; que lo reporte Playwright.
    return undefined
  }
}

/** ¿El host (ya normalizado o no) es un destino de producción declarado? */
export function isProductionHost(host: string): boolean {
  const candidate = normalizeHost(host)

  if (candidate === '') return false

  if (PRODUCTION_HOSTS.some((declared) => normalizeHost(declared) === candidate)) return true

  return candidate.endsWith('.vercel.app') && MAIN_BRANCH_ALIAS.test(candidate)
}

export interface ProductionTarget {
  variable: E2eTargetVariable
  host: string
}

/** Destinos de producción que declara el entorno. Vacío = la guarda deja pasar la ejecución. */
export function findProductionTargets(
  env: Record<string, string | undefined> = process.env,
): ProductionTarget[] {
  return E2E_TARGET_VARIABLES.flatMap((variable) => {
    const raw = env[variable]

    if (raw === undefined || raw.trim() === '') return []

    const host = hostOf(raw)

    // Solo se nombra el host: la variable no se imprime para no arrastrar credenciales de una URL.
    return host !== undefined && isProductionHost(host) ? [{ variable, host }] : []
  })
}

/** Mensaje de aborto: nombra los ADR que lo prohíben y el entorno que sí vale. */
export function productionTargetMessage(targets: readonly ProductionTarget[]): string {
  return [
    'La suite E2E no puede apuntar a producción (guarda de destino, CIF-525).',
    '',
    ...targets.map((target) => `  - ${target.variable} → ${target.host}`),
    '',
    'Producción no es banco de pruebas de E2E: ADR-0025 §5 y ADR-0026 §7. La suite emite',
    'presupuestos y pide entregas, así que escribiría datos reales de negocio.',
    '',
    'Entornos válidos:',
    '  · E2E hermético (CI o local): sin `E2E_BASE_URL`, con los servidores y el catálogo de',
    '    demostración de la propia suite.',
    '  · Preview del PR con la base sembrada: `scripts/seed-preview-catalogo.sh` (CIF-330).',
    '',
    'No hay variable de escape. Si un host deja de ser producción, se corrige la lista declarada en',
    '`e2e/support/production-guard.ts` (con test).',
  ].join('\n')
}

/**
 * Aborta la ejecución si alguna variable de destino apunta a producción. Se llama al cargar
 * `playwright.config.ts`.
 */
export function assertE2eTargetsAreNotProduction(
  env: Record<string, string | undefined> = process.env,
): void {
  const targets = findProductionTargets(env)

  if (targets.length > 0) {
    throw new Error(productionTargetMessage(targets))
  }
}
