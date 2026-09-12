/**
 * E2E del acceso al panel (CIF-241, ADR-0024).
 *
 * Cubre la guarda de `/[locale]/admin/**` tal y como la ve el navegador: sin sesión se redirige a la
 * página de acceso (y esa página informa si el despliegue no tiene la sesión configurada), una
 * cookie manipulada no abre el panel, el flujo de acceso completo funciona —credencial incorrecta,
 * credencial correcta, API de administración con la cookie de sesión— y el cierre de sesión vuelve a
 * dejarlo fuera.
 *
 * El panel en sí (shell de fase 1, CIF-101) todavía no existe en `main`: lo que se comprueba aquí es
 * la **frontera de acceso**, que es propiedad de esta tarea. Con sesión válida la guarda deja pasar
 * la petición y la ruta responde con lo que haya (hoy, el 404 de Next); sin sesión, nunca.
 *
 * Los dos estados de configuración no se pueden observar en el mismo servidor: la suite levanta el
 * principal sin credenciales y el de administración con ellas (ver `playwright.config.ts`).
 */

import { expect, test } from '@playwright/test'

import {
  E2E_ADMIN_BASE_URL,
  E2E_ADMIN_PANEL_PASSWORD,
  E2E_ADMIN_TOKEN,
  E2E_BASE_URL,
} from './support/servers'

/** v1 publicada de la serie CI-100: republicarla es idempotente y no depende del orden de tests. */
const PUBLISHED_CI_100_V1 = '0192f1b0-0000-7000-8000-000000000101'

const ADMIN_SESSION_COOKIE = 'admin_session'

test.describe('sin sesión de panel configurada (servidor principal)', () => {
  test('el panel no es accesible, no se indexa y el acceso está deshabilitado', async ({
    page,
    request,
  }) => {
    // La guarda responde antes de renderizar nada: redirección al acceso con el destino original.
    const guard = await request.get('/es/admin', { maxRedirects: 0 })

    expect(guard.status()).toBe(307)
    expect(guard.headers()['x-robots-tag']).toContain('noindex')

    // Next normaliza el `Location` a una ruta relativa: se resuelve contra la base del servidor.
    const location = new URL(guard.headers()['location'] ?? '', E2E_BASE_URL)

    expect(location.pathname).toBe('/es/acceso')
    expect(location.searchParams.get('next')).toBe('/es/admin')

    // Y en el navegador: ni panel ni formulario, aviso explícito de que no está configurado.
    await page.goto('/es/admin')
    await expect(page).toHaveURL(/\/es\/acceso/)
    await expect(page.getByTestId('access-disabled')).toBeVisible()
    await expect(page.getByTestId('access-form')).toHaveCount(0)

    // Tampoco se puede pedir sesión por API.
    const login = await request.post('/api/admin/session', { data: { password: 'lo-que-sea' } })
    const body = await login.json()

    expect(login.status()).toBe(503)
    expect(body.error.code).toBe('ADMIN_ACCESS_DISABLED')
  })

  test('las rutas con punto del sitio público no pasan por i18n (matcher del panel)', async ({
    request,
  }) => {
    // El Proxy corre ahora también en rutas con punto para poder guardar el panel; un activo del
    // sitio público no debe acabar redirigido a `/{locale}/…`.
    const asset = await request.get('/favicon.ico', { maxRedirects: 0 })

    expect([301, 302, 303, 307, 308]).not.toContain(asset.status())
  })

  test('una ruta codificada del panel tampoco pasa la guarda (B1)', async ({ request }) => {
    for (const pathname of ['/es/%61dmin', '/es/ad%6din', '/es/admin%00']) {
      const guard = await request.get(pathname, { maxRedirects: 0 })

      expect(guard.status(), pathname).toBe(307)
      expect(new URL(guard.headers()['location'] ?? '', E2E_BASE_URL).pathname, pathname).toBe(
        '/es/acceso',
      )
    }
  })
})

test.describe('con sesión de panel configurada (servidor de administración)', () => {
  test.use({ baseURL: E2E_ADMIN_BASE_URL })

  test('sin sesión, el panel redirige a la página de acceso', async ({ page }) => {
    await page.goto('/es/admin/series')

    await expect(page).toHaveURL(/\/es\/acceso/)
    await expect(page.getByTestId('access-form')).toBeVisible()
  })

  test('una ruta codificada del panel no salta la guarda (B1)', async ({ request }) => {
    for (const pathname of ['/es/%61dmin', '/es/ad%6din', '/es/admin%00']) {
      const guard = await request.get(pathname, { maxRedirects: 0 })

      expect(guard.status(), pathname).toBe(307)

      const location = new URL(guard.headers()['location'] ?? '', E2E_ADMIN_BASE_URL)

      expect(location.pathname, pathname).toBe('/es/acceso')
      // El destino se guarda normalizado: tras acceder se vuelve al panel, no a la ruta cruda.
      expect(location.searchParams.get('next'), pathname).toBe('/es/admin')
    }
  })

  test('una ruta del panel con un punto en el camino tampoco salta la guarda (B2)', async ({
    request,
  }) => {
    const guard = await request.get('/es/admin/series/x.y', { maxRedirects: 0 })

    expect(guard.status()).toBe(307)
    expect(new URL(guard.headers()['location'] ?? '', E2E_ADMIN_BASE_URL).pathname).toBe(
      '/es/acceso',
    )
  })

  test('un espacio ASCII final en el segmento tampoco salta la guarda (B1′)', async ({
    request,
  }) => {
    for (const pathname of [
      '/es/admin%20',
      '/es/admin%20%20',
      '/es/admi%6e%20',
      '/en/admin%20',
      '/es/admin%20/series/x.y',
      '/es/%61dmin/series/x.y',
      '/%65s/admin/series/x.y',
    ]) {
      const guard = await request.get(pathname, { maxRedirects: 0 })

      expect(guard.status(), pathname).toBe(307)
      expect(guard.headers()['x-robots-tag'], pathname).toContain('noindex')
      expect(
        new URL(guard.headers()['location'] ?? '', E2E_ADMIN_BASE_URL).pathname,
        pathname,
      ).toMatch(/^\/(es|en)\/acceso$/)
    }
  })

  test('una cookie manipulada no abre el panel', async ({ page, context }) => {
    await context.addCookies([
      { name: ADMIN_SESSION_COOKIE, value: 'v1.manipulada.firma', url: E2E_ADMIN_BASE_URL },
    ])

    await page.goto('/es/admin')

    await expect(page).toHaveURL(/\/es\/acceso/)
  })

  test('con sesión válida, una ruta codificada del panel deja pasar (B1)', async ({ page }) => {
    await page.goto('/es/acceso')
    await page.getByTestId('access-password').fill(E2E_ADMIN_PANEL_PASSWORD)
    await page.getByTestId('access-submit').click()
    await expect(page).not.toHaveURL(/\/es\/acceso/)

    const response = await page.goto('/es/%61dmin')

    expect([301, 302, 303, 307, 308]).not.toContain(response?.status())
    await expect(page).not.toHaveURL(/\/es\/acceso/)
  })

  test('sin `next`, tras acceder se vuelve a la raíz del panel (N3)', async ({ page }) => {
    await page.goto('/es/acceso')
    await page.getByTestId('access-password').fill(E2E_ADMIN_PANEL_PASSWORD)
    await page.getByTestId('access-submit').click()

    await page.waitForURL(/\/es\/admin$/)
  })

  test('el propietario accede con su credencial, el API acepta la sesión y el cierre la revoca', async ({
    page,
  }) => {
    // `page.request` comparte la tarro de cookies con el navegador (el fixture `request` no).
    const api = page.request
    await page.goto('/es/admin')
    await expect(page).toHaveURL(/\/es\/acceso/)

    // Credencial incorrecta: ni sesión ni acceso.
    await page.getByTestId('access-password').fill('credencial-incorrecta')
    await page.getByTestId('access-submit').click()
    await expect(page.getByTestId('access-error')).toBeVisible()

    // Credencial correcta: sesión firmada en cookie HttpOnly.
    await page.getByTestId('access-password').fill(E2E_ADMIN_PANEL_PASSWORD)
    await page.getByTestId('access-submit').click()
    await expect(page).not.toHaveURL(/\/es\/acceso/)

    const session = (await page.context().cookies()).find(
      (cookie) => cookie.name === ADMIN_SESSION_COOKIE,
    )

    expect(session?.httpOnly).toBe(true)
    expect(session?.sameSite).toBe('Lax')

    // La guarda deja pasar el panel: la petición no es una redirección al acceso.
    const guarded = await page.goto('/es/admin')

    expect([301, 302, 303, 307, 308]).not.toContain(guarded?.status())
    await expect(page).not.toHaveURL(/\/es\/acceso/)

    // El API de administración acepta la cookie de sesión sin `Authorization: Bearer`.
    const publishPath = `/api/admin/tariff-versions/${PUBLISHED_CI_100_V1}/publish`
    const publish = await api.post(publishPath)

    expect(publish.status()).toBe(200)

    // El token de operación sigue valiendo por su cuenta (compatibilidad del API del panel).
    const withToken = await api.post(publishPath, {
      headers: { authorization: `Bearer ${E2E_ADMIN_TOKEN}`, cookie: '' },
    })

    expect(withToken.status()).toBe(200)

    // Cierre de sesión: se borra la cookie y el panel vuelve a estar fuera de alcance. La sesión es
    // sin estado (cookie firmada): lo que revoca en el acto es el borrado en el navegador, y rotar
    // el secreto o la credencial invalida todas las sesiones (ADR-0024).
    const logout = await api.delete('/api/admin/session')

    expect(logout.status()).toBe(200)
    expect(
      (await page.context().cookies()).find((cookie) => cookie.name === ADMIN_SESSION_COOKIE),
    ).toBeUndefined()

    await page.goto('/es/admin')
    await expect(page).toHaveURL(/\/es\/acceso/)

    // Y sin cookie ni token, el API vuelve a rechazar (no queda ninguna puerta abierta).
    const withoutCredentials = await api.post(publishPath, { headers: { cookie: '' } })

    expect(withoutCredentials.status()).toBe(401)
  })
})
