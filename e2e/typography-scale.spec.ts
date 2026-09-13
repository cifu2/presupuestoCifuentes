import { expect, test, type Page } from '@playwright/test'

/**
 * Escala tipográfica de las páginas públicas (`sistema-de-diseno` §3, adoptada por el CTO en CIF-503
 * y aplicada en CIF-504).
 *
 * El contrato es de **estilo computado**, no de clases: si alguien sustituye la utilidad por otra que
 * pinta lo mismo, el caso sigue verde; si el tamaño o el interlineado se desvían, cae. Es el mismo
 * criterio de CIF-133 (tamaños computados en Chromium).
 *
 * Se mide en los dos proyectos de Playwright: `chromium` (escritorio, ≥ `sm`) y `movil`
 * (`Pixel 7`, por debajo de `sm`), y en los dos idiomas, porque el `lang` cambia el texto pero no la
 * escala.
 */

type Size = { readonly fontSize: string; readonly lineHeight: string }

/** `display` (portada y 404): 40/44 en escritorio y 32/38 por debajo de `sm`. */
const DISPLAY: Readonly<Record<'escritorio' | 'movil', Size>> = {
  escritorio: { fontSize: '40px', lineHeight: '44px' },
  movil: { fontSize: '32px', lineHeight: '38px' },
}

/** `h1` de página pública (configurador y acceso): 32/40 en los dos anchos. */
const H1: Readonly<Record<'escritorio' | 'movil', Size>> = {
  escritorio: { fontSize: '32px', lineHeight: '40px' },
  movil: { fontSize: '32px', lineHeight: '40px' },
}

const CASES = [
  { name: 'portada', path: (locale: string) => `/${locale}`, scale: DISPLAY },
  {
    name: '404 global',
    path: (locale: string) => `/${locale}/no-existe-esta-pagina`,
    scale: DISPLAY,
  },
  { name: 'configurador', path: (locale: string) => `/${locale}/configurador`, scale: H1 },
  { name: 'acceso', path: (locale: string) => `/${locale}/acceso`, scale: H1 },
] as const

const LOCALES = ['es', 'en'] as const

/** Estilo computado del único `h1` de la página (las cuatro solo tienen uno). */
async function measureHeading(page: Page) {
  const heading = page.getByRole('heading', { level: 1 })

  await expect(heading).toHaveCount(1)

  return heading.evaluate((element) => {
    const style = getComputedStyle(element)

    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
    }
  })
}

for (const locale of LOCALES) {
  for (const item of CASES) {
    test(`${item.name} (${locale}) usa la escala computada`, async ({ page }, testInfo) => {
      await page.goto(item.path(locale))

      await expect(page.locator('html')).toHaveAttribute('lang', locale)

      const width = testInfo.project.name === 'movil' ? 'movil' : 'escritorio'

      expect(await measureHeading(page), `${item.name} · ${locale} · ${width}`).toEqual({
        ...item.scale[width],
        fontWeight: '700',
      })
    })
  }
}
