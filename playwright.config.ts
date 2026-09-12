import { defineConfig, devices } from '@playwright/test'

import { e2eDatabaseUrl } from './e2e/support/database'
import {
  E2E_ADMIN_BASE_URL,
  E2E_ADMIN_PANEL_PASSWORD,
  E2E_ADMIN_PORT,
  E2E_ADMIN_SESSION_SECRET,
  E2E_ADMIN_TOKEN,
  E2E_BASE_URL,
  E2E_PORT,
  E2E_SALES_MAILBOX,
} from './e2e/support/servers'

/**
 * Con `E2E_BASE_URL` la suite apunta a un entorno ya levantado y no arranca servidores propios. Sin
 * ella el E2E es **hermético**: sirve su propia build de producción en local y en CI, y no reutiliza
 * un `pnpm dev` que podría quedar desfasado respecto al código del momento.
 */
const externalEnvironment = process.env.E2E_BASE_URL !== undefined

/**
 * Modo `prisma` de la suite hermética (ADR-0027 §5): los dos servidores comparten un PostgreSQL
 * efímero migrado y sembrado, así que la escritura del panel llega a la web pública y el flujo 3 es
 * observable. En modo demostración el catálogo vive en memoria **por proceso** y cada `webServer`
 * tendría el suyo (`src/composition/container.ts`, ADR-0013 §8, ADR-0026 §2).
 *
 * `e2eDatabaseUrl()` falla en alto si falta `DATABASE_URL` o si la base no parece desechable: sin
 * base no hay modo `prisma` y la suite dejaría de ver el flujo 3 en silencio. Contra un entorno ya
 * desplegado (`E2E_BASE_URL`) no se toca ninguna base: allí no se arranca ningún servidor.
 */
const databaseEnvironment = externalEnvironment
  ? {}
  : { DATABASE_URL: e2eDatabaseUrl(), CATALOG_DEMO_MODE: 'false' }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // La siembra va dentro de `pnpm e2e` (y no en un paso de CI aparte) para que el comando sea el
  // mismo en local y en CI y nadie pueda olvidarla. Los specs ven el catálogo ya sembrado.
  ...(externalEnvironment ? {} : { globalSetup: './e2e/support/global-setup.ts' }),
  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
  // Dos servidores con la misma build porque la guarda del API del panel depende del entorno:
  // sin `ADMIN_API_TOKEN` responde 503 y con él 401 (CIF-86). Playwright los arranca **en orden** y
  // espera a que el primero esté listo, así que solo el primero compila y el segundo reutiliza el
  // build. Sirven el bundle de producción también en local: el E2E no depende de `pnpm dev`, que no
  // admite dos servidores en el mismo directorio.
  webServer: [
    {
      command: `pnpm build && pnpm start --port ${E2E_PORT}`,
      // `ADMIN_API_TOKEN` vacío (= sin configurar) fija el caso 503 aunque el entorno del
      // desarrollador tenga un token en `.env.local`.
      // También se vacían las credenciales de sesión del panel (CIF-241) para que la guarda de
      // `/[locale]/admin` se observe **sin** sesión aunque el entorno del desarrollador tenga
      // `.env.local`: el caso «no configurado» tiene que ser determinista.
      env: {
        ...databaseEnvironment,
        ADMIN_API_TOKEN: '',
        ADMIN_SESSION_SECRET: '',
        ADMIN_PANEL_PASSWORD: '',
      },
      url: E2E_BASE_URL,
      reuseExistingServer: externalEnvironment,
      timeout: 240_000,
    },
    {
      command: `pnpm start --port ${E2E_ADMIN_PORT}`,
      // El buzón interno es un valor de pruebas: el E2E comprueba que la entrega llega al cliente y
      // al aviso interno sin enviar correo real (adaptador de consola, ADR-0004 §4).
      env: {
        ...databaseEnvironment,
        ADMIN_API_TOKEN: E2E_ADMIN_TOKEN,
        ADMIN_SESSION_SECRET: E2E_ADMIN_SESSION_SECRET,
        ADMIN_PANEL_PASSWORD: E2E_ADMIN_PANEL_PASSWORD,
        QUOTE_INTERNAL_RECIPIENTS: E2E_SALES_MAILBOX,
      },
      url: E2E_ADMIN_BASE_URL,
      reuseExistingServer: externalEnvironment,
      timeout: 240_000,
    },
  ],
})
