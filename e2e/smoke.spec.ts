import { expect, test } from '@playwright/test'

test('la home carga y muestra el título del producto', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Puertas Cifuentes')
  await expect(page.getByRole('heading', { level: 2, name: 'Alcance del MVP' })).toBeVisible()
})

test('el endpoint de salud responde ok y declara el estado de la base', async ({ request }) => {
  const response = await request.get('/api/health')
  const body = await response.json()

  expect(response.status()).toBe(200)
  expect(body).toMatchObject({ status: 'ok', service: 'cifuentes-presupuestos' })
  // `environment` sale de VERCEL_ENV ?? NODE_ENV: en Vercel distingue preview de production.
  expect(['production', 'preview', 'development']).toContain(body.environment)
  // La suite hermética sirve en modo `prisma` contra un PostgreSQL efímero (ADR-0027 §5): la sonda
  // está configurada y responde por la base. El caso `unconfigured` sigue cubierto en la puerta de
  // `calidad` (`scripts/health-http-check.sh`, CIF-456).
  expect(body.database).toBe('ok')
  expect(new Date(body.checkedAt).toString()).not.toBe('Invalid Date')
})
