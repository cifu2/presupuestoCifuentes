import createMiddleware from 'next-intl/middleware'
import { NextResponse, type NextRequest } from 'next/server'

import {
  adminAccessRedirect,
  isAdminPathname,
  normalizeRequestPathname,
} from './app/api/_lib/admin-guard'
import { env } from './config/env'
import { routing } from './i18n/routing'

/**
 * Proxy de Next.js 16 (sustituye al antiguo `middleware`): redirige la raíz al idioma por defecto
 * (`/` → `/es`) y negocia el idioma con la cookie `NEXT_LOCALE` y `Accept-Language`.
 *
 * Además corre **antes** que next-intl la guarda de acceso del panel (CIF-241, ADR-0024): una
 * petición a `/[locale]/admin/**` sin sesión firmada válida se redirige a `/[locale]/acceso` sin
 * renderizar nada del panel. La guarda es independiente del interruptor de entorno del shell de
 * fase 1 (CIF-101): suman, no se sustituyen.
 *
 * La decisión se toma sobre la ruta normalizada y el `matcher` cubre **todo** lo que no sea API o
 * estáticos de Next/Vercel (B1/B2/B1′ de CIF-241/CIF-246): el `matcher` de next-intl se saltaba
 * cualquier ruta con un punto, así que el panel no puede depender de una coincidencia literal —
 * Next casa variantes decodificadas o con espacios recortados que no se pueden enumerar
 * (`/es/admin%20/series/x.y`, `/es/%61dmin/x.y`). Para lo que no es panel se conserva el
 * comportamiento de i18n: las rutas con punto no pasan por next-intl (activos estáticos).
 *
 * Next.js 16 ejecuta el Proxy en el runtime de Node por defecto, así que la firma HMAC de las
 * cookies (`node:crypto`, `admin-session.ts`) funciona aquí igual que en los route handlers.
 */
const handleI18n = createMiddleware(routing)

export default function proxy(request: NextRequest) {
  const redirectTo = adminAccessRedirect(
    {
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
      cookieHeader: request.headers.get('cookie'),
    },
    { sessionSecret: env.ADMIN_SESSION_SECRET, password: env.ADMIN_PANEL_PASSWORD },
    new Date(),
  )

  if (redirectTo !== undefined) {
    const response = NextResponse.redirect(new URL(redirectTo, request.url))

    // El panel no se indexa ni cuando se le acierta la ruta (ADR-0023 §5).
    response.headers.set('x-robots-tag', 'noindex, nofollow')

    return response
  }

  const normalized = normalizeRequestPathname(request.nextUrl.pathname)
  const isAdmin = normalized !== undefined && isAdminPathname(normalized)

  // Las rutas con punto nunca han pasado por next-intl (activos estáticos): se conserva ese
  // comportamiento y, si son el panel con sesión válida, se sirven sin negociación de idioma.
  if (request.nextUrl.pathname.includes('.')) {
    const response = NextResponse.next()

    // Tampoco se indexa cuando la sesión es válida y el panel se sirve (ADR-0023 §5).
    if (isAdmin) response.headers.set('x-robots-tag', 'noindex, nofollow')

    return response
  }

  const response = handleI18n(request)

  if (isAdmin) {
    response.headers.set('x-robots-tag', 'noindex, nofollow')
  }

  return response
}

export const config = {
  /**
   * Se excluye lo mismo que antes (`api`, estáticos de Next y de Vercel) pero **no** las rutas con
   * punto: la guarda del panel tiene que verlas para casar lo que Next resuelve tras decodificar y
   * recortar espacios (`/es/admin%20/series/x.y`, `/es/%61dmin/x.y`, B1′/B2). El Proxy devuelve
   * `next()` sin i18n para las rutas con punto, así que el sitio público se comporta igual.
   */
  matcher: ['/((?!api|_next|_vercel).*)'],
}
