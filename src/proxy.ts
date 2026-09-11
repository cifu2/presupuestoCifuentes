import createMiddleware from 'next-intl/middleware'

import { routing } from './i18n/routing'

/**
 * Proxy de Next.js 16 (sustituye al antiguo `middleware`): redirige la raíz al idioma por defecto
 * (`/` → `/es`) y negocia el idioma con la cookie `NEXT_LOCALE` y `Accept-Language`.
 */
export default createMiddleware(routing)

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
}
