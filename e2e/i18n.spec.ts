import { expect, test } from '@playwright/test'

/** Cookie donde next-intl guarda el idioma elegido (nombre por defecto). */
const LOCALE_COOKIE = 'NEXT_LOCALE'

/**
 * La raíz no lleva prefijo de idioma, así que su destino lo decide el proxy en este orden:
 * prefijo de la URL → cookie `NEXT_LOCALE` → `Accept-Language` → idioma por defecto.
 */
test.describe('la raíz resuelve el idioma', () => {
  // `playwright.config.ts` fija `locale: 'es-ES'`, así que este caso comprueba la negociación por
  // `Accept-Language`. Que la raíz use el español por defecto lo demuestra el caso `fr-FR`.
  test('con preferencia española, negocia a /es', async ({ page }) => {
    const response = await page.goto('/')

    expect(response?.ok()).toBe(true)
    await expect(page).toHaveURL(/\/es$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  })

  test.describe('sin español entre las preferencias', () => {
    test.use({ locale: 'fr-FR' })

    test('cae al español por defecto', async ({ page }) => {
      const response = await page.goto('/')

      expect(response?.ok()).toBe(true)
      await expect(page).toHaveURL(/\/es$/)
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    })
  })
})

test('el selector cambia de idioma y traduce la interfaz', async ({ page }) => {
  await page.goto('/es')

  await expect(page.getByRole('heading', { level: 2, name: 'Alcance del MVP' })).toBeVisible()

  await page.getByRole('link', { name: 'English' }).click()

  await expect(page).toHaveURL(/\/en$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 2, name: 'MVP scope' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Alcance del MVP' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'true')
})

test('el idioma elegido se persiste en la cookie NEXT_LOCALE', async ({ page }) => {
  await page.goto('/es')

  await page.getByRole('link', { name: 'English' }).click()

  await expect(page).toHaveURL(/\/en$/)
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies()

      return cookies.find((cookie) => cookie.name === LOCALE_COOKIE)?.value
    })
    .toBe('en')

  // La raíz no lleva idioma: si la cookie no mandara, volvería a /es y este paso lo detecta.
  await page.goto('/')

  await expect(page).toHaveURL(/\/en$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 2, name: 'MVP scope' })).toBeVisible()

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 2, name: 'MVP scope' })).toBeVisible()
})

test('cada idioma declara su canónica y alternativas para los buscadores', async ({ page }) => {
  await page.goto('/es')

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es$/)
  await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
    'href',
    /\/es$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    /\/en$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    'href',
    /\/es$/,
  )

  await page.goto('/en')

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en$/)
})

/**
 * 404 global (regresión de CIF-8, hallazgo F1).
 *
 * Con el layout raíz dentro de `[locale]`, Next no puede componer el 404 a partir de los
 * layouts: lo sirve `src/app/global-not-found.tsx` (`experimental.globalNotFound`). Estos casos
 * vigilan que siga respondiendo 404 con `lang`, con la hoja de estilos de la app y con el texto
 * traducido, nunca con el inglés interno de Next.
 */
test.describe('URL inexistente (404 global)', () => {
  /** Color de fondo de `globals.css` (`#f7f7f5`). Sin la hoja, `body` sería transparente. */
  const BRAND_BACKGROUND = 'rgb(247, 247, 245)'

  test('en español conserva idioma, estilos y texto traducido', async ({ page }) => {
    const response = await page.goto('/es/no-existe-esta-pagina')

    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(
      page.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
    ).toBeVisible()
    await expect(page.getByText('Puede que el enlace esté roto')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute(
      'href',
      '/es',
    )
    await expect(page.locator('body')).toHaveCSS('background-color', BRAND_BACKGROUND)
    await expect(page.locator('body')).not.toContainText('This page could not be found')
  })

  test('en inglés conserva idioma, estilos y texto traducido', async ({ page }) => {
    const response = await page.goto('/en/no-existe-esta-pagina')

    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(
      page.getByRole('heading', { level: 1, name: "We couldn't find this page" }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/en')
    await expect(page.locator('body')).toHaveCSS('background-color', BRAND_BACKGROUND)
  })

  test('sin prefijo de idioma usa el idioma negociado', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()

    try {
      const response = await page.goto('/no-existe-esta-pagina')

      expect(response?.status()).toBe(404)
      await expect(page).toHaveURL(/\/en\/no-existe-esta-pagina$/)
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('una sección inexistente bajo un idioma válido también da 404 localizado', async ({
    page,
  }) => {
    const response = await page.goto('/es/seccion-inexistente')

    expect(response?.status()).toBe(404)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(
      page.getByRole('heading', { level: 1, name: 'No encontramos esta página' }),
    ).toBeVisible()
  })
})
