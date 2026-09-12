/**
 * E2E del configurador público (CIF-7).
 *
 * Cubre el camino completo del cliente —serie, medidas, acabado, color y accesorios → precio en
 * vivo → presupuesto o solicitud manual— más los casos borde que pide la tarea: medida fuera del
 * máximo de la serie, serie sin tarifa vigente, medidas imposibles y borrador recuperable.
 *
 * Se ejecuta contra el catálogo de demostración en memoria (`CATALOG_DEMO_MODE=true`): sin base de
 * datos y sin datos reales de clientes ni credenciales (docs/e2e-playbook.md).
 */

import { expect, test, type Page } from '@playwright/test'

const CONFIGURATOR_PATH = '/es/configurador'

const CONTACT = {
  name: 'Ana Ruiz',
  email: 'ana.ruiz@example.com',
  phone: '600123456',
  message: 'Prefiero llamada por la tarde.',
}

async function fillContact(page: Page): Promise<void> {
  await page.getByTestId('contact-name').fill(CONTACT.name)
  await page.getByTestId('contact-email').fill(CONTACT.email)
  await page.getByTestId('contact-phone').fill(CONTACT.phone)
  await page.getByTestId('contact-message').fill(CONTACT.message)
}

test('la portada enlaza con el configurador', async ({ page }) => {
  await page.goto('/es')

  await page.getByTestId('home-cta').click()

  await expect(page).toHaveURL(/\/es\/configurador$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Configurador')
})

test('el configurador se alimenta del catálogo publicado', async ({ page }) => {
  await page.goto(CONFIGURATOR_PATH)

  const series = page.getByTestId('configurator-series')

  await expect(series).toBeVisible()
  await expect(series.locator('option')).toHaveCount(4)
  await expect(series.locator('option').first()).toHaveText('Serie CI-100')

  // Acabados, colores y accesorios salen de la API de catálogo, no del código de la vista.
  await expect(page.getByTestId('preview-finish').locator('option')).toHaveCount(2)
  await expect(page.getByTestId('preview-finish')).toHaveValue('finish-lacado')
  await expect(page.getByTestId('preview-color').locator('option')).toHaveCount(3)
  await expect(page.getByTestId('accessory-accessory-manilla')).toBeVisible()
  await expect(page.getByTestId('accessory-accessory-cierrapuertas')).toBeVisible()

  // Al cambiar de serie, la ficha y los límites son los de la serie nueva.
  await series.selectOption('ci-400')

  await expect(page.getByTestId('accessories-empty')).toBeVisible()
  await expect(page.getByTestId('preview-range')).toContainText('600–1000 mm')
})

test('el cliente obtiene presupuesto con precio en vivo en menos de lo que tarda una llamada', async ({
  page,
  request,
}) => {
  await page.goto(CONFIGURATOR_PATH)

  await page.getByTestId('preview-width').fill('900')
  await page.getByTestId('preview-height').fill('2030')
  await page.getByTestId('preview-finish').selectOption('finish-lacado')
  await page.getByTestId('preview-color').selectOption('color-ral-7016')
  await page.getByTestId('accessory-accessory-manilla').check()
  await page.getByTestId('extra-installation').check()
  await page.getByTestId('configurator-discount').fill('PROMO10')

  // El precio es el mismo que devuelve la API para esa configuración: la vista no lo recalcula.
  const api = await request.post('/api/quotes/price', {
    data: {
      seriesSlug: 'ci-100',
      widthMm: 900,
      heightMm: 2030,
      finishId: 'finish-lacado',
      colorId: 'color-ral-7016',
      accessoryIds: ['accessory-manilla'],
      extras: ['installation'],
      discountCode: 'PROMO10',
      locale: 'es',
    },
  })
  const breakdown = (await api.json()).breakdown as {
    total: { amount: string }
    lines: { code: string }[]
  }

  expect(breakdown.lines.map((line) => line.code)).toContain('MANILLA-A')
  // Importes por debajo de 10.000: el español no agrupa millares (CLDR), así que la coma decimal
  // es suficiente para comparar el texto de la vista con el importe exacto de la API.
  await expect(page.getByTestId('price-total')).toContainText(
    breakdown.total.amount.replace('.', ','),
  )

  await page.getByTestId('request-quote').click()
  await fillContact(page)
  await page.getByTestId('contact-submit').click()

  await expect(page.getByTestId('quote-issued')).toBeVisible()
  await expect(page.getByTestId('quote-reference')).toHaveText(/^PC-\d{4}-\d{6}$/)
})

test('una medida por encima del máximo de la serie pasa a presupuesto manual', async ({ page }) => {
  await page.goto(CONFIGURATOR_PATH)

  await page.getByTestId('preview-width').fill('1300')

  await expect(page.getByTestId('preview-out-of-range')).toBeVisible()
  await expect(page.getByTestId('price-manual')).toBeVisible()
  await expect(page.getByTestId('price-total')).toHaveCount(0)
  await expect(page.getByTestId('manual-quote-reason')).toContainText('supera el máximo')

  await fillContact(page)
  await page.getByTestId('contact-submit').click()

  await expect(page.getByTestId('manual-quote-created')).toBeVisible()
  await expect(page.getByTestId('manual-quote-created')).toContainText('24 horas laborables')
})

test('una serie sin tarifa vigente también pasa a presupuesto manual', async ({ page }) => {
  await page.goto(CONFIGURATOR_PATH)

  await page.getByTestId('configurator-series').selectOption('ci-400')

  await expect(page.getByTestId('price-manual')).toBeVisible()
  await expect(page.getByTestId('manual-quote-reason')).toContainText('no tiene tarifa vigente')
})

test('las medidas imposibles se corrigen en el formulario y no llegan a la API', async ({
  page,
}) => {
  await page.goto(CONFIGURATOR_PATH)

  await expect(page.getByTestId('price-total')).toBeVisible()

  await page.getByTestId('preview-width').fill('0')

  await expect(page.getByTestId('width-error')).toContainText('1 mm')
  await expect(page.getByTestId('price-idle')).toBeVisible()
  await expect(page.getByTestId('price-total')).toHaveCount(0)

  await page.getByTestId('preview-width').fill('20000')

  await expect(page.getByTestId('width-error')).toContainText('10.000 mm')

  await page.getByTestId('preview-width').fill('900')

  await expect(page.getByTestId('price-total')).toBeVisible()
  await expect(page.getByTestId('width-error')).toHaveCount(0)
})

test('el formulario de contacto no envía datos incompletos', async ({ page }) => {
  await page.goto(CONFIGURATOR_PATH)

  await expect(page.getByTestId('price-total')).toBeVisible()
  await page.getByTestId('request-quote').click()
  await page.getByTestId('contact-submit').click()

  await expect(page.getByTestId('contact-name')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('quote-issued')).toHaveCount(0)

  await page.getByTestId('contact-name').fill('Ana')
  await page.getByTestId('contact-email').fill('no-es-un-correo')
  await page.getByTestId('contact-submit').click()

  await expect(page.getByTestId('contact-email')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('quote-issued')).toHaveCount(0)
})

test('el borrador se recupera al volver a la página', async ({ page }) => {
  await page.goto(CONFIGURATOR_PATH)

  await page.getByTestId('preview-width').fill('950')
  await page.getByTestId('preview-planking').selectOption('tablones-36')
  await page.getByTestId('accessory-accessory-manilla').check()

  await expect(page.getByTestId('price-total')).toBeVisible()

  await page.reload()

  await expect(page.getByTestId('draft-restored')).toBeVisible()
  await expect(page.getByTestId('preview-width')).toHaveValue('950')
  await expect(page.getByTestId('preview-planking')).toHaveValue('tablones-36')
  await expect(page.getByTestId('accessory-accessory-manilla')).toBeChecked()

  await page.getByTestId('discard-draft').click()

  await expect(page.getByTestId('draft-restored')).toHaveCount(0)
  await expect(page.getByTestId('preview-width')).toHaveValue('900')
  await expect(page.getByTestId('accessory-accessory-manilla')).not.toBeChecked()
})

test('el configurador está traducido en los dos idiomas y declara su canónica', async ({
  page,
}) => {
  await page.goto('/en/configurador')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Door configurator')
  await expect(page.getByTestId('configurator-series')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Series' })).toBeVisible()
  await expect(page.getByTestId('price-total')).toBeVisible()
  await expect(page.getByTestId('price-total')).toContainText('€')
  await expect(page.getByTestId('request-quote')).toHaveText('Request a quote')

  // Ruta anidada (CIF-23): canónica y alternativas apuntan a la ruta hermana, sin query.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/en\/configurador$/)
  await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
    'href',
    /\/es\/configurador$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    'href',
    /\/es\/configurador$/,
  )

  await page.goto('/es/configurador')

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es\/configurador$/)
  await expect(page.getByTestId('request-quote')).toHaveText('Solicitar presupuesto')
})
