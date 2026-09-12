import { expect, test, type Page } from '@playwright/test'

const CONFIGURATOR_PATH = '/es/configurador'

const preview = (page: Page) => page.getByTestId('door-preview')

test.describe('vista previa 2D del configurador', () => {
  test('los campos del panel tienen nombre accesible (H1 de CIF-163)', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    // Se consulta por rol y nombre, no por `data-testid`: es lo que exige el hallazgo H1.
    await expect(page.getByRole('combobox', { name: 'Tipo de puerta' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Acabado' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Color' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Superficie' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Ancho (mm)' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Alto (mm)' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Izquierda' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Enmarcado perimetral' })).toBeVisible()
  })

  test('el nombre accesible del dibujo lleva el tipo, la medida, el acabado y el color traducidos (H2 de CIF-163)', async ({
    page,
  }) => {
    await page.goto(CONFIGURATOR_PATH)

    await expect(preview(page)).toHaveAttribute(
      'aria-label',
      'Vista previa: Acorazada de 1 hoja, 900 × 2030 mm, Lacado, RAL 7016 gris',
    )

    await page.getByTestId('preview-color').selectOption('roble')
    await page.getByTestId('preview-type').selectOption('pivotante-2-hojas')

    await expect(preview(page)).toHaveAttribute(
      'aria-label',
      'Vista previa: Pivotante de 2 hojas, 900 × 2030 mm, Lacado, Roble rústico',
    )

    await page.goto('/en/configurador')

    await expect(preview(page)).toHaveAttribute(
      'aria-label',
      'Preview: Single-leaf armoured door, 900 × 2030 mm, Lacquered, RAL 7016 grey',
    )
  })

  test('se actualiza con las medidas, el acabado y el color', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    // 900 × 2.030 mm con margen M = 30 → viewBox "-30 -30 960 2090".
    await expect(preview(page)).toHaveAttribute('viewBox', '-30 -30 960 2090')
    await expect(preview(page).locator('[data-shape-kind="leaf"]')).toHaveAttribute(
      'fill',
      '#383E42',
    )

    await page.getByTestId('preview-width').fill('1200')
    await page.getByTestId('preview-height').fill('2400')

    // M = round(0.03 · 1.200) = 36 → el lienzo sigue la proporción de las medidas.
    await expect(preview(page)).toHaveAttribute('viewBox', '-36 -36 1272 2472')
    await expect(page.getByTestId('preview-measurement')).toHaveText('1200 × 2400 mm')

    await page.getByTestId('preview-color').selectOption('roble')
    await expect(preview(page).locator('[data-shape-kind="leaf"]')).toHaveAttribute(
      'fill',
      '#B98A54',
    )

    await page.getByTestId('preview-finish').selectOption('sin-acabado')
    await expect(preview(page).locator('[data-shape-kind="leaf"]')).toHaveAttribute(
      'fill',
      '#D9D9D9',
    )
  })

  test('cambia de tipo y respeta la mano del eje en las pivotantes', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    await page.getByTestId('preview-type').selectOption('pivotante-1-hoja')
    await page.getByTestId('preview-hinge-side-derecha').check()

    await expect(preview(page).locator('[data-shape-kind="hinge"]')).toHaveCount(0)
    await expect(preview(page).locator('[data-shape-kind="pivot"]')).toHaveCount(2)

    const rightAxis = await preview(page).locator('[data-shape-kind="axis"]').getAttribute('x1')

    await page.getByTestId('preview-hinge-side-izquierda').check()

    const leftAxis = await preview(page).locator('[data-shape-kind="axis"]').getAttribute('x1')

    expect(rightAxis).not.toBeNull()
    expect(leftAxis).not.toBeNull()
    // El eje es el espejo del de la mano derecha: x_derecha + x_izquierda = ancho.
    expect(Number(rightAxis) + Number(leftAxis)).toBeCloseTo(900, 1)
  })

  test('añade las capas de tratamiento al dibujo', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    await page.getByTestId('preview-planking').selectOption('tablones-36')
    await page.getByTestId('preview-moulding').check()
    await page.getByTestId('preview-glazing').check()

    await expect(preview(page).locator('[data-shape-kind="plank"]')).toHaveCount(1)
    await expect(preview(page).locator('[data-shape-kind="strip"]').first()).toBeVisible()
    await expect(preview(page).locator('[data-shape-kind="moulding"]')).toHaveCount(2)
    await expect(preview(page).locator('[data-shape-kind="glazing"]')).toHaveCount(2)
  })

  test('avisa cuando la medida supera el máximo de la serie (paso a presupuesto manual)', async ({
    page,
  }) => {
    await page.goto(CONFIGURATOR_PATH)

    await expect(page.getByTestId('preview-out-of-range')).toHaveCount(0)

    await page.getByTestId('preview-width').fill('1300')

    await expect(page.getByTestId('preview-out-of-range')).toBeVisible()
    await expect(preview(page)).toHaveAttribute('data-out-of-range', 'true')
  })

  test('pinta el cambio de medida en menos de 200 ms (presupuesto de móvil)', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    await expect(preview(page)).toBeVisible()

    const timings = await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="preview-width"]')

      if (input === null) {
        throw new Error('No se encontró el campo de ancho de la vista previa')
      }

      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      const twoFrames = () =>
        new Promise<number>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame((time) => resolve(time)))
        })
      const change = async (value: string) => {
        setValue?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await twoFrames()
      }

      // Calentamiento: la primera actualización incluye la hidratación del componente.
      await change('950')

      const samples: number[] = []

      for (const value of ['1000', '1050', '1100', '1150', '1200']) {
        const started = performance.now()

        await change(value)
        samples.push(performance.now() - started)
      }

      return samples
    })

    const median = [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)] ?? Infinity

    expect(timings).toHaveLength(5)
    expect(median).toBeLessThan(200)
  })
})
