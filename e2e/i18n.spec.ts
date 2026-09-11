import { expect, test } from '@playwright/test'

test('la raíz sin idioma redirige al español', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.ok()).toBe(true)
  await expect(page).toHaveURL(/\/es$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
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

test('el idioma elegido se mantiene al recargar', async ({ page }) => {
  await page.goto('/en')
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
