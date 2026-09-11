import { createNavigation } from 'next-intl/navigation'

import { routing } from './routing'

/**
 * Navegación consciente del idioma activo: `Link`, `redirect`, `usePathname` y `useRouter`
 * conservan el prefijo `/es` o `/en` sin que los componentes lo manipulen a mano.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
