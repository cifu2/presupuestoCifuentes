/**
 * Guarda de acceso del panel (CIF-241, ADR-0023 §5/§7).
 *
 * Decide, en el borde y **sin tocar la presentación del panel**, si una petición a
 * `/[locale]/admin/**` puede pasar. La consumen el Proxy de Next.js 16 (`src/proxy.ts`) y la página
 * de acceso: el panel queda protegido con independencia de la guarda provisional de entorno del
 * shell de fase 1 (CIF-101), que sigue siendo suya.
 *
 * Falla cerrada: sin `ADMIN_SESSION_SECRET` ni credencial de propietario configurados, con una
 * cookie ausente/inválida/caducada, o con una ruta que no se puede normalizar (escapes inválidos,
 * caracteres de control), toda petición a `/admin` se redirige a la página de acceso y no se
 * renderiza nada del panel.
 *
 * La decisión se toma sobre la ruta **normalizada** (B1 de CIF-241): el router de Next sirve las
 * rutas decodificadas (`/es/%61dmin` llega a `/[locale]/admin`), así que comparar el pathname en
 * crudo dejaba pasar el panel sin sesión.
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

import {
  ADMIN_SESSION_COOKIE,
  readCookieValues,
  verifyAdminSession,
  type AdminSessionCredentials,
} from './admin-session'

/** Segmento de la página de acceso: `/[locale]/acceso`, fuera de `/[locale]/admin/**`. */
export const ADMIN_ACCESS_SEGMENT = 'acceso'

export interface AdminGuardRequest {
  readonly pathname: string
  readonly search: string
  readonly cookieHeader: string | null
}

function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter((segment) => segment.length > 0)
}

function isLocale(value: string | undefined): value is Locale {
  return SUPPORTED_LOCALES.some((locale) => locale === value)
}

/** Idioma del prefijo de la URL, si lo lleva (`/en/admin` → `en`; `/admin` → `undefined`). */
export function localeFromPathname(pathname: string): Locale | undefined {
  const [first] = pathSegments(pathname)

  return isLocale(first) ? first : undefined
}

/** ¿Es una ruta del panel? `/es/admin`, `/es/admin/series` y `/admin` sí; `/es/administracion` no. */
export function isAdminPathname(pathname: string): boolean {
  const [first, second] = pathSegments(pathname)

  return isLocale(first) ? second === 'admin' : first === 'admin'
}

/** Una ruta con caracteres de control no es una ruta legítima: la guarda la deniega. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/

/**
 * Espacios ASCII de los extremos de un segmento. El router de Next los recorta al casar la ruta
 * (`/es/admin%20` sirve `/[locale]/admin`), así que la normalización hace lo mismo antes de
 * comparar (B1′ de CIF-246). Solo el espacio ASCII: el resto de espacios (NBSP, ideográfico…) y los
 * caracteres de control ya se deniegan o no los recorta Next.
 */
const EDGE_SPACES = /^ +| +$/g

/** Pasadas de decodificación: cubre la codificación simple y la doble (`%2561dmin`). */
const MAX_DECODE_PASSES = 3

/**
 * Decodifica un segmento de ruta. Devuelve `undefined` si no se puede decodificar (p. ej. `%zz`):
 * una ruta ambigua se trata como panel y se deniega (falla cerrado). Un `%` que no forma escape
 * (`100%25` → `100%`) se conserva tal cual: es texto legítimo, no un error.
 */
function decodeSegment(raw: string): string | undefined {
  let value = raw
  let decodedOnce = false

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (!value.includes('%')) return value

    let decoded: string

    try {
      decoded = decodeURIComponent(value)
    } catch {
      return decodedOnce ? value : undefined
    }

    if (decoded === value) return value

    value = decoded
    decodedOnce = true
  }

  return value
}

/**
 * Ruta normalizada para decidir: decodifica cada segmento, colapsa barras duplicadas y resuelve
 * `.`/`..`, que es lo que hace el router de Next al servir. Devuelve `undefined` si la ruta no se
 * puede normalizar.
 */
export function normalizeRequestPathname(pathname: string): string | undefined {
  const resolved: string[] = []

  for (const rawSegment of pathname.split('/')) {
    if (rawSegment.length === 0) continue

    const decoded = decodeSegment(rawSegment)

    if (decoded === undefined) return undefined

    // `%2f` decodifica a `/`: se vuelve a partir para que un segmento no esconda un separador.
    for (const segment of decoded.split('/')) {
      if (segment.length === 0) continue
      if (CONTROL_CHARACTERS.test(segment)) return undefined

      const trimmedSegment = segment.replace(EDGE_SPACES, '')

      if (trimmedSegment.length === 0) continue
      if (trimmedSegment === '.') continue
      if (trimmedSegment === '..') {
        resolved.pop()
        continue
      }

      resolved.push(trimmedSegment)
    }
  }

  return `/${resolved.join('/')}`
}

/**
 * Sanea el destino posterior al acceso. Solo se admite volver al panel del propio sitio: nada de
 * URLs absolutas, esquemas (`javascript:`), `//host`, `..` ni rutas ajenas. Si el destino no vale,
 * el propietario acaba en la raíz del panel, no de vuelta en el formulario.
 */
export function sanitizeNextPath(value: string | undefined, locale: Locale): string {
  const fallback = adminPanelPath(locale)

  if (value === undefined) return fallback

  const candidate = value.trim()

  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//')) return fallback
  if (candidate.includes('\\')) return fallback
  if (CONTROL_CHARACTERS.test(candidate)) return fallback

  const [pathPart, ...searchParts] = candidate.split('?')
  const search = searchParts.length > 0 ? `?${searchParts.join('?')}` : ''
  const pathname = normalizeRequestPathname(pathPart ?? '')

  if (pathname === undefined || !isAdminPathname(pathname)) return fallback

  return `${pathname}${search}`
}

/** Página de acceso en el idioma indicado (o el de la URL). */
export function adminAccessPath(locale: Locale): string {
  return `/${locale}/${ADMIN_ACCESS_SEGMENT}`
}

/** Raíz del panel en el idioma indicado: destino por defecto tras acceder. */
export function adminPanelPath(locale: Locale): string {
  return `/${locale}/admin`
}

function accessRedirect(locale: Locale, pathname: string, search: string): string {
  const next = sanitizeNextPath(`${pathname}${search}`, locale)

  return `${adminAccessPath(locale)}?next=${encodeURIComponent(next)}`
}

/**
 * Destino de la redirección si la petición no puede pasar, o `undefined` si puede. Incluye el
 * destino original normalizado en `?next=` para volver a él después de acceder.
 */
export function adminAccessRedirect(
  request: AdminGuardRequest,
  credentials: AdminSessionCredentials,
  now: Date,
): string | undefined {
  const normalized = normalizeRequestPathname(request.pathname)

  // Ruta no normalizable: puede ser cualquier cosa, así que se deniega como si fuera el panel.
  if (normalized === undefined) {
    const locale = localeFromPathname(request.pathname) ?? DEFAULT_LOCALE

    return accessRedirect(locale, request.pathname, request.search)
  }

  if (!isAdminPathname(normalized)) return undefined

  const tokens = readCookieValues(request.cookieHeader, ADMIN_SESSION_COOKIE)

  // Vale cualquier cookie del nombre que verifique: un nombre repetido (cookie sembrada desde un
  // subdominio) no puede dejar inservible la sesión real, y falsificarla exige la clave de firma.
  if (tokens.some((token) => verifyAdminSession(credentials, token, now).ok)) return undefined

  const locale = localeFromPathname(normalized) ?? DEFAULT_LOCALE

  return accessRedirect(locale, normalized, request.search)
}
