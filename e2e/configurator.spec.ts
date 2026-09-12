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
  const startedAt = Date.now()

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

  // AC de CIF-7: el cliente completa la configuración y obtiene presupuesto en menos de 3 minutos.
  expect(Date.now() - startedAt).toBeLessThan(180_000)
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

  await page.getByTestId('contact-email').fill(CONTACT.email)
  await page.getByTestId('contact-phone').fill('123')
  await page.getByTestId('contact-submit').click()

  // El error del teléfono se anuncia y queda ligado al campo, como en nombre y correo.
  await expect(page.getByTestId('contact-phone')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('contact-phone')).toHaveAttribute(
    'aria-describedby',
    'contacto-telefono-error',
  )
  await expect(page.getByTestId('contact-phone-error')).toBeVisible()
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
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    /\/en\/configurador$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    'href',
    /\/es\/configurador$/,
  )

  await page.goto('/es/configurador')

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es\/configurador$/)
  await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
    'href',
    /\/es\/configurador$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    /\/en\/configurador$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    'href',
    /\/es\/configurador$/,
  )
  await expect(page.getByTestId('request-quote')).toHaveText('Solicitar presupuesto')
})

test('la canónica de la ruta anidada ignora la query', async ({ page }) => {
  await page.goto('/es/configurador?modelo=ci-400&v=2')

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/es\/configurador$/)
  await expect(page.locator('link[rel="alternate"][hreflang="es"]')).toHaveAttribute(
    'href',
    /\/es\/configurador$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    /\/en\/configurador$/,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
    'href',
    /\/es\/configurador$/,
  )
})

test('el botón de reintentar vuelve a pedir el precio tras un fallo', async ({ page }) => {
  let calls = 0

  await page.route('**/api/quotes/price', async (route) => {
    calls += 1

    if (calls === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Fallo simulado' } }),
      })
      return
    }

    await route.continue()
  })

  await page.goto(CONFIGURATOR_PATH)

  await expect(page.getByTestId('price-error')).toBeVisible()
  await page.getByTestId('price-retry').click()

  // Reintentar relanza la petición: el panel no puede quedarse en el estado vacío.
  await expect(page.getByTestId('price-total')).toBeVisible()
  expect(calls).toBeGreaterThan(1)
})

test('una ficha de serie que falla se reintenta al volver a la serie', async ({ page }) => {
  let calls = 0

  await page.route('**/api/catalog/series/ci-400*', async (route) => {
    calls += 1

    if (calls === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Fallo simulado' } }),
      })
      return
    }

    await route.continue()
  })

  await page.goto(CONFIGURATOR_PATH)
  await expect(page.getByTestId('price-total')).toBeVisible()

  await page.getByTestId('configurator-series').selectOption('ci-400')
  await expect(page.getByTestId('catalog-error')).toBeVisible()

  await page.getByTestId('configurator-series').selectOption('ci-100')
  await page.getByTestId('configurator-series').selectOption('ci-400')

  await expect(page.getByTestId('catalog-error')).toHaveCount(0)
  await expect(page.getByTestId('accessories-empty')).toBeVisible()
  expect(calls).toBeGreaterThan(1)
})

test('si el servidor responde que la configuración sí tiene precio, se refresca el precio en vivo', async ({
  page,
}) => {
  let priceCalls = 0

  await page.route('**/api/quotes/price', async (route) => {
    priceCalls += 1

    if (priceCalls === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'manual_quote_required',
          seriesId: 'series-ci-100',
          seriesCode: 'CI-100',
          reason: 'no_tariff_in_force',
          detail: 'La serie no tiene tarifa vigente',
        }),
      })
      return
    }

    await route.continue()
  })

  await page.route('**/api/manual-quote-requests', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'price_available',
        seriesId: 'series-ci-100',
        seriesCode: 'CI-100',
        breakdown: {
          currency: 'EUR',
          lines: [],
          basePrice: { amount: '1.00', currency: 'EUR' },
          subtotal: { amount: '1.00', currency: 'EUR' },
          taxRatePercent: '21.00',
          taxAmount: { amount: '0.21', currency: 'EUR' },
          total: { amount: '1.21', currency: 'EUR' },
        },
      }),
    }),
  )

  await page.goto(CONFIGURATOR_PATH)
  await expect(page.getByTestId('manual-quote-reason')).toBeVisible()

  await fillContact(page)
  await page.getByTestId('contact-submit').click()

  // `price_available` es un estado documentado, no un error de contrato: la vista vuelve al precio.
  await expect(page.getByTestId('quote-error')).toHaveCount(0)
  await expect(page.getByTestId('price-total')).toBeVisible()
})

test('un fallo al emitir el presupuesto deja el formulario disponible para reintentar', async ({
  page,
}) => {
  let calls = 0

  await page.route('**/api/quotes', async (route) => {
    calls += 1

    if (calls === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Fallo simulado' } }),
      })
      return
    }

    await route.continue()
  })

  await page.goto(CONFIGURATOR_PATH)
  await expect(page.getByTestId('price-total')).toBeVisible()

  await page.getByTestId('request-quote').click()
  await fillContact(page)
  await page.getByTestId('contact-submit').click()

  // El error se anuncia y el camino de conversión sigue teniendo salida: formulario y botón montados.
  await expect(page.getByTestId('quote-error')).toBeVisible()
  await expect(page.getByTestId('contact-form')).toBeVisible()
  await expect(page.getByTestId('contact-submit')).toBeVisible()

  await page.getByTestId('contact-submit').click()

  await expect(page.getByTestId('quote-issued')).toBeVisible()
  await expect(page.getByTestId('quote-error')).toHaveCount(0)
  expect(calls).toBeGreaterThan(1)
})

test('un fallo al registrar la solicitud manual también se puede reintentar', async ({ page }) => {
  let calls = 0

  await page.route('**/api/manual-quote-requests', async (route) => {
    calls += 1

    if (calls === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Fallo simulado' } }),
      })
      return
    }

    await route.continue()
  })

  await page.goto(CONFIGURATOR_PATH)
  await page.getByTestId('configurator-series').selectOption('ci-400')
  await expect(page.getByTestId('manual-quote-reason')).toBeVisible()

  await fillContact(page)
  await page.getByTestId('contact-submit').click()

  await expect(page.getByTestId('quote-error')).toBeVisible()
  await expect(page.getByTestId('contact-form')).toBeVisible()

  await page.getByTestId('contact-submit').click()

  await expect(page.getByTestId('manual-quote-created')).toBeVisible()
  await expect(page.getByTestId('quote-error')).toHaveCount(0)
  expect(calls).toBeGreaterThan(1)
})

test('el aviso de catálogo ofrece reintentar sin cambiar de serie', async ({ page }) => {
  let calls = 0

  await page.route('**/api/catalog/series/ci-400*', async (route) => {
    calls += 1

    if (calls === 1) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Fallo simulado' } }),
      })
      return
    }

    await route.continue()
  })

  await page.goto(CONFIGURATOR_PATH)
  await expect(page.getByTestId('price-total')).toBeVisible()

  await page.getByTestId('configurator-series').selectOption('ci-400')
  await expect(page.getByTestId('catalog-error')).toBeVisible()

  await page.getByTestId('catalog-retry').click()

  await expect(page.getByTestId('catalog-error')).toHaveCount(0)
  await expect(page.getByTestId('accessories-empty')).toBeVisible()
  expect(calls).toBeGreaterThan(1)
})

test.describe('conformidad de diseño (CIF-211)', () => {
  test('por debajo del mínimo es error inline, sin precio ni CTA manual (D1)', async ({
    page,
    request,
  }) => {
    await page.goto(CONFIGURATOR_PATH)

    await page.getByTestId('preview-width').fill('500')

    await expect(page.getByTestId('width-below-minimum')).toHaveText(
      'El ancho mínimo de la serie es 600 mm.',
    )
    await expect(page.getByTestId('preview-width')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('preview-width')).toHaveAttribute(
      'aria-describedby',
      'preview-range ancho-minimo',
    )
    await expect(page.getByTestId('preview-out-of-range')).toHaveText(
      'La medida no llega al mínimo de la serie.',
    )
    await expect(page.getByTestId('price-idle')).toBeVisible()
    await expect(page.getByTestId('price-total')).toHaveCount(0)
    await expect(page.getByTestId('price-manual')).toHaveCount(0)
    await expect(page.getByTestId('manual-quote-reason')).toHaveCount(0)
    await expect(page.getByTestId('contact-form')).toHaveCount(0)
    await expect(page.getByTestId('request-quote')).toHaveCount(0)

    // El API responde error de validación, no presupuesto manual (ADR-0022).
    const api = await request.post('/api/quotes/price', {
      data: { seriesSlug: 'ci-100', widthMm: 500, heightMm: 2100, locale: 'es' },
    })

    expect(api.status()).toBe(400)
    expect((await api.json()).error.code).toBe('INVALID_MEASUREMENT')

    // Al corregir la medida vuelve el precio y desaparece el error.
    await page.getByTestId('preview-width').fill('700')
    await expect(page.getByTestId('width-below-minimum')).toHaveCount(0)
    await expect(page.getByTestId('price-total')).toBeVisible()
  })

  test('si un eje supera el máximo y otro no llega al mínimo, conviven (D1)', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    await page.getByTestId('preview-width').fill('1300')
    await page.getByTestId('preview-height').fill('1700')

    await expect(page.getByTestId('height-below-minimum')).toBeVisible()
    await expect(page.getByTestId('preview-out-of-range')).toContainText('supera el tamaño máximo')
    await expect(page.getByTestId('price-manual')).toBeVisible()
    await expect(page.getByTestId('manual-quote-reason')).toContainText('supera el máximo')
  })

  test('el foco visible usa el token de acento (E1)', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    const width = page.getByTestId('preview-width')

    await width.focus()

    const outline = await width.evaluate((element) => {
      const style = getComputedStyle(element)

      return `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor} / ${style.outlineOffset}`
    })

    expect(outline).toContain('2px solid rgb(184, 134, 11)')
    expect(outline).toContain('/ 2px')
  })

  test('los objetivos táctiles llegan a 44 px en móvil y 40 px en escritorio (E5)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(CONFIGURATOR_PATH)
    await expect(page.getByTestId('price-total')).toBeVisible()

    const targets = [
      page.getByTestId('configurator-series'),
      page.getByTestId('preview-width'),
      page.getByTestId('preview-finish'),
      page.getByTestId('request-quote'),
      page.getByTestId('preview-moulding').locator('..'),
      page.getByTestId('preview-hinge-side-derecha').locator('..'),
    ]

    for (const target of targets) {
      const box = await target.boundingBox()

      expect(box).not.toBeNull()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }

    await page.setViewportSize({ width: 1366, height: 900 })

    const desktop = await page.getByTestId('preview-width').boundingBox()

    expect(desktop?.height ?? 0).toBeGreaterThanOrEqual(40)
  })

  test('el botón de envío expone el estado de envío con aria-busy (E6)', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)
    await expect(page.getByTestId('price-total')).toBeVisible()

    await page.getByTestId('request-quote').click()
    await fillContact(page)

    await page.route('**/api/quotes', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400))
      await route.continue()
    })

    const submit = page.getByTestId('contact-submit')

    await submit.click()

    await expect(submit).toHaveAttribute('aria-busy', 'true')
    await expect(page.getByTestId('quote-issued')).toBeVisible()
  })

  test('el precio se mantiene a la vista: barra fija en móvil y tarjeta sticky en escritorio (G3)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(CONFIGURATOR_PATH)
    await expect(page.getByTestId('price-total')).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    const panel = page.getByTestId('price-status').locator('..')

    expect(await panel.evaluate((element) => getComputedStyle(element).position)).toBe('fixed')

    const mobileBox = await page.getByTestId('price-total').boundingBox()

    expect(mobileBox?.y ?? -1).toBeGreaterThanOrEqual(0)
    expect((mobileBox?.y ?? 10_000) + (mobileBox?.height ?? 0)).toBeLessThanOrEqual(844)

    await page.setViewportSize({ width: 1366, height: 900 })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    expect(
      await panel.evaluate((element) =>
        element.parentElement === null ? null : getComputedStyle(element.parentElement).position,
      ),
    ).toBe('sticky')

    const desktopBox = await page.getByTestId('price-total').boundingBox()

    expect(desktopBox?.y ?? -1).toBeGreaterThanOrEqual(0)
    expect(desktopBox?.y ?? 10_000).toBeLessThan(900)
  })
})
