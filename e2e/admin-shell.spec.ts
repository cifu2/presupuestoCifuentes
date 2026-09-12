import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * E2E del shell del panel (fase 1, ADR-0023): corre en los dos proyectos (`chromium` y `movil`)
 * contra la build de producción con el catálogo de demostración, que es la configuración que abre
 * el panel en el E2E (guarda de ADR-0023 §5). Cubre el DoD §9 —estados, navegación, migas,
 * responsive y i18n— y los nombres accesibles traducidos del hallazgo M2 de CIF-55/CIF-101, sin
 * datos de negocio reales.
 */

/** El sidebar es `md:block` (768 px); por debajo, la navegación es el menú desplegable. */
const MOBILE_BREAKPOINT_PX = 768

/** Nombre accesible de la navegación y del botón que la despliega, por idioma. */
const NAV_LABELS = {
  es: { menu: 'Abrir menú', closeMenu: 'Cerrar menú', sections: 'Secciones del panel' },
  en: { menu: 'Open menu', closeMenu: 'Close menu', sections: 'Panel sections' },
} as const

type Locale = keyof typeof NAV_LABELS

function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < MOBILE_BREAKPOINT_PX
}

/**
 * Navegación principal del panel: en escritorio es el `aside` siempre visible (su nombre accesible
 * vive en el `aside`, no en el `nav` interior); en móvil hay que abrir el menú desplegable.
 */
async function panelNavigation(page: Page, locale: Locale = 'es'): Promise<Locator> {
  const labels = NAV_LABELS[locale]

  if (isMobile(page)) {
    await page.getByRole('button', { name: labels.menu }).click()

    return page.getByRole('navigation', { name: labels.sections })
  }

  return page.getByRole('complementary', { name: labels.sections })
}

test.describe('shell del panel: lista de series', () => {
  test('pinta migas, cabecera, tabla y estados desde el catálogo de demostración', async ({
    page,
  }) => {
    const response = await page.goto('/es/admin')

    expect(response?.ok()).toBe(true)
    await expect(page.getByRole('heading', { level: 1, name: 'Series' })).toBeVisible()

    const main = page.getByRole('main')

    await expect(main).toContainText('Catálogo')
    await expect(main).toContainText('Series del catálogo')

    const table = page.getByRole('table')

    await expect(table).toBeVisible()
    await expect(table).toContainText('Serie A')
    await expect(table).toContainText('Publicada')
    await expect(table).toContainText('Borrador')
    await expect(table).toContainText('Archivada')
    await expect(table).toContainText('Falta traducción')
    await expect(table).toContainText('2400 × 2100 mm')
    await expect(page.getByRole('link', { name: 'Editar Serie A' })).toHaveAttribute(
      'href',
      '/es/admin/series/serie-a',
    )
  })

  test('no se indexa: la página del panel emite meta robots noindex', async ({ page }) => {
    await page.goto('/es/admin')

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('ordena la tabla por nombre al pulsar la cabecera', async ({ page }) => {
    // En móvil la tabla son tarjetas y la cabecera queda visualmente oculta (no hay control de
    // ordenación con puntero): el caso solo aplica al escritorio.
    test.skip(isMobile(page), 'en móvil la tabla se pinta como tarjetas, sin cabecera visible')

    await page.goto('/es/admin')

    const sortByName = page.getByRole('button', { name: 'Ordenar por Nombre' })

    await expect(sortByName).toBeVisible()
    await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1)

    await sortByName.click()

    await expect(page.locator('th[aria-sort="descending"]')).toHaveCount(1)
  })
})

test.describe('shell del panel: navegación entre secciones', () => {
  test('navega a Tarifas, marca la sección activa y conserva las migas', async ({ page }) => {
    await page.goto('/es/admin')

    const navigation = await panelNavigation(page)

    await navigation.getByRole('link', { name: 'Tarifas' }).click()

    await expect(page).toHaveURL(/\/es\/admin\/tarifas$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tarifas' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Catálogo')
    await expect(page.getByRole('table')).toContainText('Vigente')
  })

  test('las secciones sin datos reales del catálogo son ejemplos declarados', async ({ page }) => {
    await page.goto('/es/admin/colores')

    await expect(page.getByRole('heading', { level: 1, name: 'Colores' })).toBeVisible()
    await expect(page.getByRole('main')).toContainText(
      'Cada color se define con nombre y RAL/hex; es lo que pinta la vista previa 2D.',
    )
  })

  test('una serie que no existe responde 404', async ({ page }) => {
    const response = await page.goto('/es/admin/series/no-existe')

    expect(response?.status()).toBe(404)
  })
})

test.describe('shell del panel: responsive', () => {
  test('en móvil la navegación vive en el menú desplegable y se cierra al navegar', async ({
    page,
  }) => {
    test.skip(!isMobile(page), 'en escritorio la navegación es el sidebar fijo')

    await page.goto('/es/admin')

    const hiddenNavigation = page.getByRole('navigation', { name: 'Secciones del panel' })

    await expect(hiddenNavigation).toHaveCount(0)

    const toggle = page.getByRole('button', { name: 'Abrir menú' })

    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(page.getByRole('button', { name: 'Cerrar menú' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await expect(hiddenNavigation).toBeVisible()

    await hiddenNavigation.getByRole('link', { name: 'Idiomas' }).click()

    await expect(page).toHaveURL(/\/es\/admin\/idiomas$/)
    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCount(0)
  })

  test('en escritorio el sidebar está siempre visible con las seis secciones', async ({ page }) => {
    test.skip(isMobile(page), 'en móvil la navegación es el menú desplegable')

    await page.goto('/es/admin')

    const sidebar = page.getByRole('complementary', { name: 'Secciones del panel' })

    await expect(sidebar).toBeVisible()

    for (const section of ['Series', 'Acabados', 'Colores', 'Accesorios', 'Tarifas', 'Idiomas']) {
      await expect(sidebar.getByRole('link', { name: section })).toBeVisible()
    }

    await expect(sidebar.getByRole('link', { name: 'Ver web ↗' })).toBeVisible()
  })
})

test.describe('shell del panel: i18n y nombres accesibles (M2)', () => {
  test('el conmutador de idioma traduce la pantalla y los nombres accesibles', async ({ page }) => {
    await page.goto('/es/admin')

    await page
      .getByRole('navigation', { name: 'Idioma' })
      .getByRole('link', { name: 'en', exact: true })
      .click()

    await expect(page).toHaveURL(/\/en\/admin$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1, name: 'Series' })).toBeVisible()
    await expect(page.getByRole('table')).toContainText('Published')
    await expect(page.getByRole('navigation', { name: 'Language' })).toBeVisible()

    // M2: el nombre accesible del sidebar/menú también cambia de idioma, no solo el texto visible.
    await expect(await panelNavigation(page, 'en')).toBeVisible()
  })

  test('el tablist del detalle usa las claves a11y.tabs en los dos idiomas', async ({ page }) => {
    await page.goto('/es/admin/series/serie-a?tab=tariffs')

    await expect(page.getByRole('tablist', { name: 'Secciones de la serie' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Tarifas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await page.goto('/en/admin/series/serie-a?tab=tariffs')

    await expect(page.getByRole('tablist', { name: 'Series sections' })).toBeVisible()
  })
})

test.describe('shell del panel: estados del DoD §6', () => {
  test('muestra el estado vacío con su llamada a la acción', async ({ page }) => {
    await page.goto('/es/admin?state=empty')

    await expect(page.getByRole('main')).toContainText('Todavía no hay series.')
    await expect(page.getByRole('main')).toContainText(
      'Crea la primera serie para publicarla en el configurador.',
    )
    await expect(page.getByRole('table')).toHaveCount(0)
  })

  test('anuncia la carga con role=status', async ({ page }) => {
    await page.goto('/es/admin?state=loading')

    await expect(page.getByRole('status')).toBeVisible()
    await expect(page.getByRole('main')).toContainText('Cargando…')
  })

  test('pinta el error con reintento y el caso sin permiso', async ({ page }) => {
    await page.goto('/es/admin?state=error')

    const main = page.getByRole('main')

    await expect(main.getByRole('alert')).toContainText('No hemos podido cargar los datos.')
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()

    await page.goto('/es/admin?state=forbidden')

    await expect(main).toContainText('No tienes acceso a esta sección.')
    await expect(main).toContainText('Pide acceso al propietario de la cuenta.')
  })
})
