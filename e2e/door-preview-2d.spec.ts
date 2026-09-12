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
    const width = page.getByRole('spinbutton', { name: 'Ancho (mm)' })

    await expect(width).toBeVisible()
    await expect(width).toHaveAttribute('aria-describedby', 'preview-range')
    await expect(page.getByRole('spinbutton', { name: 'Alto (mm)' })).toHaveAttribute(
      'aria-describedby',
      'preview-range',
    )
    await expect(page.getByRole('radio', { name: 'Izquierda' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Enmarcado perimetral' })).toBeVisible()
  })

  test('el nombre accesible del dibujo lleva el tipo, la medida, el acabado y el color traducidos (H2 de CIF-163)', async ({
    page,
  }) => {
    await page.goto(CONFIGURATOR_PATH)

    await expect(preview(page)).toHaveAttribute(
      'aria-label',
      'Vista previa: Abatible 1 hoja, 900 × 2030 mm, Lacado, Blanco puro',
    )

    // El color pertenece al acabado: primero se elige la chapa natural y después su roble.
    await page.getByTestId('preview-finish').selectOption('finish-madera')
    await page.getByTestId('preview-color').selectOption('color-roble')
    await page.getByTestId('preview-type').selectOption('pivotante-2-hojas')

    await expect(preview(page)).toHaveAttribute(
      'aria-label',
      'Vista previa: Pivotante de 2 hojas, 900 × 2030 mm, Chapa natural, Roble',
    )

    await page.goto('/en/configurador')

    await expect(preview(page)).toHaveAttribute(
      'aria-label',
      'Preview: Single-leaf hinged door, 900 × 2030 mm, Lacquered, Pure white',
    )
  })

  test('se actualiza con las medidas, el acabado y el color', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    // 900 × 2.030 mm con margen M = 30 → viewBox "-30 -30 960 2090".
    await expect(preview(page)).toHaveAttribute('viewBox', '-30 -30 960 2090')
    // El color por defecto es el primero publicado del acabado elegido (RAL 9010).
    await expect(preview(page).locator('[data-shape-kind="leaf"]')).toHaveAttribute(
      'fill',
      '#F1EDE1',
    )

    await page.getByTestId('preview-width').fill('1200')
    await page.getByTestId('preview-height').fill('2400')

    // M = round(0.03 · 1.200) = 36 → el lienzo sigue la proporción de las medidas.
    await expect(preview(page)).toHaveAttribute('viewBox', '-36 -36 1272 2472')
    await expect(page.getByTestId('preview-measurement')).toHaveText('1200 × 2400 mm')

    await page.getByTestId('preview-finish').selectOption('finish-madera')
    await expect(preview(page).locator('[data-shape-kind="leaf"]')).toHaveAttribute(
      'fill',
      '#B98A54',
    )

    // Sin color elegido la hoja se pinta con el relleno neutro del modelo.
    await page.getByTestId('preview-color').selectOption('')
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

  test('fija el tono metal del tirador y el trazo sin relleno de la moldura (N1 de CIF-165)', async ({
    page,
  }) => {
    await page.goto(CONFIGURATOR_PATH)

    // H4: la hoja simple pinta el tirador en tono metal, como el arte v5.2 de Diseño.
    await expect(preview(page).locator('[data-shape-kind="handle"]').first()).toHaveAttribute(
      'fill',
      'url(#metal)',
    )

    // H5: los tablones curvos generan molduras de contorno que nunca llevan relleno.
    await page.getByTestId('preview-planking').selectOption('tablones-curvos-36')

    const moulding = preview(page).locator('[data-shape-kind="moulding"]').first()

    await expect(moulding).toHaveAttribute('fill', 'none')
    await expect(moulding).toHaveAttribute('stroke', '#98a2ab')
  })

  test('el aviso de presupuesto manual cumple AA de contraste (D1 de CIF-165)', async ({
    page,
  }) => {
    await page.goto(CONFIGURATOR_PATH)

    await page.getByTestId('preview-width').fill('1300')

    const alert = page.getByTestId('preview-out-of-range')

    await expect(alert).toBeVisible()

    const contrast = await alert.evaluate((element) => {
      const channels = (value: string): number[] => (value.match(/\d+(\.\d+)?/g) ?? []).map(Number)
      const luminance = ([r = 0, g = 0, b = 0]: number[]): number => {
        const channel = (component: number): number => {
          const scaled = component / 255

          return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
        }

        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }

      let node: Element | null = element
      let background = 'rgb(255, 255, 255)'

      while (node !== null) {
        const candidate = getComputedStyle(node).backgroundColor
        const parts = channels(candidate)

        if (parts.length >= 3 && (parts[3] ?? 1) > 0) {
          background = candidate
          break
        }

        node = node.parentElement
      }

      const foreground = getComputedStyle(element).color
      const light = Math.max(luminance(channels(foreground)), luminance(channels(background)))
      const dark = Math.min(luminance(channels(foreground)), luminance(channels(background)))

      return {
        foreground,
        background,
        ratio: (light + 0.05) / (dark + 0.05),
      }
    })

    expect(contrast.ratio, JSON.stringify(contrast)).toBeGreaterThanOrEqual(4.5)
  })

  test('en el primer viewport conviven la vista previa y el primer control (D2 de CIF-165)', async ({
    page,
  }) => {
    await page.goto(CONFIGURATOR_PATH)

    const viewport = page.viewportSize()
    const previewBox = await preview(page).boundingBox()
    // El primer control del panel es el selector de serie (CIF-7); en CIF-6 era el tipo de puerta.
    const firstControl = await page.getByTestId('configurator-series').boundingBox()

    expect(viewport).not.toBeNull()
    expect(previewBox).not.toBeNull()
    expect(firstControl).not.toBeNull()

    const height = viewport?.height ?? 0

    // La puerta se ve y el panel ya arrancó dentro del primer viewport: el bucle «toco → veo»
    // existe también en móvil.
    expect(previewBox?.y ?? height).toBeLessThan(height)
    expect(firstControl?.y ?? height).toBeLessThan(height)
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

  test('distingue el mínimo del máximo en el aviso de fuera de rango (D2/H2)', async ({ page }) => {
    await page.goto(CONFIGURATOR_PATH)

    await page.getByTestId('preview-width').fill('500')

    await expect(page.getByTestId('preview-out-of-range')).toHaveText(
      'La medida no llega al mínimo de la serie.',
    )
    await expect(preview(page)).toHaveAttribute('data-out-of-range', 'true')

    await page.getByTestId('preview-width').fill('1300')

    await expect(page.getByTestId('preview-out-of-range')).toHaveText(
      'La medida supera el tamaño máximo de la serie: pasa a presupuesto manual.',
    )
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
