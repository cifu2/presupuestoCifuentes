/**
 * E2E del catálogo vacío (CIF-436).
 *
 * El servidor principal de la suite arranca siempre con las cuatro series del catálogo de
 * demostración, así que el estado sin catálogo —el que ve el propietario antes de cargar la primera
 * serie y que en producción puede durar días o semanas (ADR-0015 §7, ADR-0026 §3)— no se observaba
 * de extremo a extremo. Este spec lo cubre contra el tercer servidor (`CATALOG_DEMO_EMPTY`, ver
 * `playwright.config.ts`), sin PostgreSQL y sin datos reales.
 *
 * El copy se escribe literal a propósito: es lo que se revisa (CIF-430) y así este E2E también cae
 * si el texto cambia, además del unitario `configurator-render.test.tsx`.
 */

import { expect, test } from '@playwright/test'

import { E2E_EMPTY_BASE_URL } from './support/servers'

const CATALOG_EMPTY_COPY = {
  es: 'Todavía no hay ninguna serie publicada.',
  en: 'There are no published series yet.',
} as const

const LOCALES = ['es', 'en'] as const

test.describe('catálogo vacío (servidor hermético sin series)', () => {
  for (const locale of LOCALES) {
    test(`el configurador muestra el estado vacío en ${locale}`, async ({ page }) => {
      const response = await page.goto(`${E2E_EMPTY_BASE_URL}/${locale}/configurador`)

      expect(response?.ok()).toBe(true)
      await expect(page.locator('html')).toHaveAttribute('lang', locale)

      const empty = page.getByTestId('catalog-empty')

      await expect(empty).toBeVisible()
      await expect(empty).toHaveText(CATALOG_EMPTY_COPY[locale])

      // Sin catálogo el estado vacío sustituye al configurador entero: no hay selector de series,
      // ni panel de precio, ni formulario de contacto.
      await expect(page.getByTestId('configurator-series')).toHaveCount(0)
      await expect(page.getByTestId('price-status')).toHaveCount(0)
      await expect(page.getByTestId('contact-form')).toHaveCount(0)
    })
  }

  test('la API pública no devuelve ninguna serie', async ({ request }) => {
    const response = await request.get(`${E2E_EMPTY_BASE_URL}/api/catalog/series?locale=es`)

    expect(response.status()).toBe(200)

    const body = await response.json()

    expect(body.data).toEqual([])
    expect(body.meta).toMatchObject({ locale: 'es', mode: 'demo' })
  })
})
