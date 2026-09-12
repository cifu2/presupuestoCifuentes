/**
 * Test de la guarda de acceso del panel (CIF-241, ADR-0024): qué rutas protege, qué hace sin
 * sesión (redirige al acceso, no renderiza) y qué hace con una sesión válida.
 */

import { describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE, issueAdminSession } from './admin-session'
import {
  adminAccessPath,
  adminAccessRedirect,
  adminPanelPath,
  isAdminPathname,
  localeFromPathname,
  normalizeRequestPathname,
  sanitizeNextPath,
} from './admin-guard'

const SECRET = 's'.repeat(32)
const PASSWORD = 'credencial-de-prueba'
const NOW = new Date('2026-09-12T08:00:00.000Z')

const CREDENTIALS = { sessionSecret: SECRET, password: PASSWORD }

function sessionCookie(): string {
  const issued = issueAdminSession(CREDENTIALS, NOW)

  if (!issued.ok) throw new Error('No se pudo emitir la sesión de prueba')

  return `${ADMIN_SESSION_COOKIE}=${issued.token}`
}

describe('isAdminPathname', () => {
  it('reconoce el panel con y sin prefijo de idioma', () => {
    for (const pathname of ['/admin', '/es/admin', '/en/admin/series', '/es/admin/']) {
      expect(isAdminPathname(pathname), pathname).toBe(true)
    }
  })

  it('no confunde otras rutas con el panel', () => {
    for (const pathname of ['/', '/es', '/es/administracion', '/es/configurador', '/acceso']) {
      expect(isAdminPathname(pathname), pathname).toBe(false)
    }
  })
})

describe('localeFromPathname', () => {
  it('extrae el idioma del prefijo y cae en undefined si no lo lleva', () => {
    expect(localeFromPathname('/en/admin')).toBe('en')
    expect(localeFromPathname('/admin')).toBeUndefined()
  })
})

describe('sanitizeNextPath', () => {
  it('conserva rutas relativas del panel', () => {
    expect(sanitizeNextPath('/es/admin?tab=series', 'es')).toBe('/es/admin?tab=series')
  })

  it('normaliza el destino (codificación y segmentos `.`/`..`)', () => {
    expect(sanitizeNextPath('/es/%61dmin/series', 'es')).toBe('/es/admin/series')
    expect(sanitizeNextPath('/es/admin/../admin?x=1', 'es')).toBe('/es/admin?x=1')
  })

  it('descarta destinos que no vuelven al panel propio', () => {
    for (const candidate of [
      'https://evil.example',
      '//evil.example',
      'javascript:alert(1)',
      '/\\evil.example',
      '/es/admin\u0000',
      'es/admin',
      '/es/configurador',
      '/es/../..//evil.example',
      undefined,
    ]) {
      expect(sanitizeNextPath(candidate, 'es'), String(candidate)).toBe('/es/admin')
    }
  })

  it('cae en la raíz del panel del idioma pedido', () => {
    expect(sanitizeNextPath(undefined, 'en')).toBe('/en/admin')
  })
})

describe('normalizeRequestPathname', () => {
  it('decodifica los segmentos como el router de Next (B1 de CIF-241)', () => {
    expect(normalizeRequestPathname('/es/%61dmin')).toBe('/es/admin')
    expect(normalizeRequestPathname('/es/ad%6din')).toBe('/es/admin')
    expect(normalizeRequestPathname('/es/%61%64min/series')).toBe('/es/admin/series')
    expect(normalizeRequestPathname('/es/%2561dmin')).toBe('/es/admin')
  })

  it('colapsa barras y resuelve `.` y `..`', () => {
    expect(normalizeRequestPathname('//es///admin//')).toBe('/es/admin')
    expect(normalizeRequestPathname('/es/./admin/../admin')).toBe('/es/admin')
  })

  it('devuelve undefined con escapes inválidos o caracteres de control', () => {
    expect(normalizeRequestPathname('/es/%zz')).toBeUndefined()
    expect(normalizeRequestPathname('/es/admin%00')).toBeUndefined()
  })

  it('conserva el texto legítimo con un `%` suelto', () => {
    expect(normalizeRequestPathname('/es/descuento-10%25')).toBe('/es/descuento-10%')
  })

  it('recorta los espacios ASCII de los extremos como el router de Next (B1′ de CIF-246)', () => {
    expect(normalizeRequestPathname('/es/admin%20')).toBe('/es/admin')
    expect(normalizeRequestPathname('/es/admin%20%20')).toBe('/es/admin')
    expect(normalizeRequestPathname('/es/admi%6e%20')).toBe('/es/admin')
    expect(normalizeRequestPathname('/en/%20admin%20')).toBe('/en/admin')
    expect(normalizeRequestPathname('/es/%20/configurador%20')).toBe('/es/configurador')
  })
})

describe('adminAccessRedirect', () => {
  it('redirige al acceso con el destino original si no hay cookie', () => {
    expect(
      adminAccessRedirect(
        { pathname: '/es/admin', search: '', cookieHeader: null },
        CREDENTIALS,
        NOW,
      ),
    ).toBe(`/es/acceso?next=${encodeURIComponent('/es/admin')}`)
  })

  it('redirige con el idioma por defecto si la URL no lleva prefijo', () => {
    expect(
      adminAccessRedirect(
        { pathname: '/admin', search: '?tab=prices', cookieHeader: null },
        CREDENTIALS,
        NOW,
      ),
    ).toBe(`/es/acceso?next=${encodeURIComponent('/admin?tab=prices')}`)
  })

  it('redirige con una cookie inválida o caducada', () => {
    const expired = issueAdminSession(CREDENTIALS, new Date(NOW.getTime() - 24 * 60 * 60 * 1000))
    const cookieHeader = expired.ok ? `${ADMIN_SESSION_COOKIE}=${expired.token}` : ''

    expect(
      adminAccessRedirect({ pathname: '/es/admin', search: '', cookieHeader }, CREDENTIALS, NOW),
    ).toBe(`/es/acceso?next=${encodeURIComponent('/es/admin')}`)
  })

  it('deja pasar la petición si la sesión es válida', () => {
    expect(
      adminAccessRedirect(
        { pathname: '/es/admin/series', search: '', cookieHeader: sessionCookie() },
        CREDENTIALS,
        NOW,
      ),
    ).toBeUndefined()
  })

  it('deja pasar con una sesión válida aunque el nombre de cookie vaya repetido (N1)', () => {
    const header = `${ADMIN_SESSION_COOKIE}=manipulada; ${sessionCookie()}`

    expect(
      adminAccessRedirect(
        { pathname: '/es/admin', search: '', cookieHeader: header },
        CREDENTIALS,
        NOW,
      ),
    ).toBeUndefined()
  })

  it('deniega el panel por una ruta codificada (B1 de CIF-241)', () => {
    const expected = `/es/acceso?next=${encodeURIComponent('/es/admin')}`

    for (const pathname of [
      '/es/%61dmin',
      '/es/ad%6din',
      '/es/%61%64min',
      '/es/admin%00',
      '/es/admin%20',
      '/es/admin%20%20',
      '/es/admi%6e%20',
    ]) {
      expect(
        adminAccessRedirect({ pathname, search: '', cookieHeader: null }, CREDENTIALS, NOW),
        pathname,
      ).toBe(expected)
    }
  })

  it('deniega el panel con espacio ASCII final en el idioma sin prefijo por defecto (B1′)', () => {
    expect(
      adminAccessRedirect(
        { pathname: '/en/admin%20', search: '', cookieHeader: null },
        CREDENTIALS,
        NOW,
      ),
    ).toBe(`/en/acceso?next=${encodeURIComponent('/en/admin')}`)
  })

  it('deniega el panel si la ruta no se puede normalizar', () => {
    expect(
      adminAccessRedirect(
        { pathname: '/es/%zz', search: '', cookieHeader: null },
        CREDENTIALS,
        NOW,
      ),
    ).toBe(`/es/acceso?next=${encodeURIComponent('/es/admin')}`)
  })

  it('no toca las rutas públicas', () => {
    expect(
      adminAccessRedirect(
        { pathname: '/es/configurador', search: '', cookieHeader: null },
        CREDENTIALS,
        NOW,
      ),
    ).toBeUndefined()
  })

  it('deniega el panel aunque no haya sesión configurada (falla cerrado)', () => {
    expect(
      adminAccessRedirect(
        { pathname: '/es/admin', search: '', cookieHeader: sessionCookie() },
        { sessionSecret: undefined, password: undefined },
        NOW,
      ),
    ).toBe(`/es/acceso?next=${encodeURIComponent('/es/admin')}`)
  })
})

describe('adminAccessPath', () => {
  it('vive fuera del panel para poder mostrarse sin sesión', () => {
    expect(adminAccessPath('es')).toBe('/es/acceso')
    expect(isAdminPathname(adminAccessPath('es'))).toBe(false)
  })
})

describe('adminPanelPath', () => {
  it('es la raíz del panel del idioma', () => {
    expect(adminPanelPath('es')).toBe('/es/admin')
    expect(adminPanelPath('en')).toBe('/en/admin')
  })
})
