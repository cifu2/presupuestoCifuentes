import { defineConfig, devices } from '@playwright/test'

import {
  E2E_ADMIN_BASE_URL,
  E2E_ADMIN_PANEL_PASSWORD,
  E2E_ADMIN_PORT,
  E2E_ADMIN_SESSION_SECRET,
  E2E_ADMIN_TOKEN,
  E2E_BASE_URL,
  E2E_EMPTY_BASE_URL,
  E2E_EMPTY_PORT,
  E2E_PORT,
  E2E_SALES_MAILBOX,
} from './e2e/support/servers'

/**
 * Con `E2E_BASE_URL` la suite apunta a un entorno ya levantado y no arranca servidores propios. Sin
 * ella el E2E es **hermético**: sirve su propia build de producción en local y en CI, y no reutiliza
 * un `pnpm dev` que podría quedar desfasado respecto al código del momento.
 */
const externalEnvironment = process.env.E2E_BASE_URL !== undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
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
  // Tres servidores con la misma build porque los estados que cubren dependen del entorno: la guarda
  // del API del panel responde 503 sin `ADMIN_API_TOKEN` y 401 con él (CIF-86), y el catálogo de
  // demostración vacío solo se sirve con `CATALOG_DEMO_EMPTY` (CIF-436). Playwright los arranca **en
  // orden** y espera a que el anterior esté listo, así que solo el primero compila y los demás
  // reutilizan el build. Sirven el bundle de producción también en local: el E2E no depende de
  // `pnpm dev`, que no admite varios servidores en el mismo directorio.
  webServer: [
    {
      command: `pnpm build && pnpm start --port ${E2E_PORT}`,
      // El E2E usa el catálogo de demostración en memoria: no depende de PostgreSQL (CIF-10/CIF-11).
      // `ADMIN_API_TOKEN` vacío (= sin configurar) fija el caso 503 aunque el entorno del
      // desarrollador tenga un token en `.env.local`.
      // También se vacían las credenciales de sesión del panel (CIF-241) para que la guarda de
      // `/[locale]/admin` se observe **sin** sesión aunque el entorno del desarrollador tenga
      // `.env.local`: el caso «no configurado» tiene que ser determinista.
      env: {
        CATALOG_DEMO_MODE: 'true',
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
        CATALOG_DEMO_MODE: 'true',
        ADMIN_API_TOKEN: E2E_ADMIN_TOKEN,
        ADMIN_SESSION_SECRET: E2E_ADMIN_SESSION_SECRET,
        ADMIN_PANEL_PASSWORD: E2E_ADMIN_PANEL_PASSWORD,
        QUOTE_INTERNAL_RECIPIENTS: E2E_SALES_MAILBOX,
      },
      url: E2E_ADMIN_BASE_URL,
      reuseExistingServer: externalEnvironment,
      timeout: 240_000,
    },
    {
      command: `pnpm start --port ${E2E_EMPTY_PORT}`,
      // El estado sin catálogo es el que ve el propietario antes de cargar la primera serie y puede
      // durar días o semanas (ADR-0015 §7, ADR-0026 §3); el servidor principal siempre arranca con
      // las cuatro series del fixture, así que el vacío se sirve aquí, sin PostgreSQL (CIF-436).
      env: {
        CATALOG_DEMO_MODE: 'true',
        CATALOG_DEMO_EMPTY: 'true',
      },
      url: E2E_EMPTY_BASE_URL,
      reuseExistingServer: externalEnvironment,
      timeout: 240_000,
    },
  ],
})
