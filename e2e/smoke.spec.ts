import { expect, test } from '@playwright/test'

test('la home carga y muestra el título del producto', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Puertas Cifuentes')
  await expect(page.getByRole('heading', { level: 2, name: 'Alcance del MVP' })).toBeVisible()
})

test('el endpoint de salud responde ok', async ({ request }) => {
  const response = await request.get('/api/health')
  const body = await response.json()

  expect(response.ok()).toBe(true)
  expect(body).toMatchObject({ status: 'ok', service: 'cifuentes-presupuestos' })
  // `environment` sale de VERCEL_ENV ?? NODE_ENV: en Vercel distingue preview de production.
  expect(['production', 'preview', 'development']).toContain(body.environment)
  expect(new Date(body.checkedAt).toString()).not.toBe('Invalid Date')
})
