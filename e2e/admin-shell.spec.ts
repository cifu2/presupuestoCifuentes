import { expect, test, type Locator, type Page } from '@playwright/test'

import { E2E_ADMIN_BASE_URL, E2E_ADMIN_PANEL_PASSWORD } from './support/servers'

/**
 * E2E del shell del panel (fase 1, ADR-0023): corre en los dos proyectos (`chromium` y `movil`)
 * contra la build de producción con el catálogo de demostración, que es la configuración que abre
 * el panel en el E2E (guarda de ADR-0023 §5). Cubre el DoD §9 —estados, navegación, migas,
 * responsive y i18n— y los nombres accesibles traducidos del hallazgo M2 de CIF-55/CIF-101, sin
 * datos de negocio reales. Los cuatro estados se fuerzan **en las dos pantallas de datos**
 * (`/admin` y `/admin/tarifas`), que es el hueco que dejó pasar el fallo de la sección Tarifas.
 *
 * El shell vive detrás de la guarda de sesión del panel (CIF-241, ADR-0024), así que corre contra
 * el **servidor de administración** y cada test obtiene antes su cookie firmada con la credencial
 * de pruebas, igual que el propietario. El servidor principal —sin credenciales— se queda para los
 * casos «el panel no está configurado» de `e2e/admin-auth.spec.ts`.
 */

test.use({ baseURL: E2E_ADMIN_BASE_URL })

test.beforeEach(async ({ page }) => {
  const session = await page.request.post('/api/admin/session', {
    data: { password: E2E_ADMIN_PANEL_PASSWORD },
  })

  expect(session.status()).toBe(200)
})

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
 * El foco está dentro del menú móvil: en uno de sus enlaces o en el botón que lo abre. Es la
 * comprobación que pide el patrón de `sistema-de-diseno` §5: mientras el menú está abierto, el
 * contenido que tapa el scrim no recibe el foco.
 */
async function focusIsInMenu(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const active = document.activeElement
    const menu = document.getElementById('nav-mobile')

    if (active === null || menu === null) {
      return false
    }

    return menu.contains(active) || active.getAttribute('aria-controls') === 'nav-mobile'
  })
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
    // La lectura es la real (CIF-242): el catálogo de demostración con el que abre el E2E, no los
    // fixtures de la fase 1. El catálogo de demostración solo tiene series publicadas, así que los
    // badges de borrador y archivado se cubren en `panel-render.test.tsx`; aquí se comprueba el
    // estado publicado, el aviso de traducción que falta (CI-300 no tiene descripción) y el enlace.
    await expect(table).toContainText('Serie CI-100')
    await expect(table).toContainText('Publicada')
    await expect(table).toContainText('Falta traducción')
    await expect(table).toContainText('1000 × 2200 mm')
    await expect(page.getByRole('link', { name: 'Editar Serie CI-100' })).toHaveAttribute(
      'href',
      '/es/admin/series/ci-100',
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
    // El catálogo de demostración tiene borradores de tarifa (CI-400), así que el badge de borrador
    // se comprueba contra la lectura real, no contra fixtures.
    await expect(page.getByRole('table')).toContainText('Borrador')
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

    // «Ver web» ya no lleva el pictograma ↗ en el catálogo de mensajes (H1 de CIF-300 → CIF-311): la
    // affordance la pinta un SVG decorativo que no entra en el nombre accesible ni en el texto.
    const viewSite = sidebar.getByRole('link', { name: 'Ver web' })

    await expect(viewSite).toBeVisible()
    await expect(viewSite.locator('svg[aria-hidden="true"]')).toHaveCount(1)
  })
})

test.describe('shell del panel: menú móvil con scrim y foco (CIF-296)', () => {
  test('abre con el foco en el primer enlace y `Esc` lo devuelve al botón', async ({ page }) => {
    test.skip(!isMobile(page), 'el menú desplegable solo existe por debajo de 768 px')

    await page.goto('/es/admin')
    await page.getByRole('button', { name: 'Abrir menú' }).click()

    const navigation = page.getByRole('navigation', { name: 'Secciones del panel' })

    await expect(navigation).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Series', exact: true })).toBeFocused()

    // El scrim es la misma capa que el `::backdrop` del modal: el color se mide computado.
    const scrim = page.getByTestId('panel-nav-scrim')

    await expect(scrim).toBeVisible()
    expect(await scrim.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe(
      'rgba(23, 32, 42, 0.45)',
    )

    await page.keyboard.press('Escape')

    await expect(scrim).toHaveCount(0)
    await expect(navigation).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused()
  })

  test('el scrim cierra el menú al pulsarlo y devuelve el foco al botón', async ({ page }) => {
    test.skip(!isMobile(page), 'el menú desplegable solo existe por debajo de 768 px')

    await page.goto('/es/admin')
    await page.getByRole('button', { name: 'Abrir menú' }).click()

    // Se pulsa por debajo del panel desplegado: allí el scrim es quien recibe el clic.
    await page.getByTestId('panel-nav-scrim').click({ position: { x: 12, y: 600 } })

    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused()
  })

  test('contiene el foco: tabular no alcanza el contenido que tapa el scrim', async ({ page }) => {
    test.skip(!isMobile(page), 'el menú desplegable solo existe por debajo de 768 px')

    await page.goto('/es/admin')
    await page.getByRole('button', { name: 'Abrir menú' }).click()

    const navigation = page.getByRole('navigation', { name: 'Secciones del panel' })

    await expect(navigation.getByRole('link', { name: 'Series', exact: true })).toBeFocused()

    // Recorrido medido por QA (H2 de CIF-300): con seis secciones, el 7.º tabulador salía del menú y
    // caía en la tabla tapada («Estado» → «Nombre▲» → «Medidas máx.»). Dos vueltas completas cubren
    // también el salto del último enlace al botón y de ahí al primero.
    for (let step = 0; step < 14; step += 1) {
      await page.keyboard.press('Tab')

      expect(await focusIsInMenu(page)).toBe(true)
    }

    // Hacia atrás tampoco: `Shift+Tab` desde el primer enlace da la vuelta al ciclo.
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press('Shift+Tab')

      expect(await focusIsInMenu(page)).toBe(true)
    }

    // `Esc` sigue cerrando y devolviendo el foco al botón, como en CIF-296.
    await page.keyboard.press('Escape')

    await expect(navigation).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused()
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
    await page.goto('/es/admin/series/ci-100?tab=tariffs')

    await expect(page.getByRole('tablist', { name: 'Secciones de la serie' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Tarifas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await page.goto('/en/admin/series/ci-100?tab=tariffs')

    await expect(page.getByRole('tablist', { name: 'Series sections' })).toBeVisible()
  })
})

test.describe('shell del panel: diálogo centrado y pestaña al cambiar de idioma (H2/H3 de CIF-281)', () => {
  test('centra el diálogo en escritorio y lo deja como hoja inferior en móvil', async ({
    page,
  }) => {
    await page.goto('/es/admin/tarifas')
    await page.getByRole('button', { name: 'Ver', exact: true }).first().click()

    const dialog = page.locator('dialog[open]')

    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Serie CI-100 · v1')

    const viewport = page.viewportSize()
    const box = await dialog.boundingBox()

    expect(viewport).not.toBeNull()
    expect(box).not.toBeNull()

    if (isMobile(page)) {
      // Hoja inferior (`sistema-de-diseno` §5): pegada al borde de abajo y a todo el ancho.
      expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThanOrEqual(1)
      expect(box!.x).toBeLessThanOrEqual(1)
      expect(Math.abs(box!.x + box!.width - viewport!.width)).toBeLessThanOrEqual(1)
    } else {
      // El preflight de Tailwind v4 (`* { margin: 0 }`) no puede volver a anular el `margin: auto`
      // con el que el navegador centra `dialog:modal` (medido en Chromium 1280×720).
      const centerX = box!.x + box!.width / 2
      const centerY = box!.y + box!.height / 2

      expect(Math.abs(centerX - viewport!.width / 2)).toBeLessThanOrEqual(2)
      expect(Math.abs(centerY - viewport!.height / 2)).toBeLessThanOrEqual(2)
    }
  })

  test('conserva la pestaña del detalle al cambiar de idioma', async ({ page }) => {
    await page.goto('/es/admin/series/ci-100?tab=measures')

    await expect(page.getByRole('tab', { name: 'Medidas' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // `usePathname` no lleva la query: sin el arreglo el conmutador dejaba la pestaña en General.
    await page
      .getByRole('navigation', { name: 'Idioma' })
      .getByRole('link', { name: 'en', exact: true })
      .click()

    await expect(page).toHaveURL(/\/en\/admin\/series\/ci-100\?tab=measures$/)
    await expect(page.getByRole('tab', { name: 'Sizes' })).toHaveAttribute('aria-selected', 'true')
  })
})
/**
 * Pantallas de datos del panel: las dos que leen catálogo (ADR-0023 §3) y, por tanto, las dos que
 * tienen que honrar `?state=` (DoD §6). Cada una con su propio vacío: series estrena catálogo y
 * tarifas responde «Sin tarifas para esta serie.».
 */
const DATA_SCREENS = [
  {
    name: 'series',
    path: '/admin',
    title: 'Series',
    emptyText: 'Todavía no hay series.',
    emptyHelp: 'Crea la primera serie para publicarla en el configurador.',
    emptyCta: '+ Nueva serie',
  },
  {
    name: 'tarifas',
    path: '/admin/tarifas',
    title: 'Tarifas',
    emptyText: 'Sin tarifas para esta serie.',
    emptyHelp: null,
    emptyCta: '+ Nueva versión',
  },
] as const

test.describe('shell del panel: estados del DoD §6', () => {
  for (const screen of DATA_SCREENS) {
    test(`${screen.name}: el vacío usa el mensaje propio de la pantalla`, async ({ page }) => {
      await page.goto(`/es${screen.path}?state=empty`)

      const main = page.getByRole('main')

      await expect(page.getByRole('heading', { level: 1, name: screen.title })).toBeVisible()
      await expect(main).toContainText(screen.emptyText)
      // En series la llamada a la acción está en la cabecera y en el propio vacío: basta con la primera.
      await expect(page.getByRole('button', { name: screen.emptyCta }).first()).toBeVisible()

      if (screen.emptyHelp !== null) {
        await expect(main).toContainText(screen.emptyHelp)
      }

      // El estado manda sobre el contenido: el catálogo de demostración tiene datos y no se pinta.
      await expect(page.getByRole('table')).toHaveCount(0)
    })

    test(`${screen.name}: la carga anuncia el esqueleto sin tabla`, async ({ page }) => {
      await page.goto(`/es${screen.path}?state=loading`)

      const main = page.getByRole('main')

      await expect(main.getByRole('status')).toBeVisible()
      await expect(main).toContainText('Cargando…')
      await expect(page.getByRole('table')).toHaveCount(0)
    })

    test(`${screen.name}: el error trae mensaje traducido y reintento en los dos idiomas`, async ({
      page,
    }) => {
      await page.goto(`/es${screen.path}?state=error`)

      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'No hemos podido cargar los datos.',
      )
      await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
      await expect(page.getByRole('table')).toHaveCount(0)

      await page.goto(`/en${screen.path}?state=error`)

      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        "We couldn't load the data.",
      )
      await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
    })

    test(`${screen.name}: sin permiso explica la falta de acceso`, async ({ page }) => {
      await page.goto(`/es${screen.path}?state=forbidden`)

      const main = page.getByRole('main')

      await expect(main).toContainText('No tienes acceso a esta sección.')
      await expect(main).toContainText('Pide acceso al propietario de la cuenta.')
      await expect(page.getByRole('table')).toHaveCount(0)
    })
  }
})

test.describe('shell del panel: scrim y táctil (M1 de CIF-101)', () => {
  test('el backdrop del diálogo usa el token de scrim y se cierra con Escape', async ({ page }) => {
    await page.goto('/es/admin/tarifas')
    await page.getByRole('button', { name: 'Ver', exact: true }).first().click()

    const dialog = page.locator('dialog[open]')

    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Serie CI-100 · v1')

    // El color se mide computado: ningún componente escribe el literal, sale de `--color-scrim`.
    const backdropColor = await dialog.evaluate(
      (node) => getComputedStyle(node, '::backdrop').backgroundColor,
    )

    expect(backdropColor).toBe('rgba(23, 32, 42, 0.45)')

    await page.keyboard.press('Escape')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
  })

  test('mantiene los objetivos táctiles en 44 px y el foco visible con teclado', async ({
    page,
  }) => {
    await page.goto('/es/admin')

    // El foco se comprueba tabulando: `:focus-visible` solo se activa con una interacción real (un
    // `focus()` programático tras un clic no lo activa y el anillo no se pinta).
    await page.keyboard.press('Tab')

    const focused = page.locator(':focus')

    await expect(focused).toHaveCSS('outline-style', 'solid')
    await expect(focused).toHaveCSS('outline-width', '2px')

    // El enlace de salto solo ocupa la esquina mientras tiene el foco: el siguiente tabulador lo
    // devuelve fuera de la pantalla y deja el menú clicable.
    await page.keyboard.press('Tab')

    if (isMobile(page)) {
      await page.getByRole('button', { name: 'Abrir menú' }).click()
    }

    const firstSectionLink = page.getByRole('link', { name: 'Series', exact: true }).first()
    const box = await firstSectionLink.boundingBox()

    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  })
})
