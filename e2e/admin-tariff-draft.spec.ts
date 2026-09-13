/**
 * E2E del API que abre un borrador de tarifa (CIF-126a, hueco G1 de CIF-243).
 *
 * Es el flujo que estrena el panel: sobre una serie cuya última versión está **publicada** —el caso
 * normal en producción— el propietario abre la siguiente versión en borrador, clonando la tabla de
 * precios vigente, y el configurador sigue dando exactamente el mismo precio: una versión en borrador
 * no da precio hasta publicarse (ADR-0003). Sin este caso de uso, el panel solo podía responder
 * `409 TARIFF_NOT_EDITABLE`.
 *
 * Los ids del catálogo de demostración son legibles (`series-ci-100`): el contrato acepta `seriesId`
 * como string de hasta 100 caracteres, igual que el id que devuelve la lectura de administración del
 * panel. Solo `cloneFromVersionId` es un UUID canónico, porque el borde sí lo valida como tal. Cada
 * proyecto de Playwright usa una serie distinta (corren en paralelo y el endpoint muta el catálogo
 * del servidor): `chromium` estrena CI-100 y `movil`, CI-300.
 */

import { expect, test, type TestInfo } from '@playwright/test'

import { E2E_ADMIN_BASE_URL, E2E_ADMIN_PANEL_PASSWORD, E2E_ADMIN_TOKEN } from './support/servers'

interface SupersededSeries {
  readonly seriesId: string
  readonly slug: string
  readonly cloneFromVersionId: string
  readonly expectedVersionNumber: number
  readonly basePriceAmount: string
}

const SUPERSEDED_SERIES = {
  chromium: {
    seriesId: 'series-ci-100',
    slug: 'ci-100',
    // v1 publicada de CI-100; la serie ya tiene además el borrador v2 de la semilla.
    cloneFromVersionId: '0192f1b0-0000-7000-8000-000000000101',
    expectedVersionNumber: 3,
    basePriceAmount: '380.00',
  },
  movil: {
    seriesId: 'series-ci-300',
    slug: 'ci-300',
    cloneFromVersionId: '0192f1b0-0000-7000-8000-000000000301',
    expectedVersionNumber: 2,
    basePriceAmount: '1450.00',
  },
} as const satisfies Record<string, SupersededSeries>

function superseded(testInfo: TestInfo): SupersededSeries {
  const series = SUPERSEDED_SERIES[testInfo.project.name as keyof typeof SUPERSEDED_SERIES]

  if (series === undefined) {
    throw new Error(
      `No hay serie de E2E para el proyecto "${testInfo.project.name}"; añádela a SUPERSEDED_SERIES`,
    )
  }

  return series
}

function withToken(token: string): { readonly authorization: string } {
  return { authorization: `Bearer ${token}` }
}

function pricePath(): string {
  return '/api/quotes/price'
}

const DRAFT_PATH = '/api/admin/tariff-versions'

test.describe('sin ADMIN_API_TOKEN, abrir un borrador de tarifa', () => {
  test('falla cerrado con 503 antes de mirar el catálogo', async ({ request }, testInfo) => {
    const response = await request.post(DRAFT_PATH, {
      data: { seriesId: superseded(testInfo).seriesId },
    })

    expect(response.status()).toBe(503)
    expect((await response.json()).error.code).toBe('ADMIN_API_DISABLED')
  })
})

test.describe('con ADMIN_API_TOKEN, abrir un borrador de tarifa', () => {
  test.use({ baseURL: E2E_ADMIN_BASE_URL })

  test('responde 401 sin credencial válida', async ({ request }, testInfo) => {
    const response = await request.post(DRAFT_PATH, {
      data: { seriesId: superseded(testInfo).seriesId },
      headers: withToken(`${E2E_ADMIN_TOKEN}-incorrecto`),
    })

    expect(response.status()).toBe(401)
    expect((await response.json()).error.code).toBe('UNAUTHORIZED')
  })

  test('abre el borrador clonando la vigente sin cambiar el precio del configurador', async ({
    request,
  }, testInfo) => {
    const series = superseded(testInfo)
    const configuration = { seriesSlug: series.slug, widthMm: 900, heightMm: 2100 }

    const priceBefore = await request.post(pricePath(), { data: configuration })
    const before = await priceBefore.json()

    expect(priceBefore.status()).toBe(200)
    expect(before.status).toBe('priced')

    const response = await request.post(DRAFT_PATH, {
      data: {
        seriesId: series.seriesId,
        cloneFromVersionId: series.cloneFromVersionId,
        notes: 'E2E: cambio de precio',
      },
      headers: withToken(E2E_ADMIN_TOKEN),
    })
    const draft = (await response.json()).data

    expect(response.status()).toBe(201)
    expect(draft).toMatchObject({
      seriesId: series.seriesId,
      status: 'draft',
      currency: 'EUR',
      validUntil: null,
      notes: 'E2E: cambio de precio',
    })
    // El número siguiente depende de cuántos borradores haya abierto ya la suite (reintentos de CI
    // incluidos), así que se comprueba que es posterior al de la versión clonada.
    expect(draft.versionNumber).toBeGreaterThanOrEqual(series.expectedVersionNumber)
    // La tabla de precios viaja clonada, con la fila base de la versión vigente.
    expect(draft.priceTable.perSquareMetre?.amount ?? draft.priceTable.fixedPrice?.amount).toBe(
      series.basePriceAmount,
    )

    // Mientras el borrador no se publique, el configurador da el mismo precio: nada cambia para el
    // cliente hasta que el propietario publique.
    const priceAfter = await request.post(pricePath(), { data: configuration })
    const after = await priceAfter.json()

    expect(after.status).toBe('priced')
    expect(after.breakdown.total).toEqual(before.breakdown.total)
  })
})

/**
 * El aviso que lee el propietario antes de tocar un precio (ADR-0003 rev. 2 §12, CIF-545): una
 * tarifa publicada no se edita —es el registro del precio que estuvo vigente— y el cambio va en la
 * versión nueva, que entra en vigor en su fecha y deja sin vigencia a la anterior en ese mismo
 * instante. Se afirma el **texto servido** por el panel, en los dos idiomas, y no la clave de
 * traducción: es el contrato que ve quien publica.
 */
const NOT_EDITABLE_NOTICE = {
  es: ['Una tarifa publicada no se edita', 'deja sin vigencia a la anterior en ese mismo instante'],
  en: [
    'A published price list is not edited',
    'puts the previous one out of force at that very instant',
  ],
} as const

test.describe('con ADMIN_API_TOKEN, el aviso del panel sobre una tarifa publicada', () => {
  test.use({ baseURL: E2E_ADMIN_BASE_URL })

  test.beforeEach(async ({ page }) => {
    const session = await page.request.post('/api/admin/session', {
      data: { password: E2E_ADMIN_PANEL_PASSWORD },
    })

    expect(session.status()).toBe(200)
  })

  for (const locale of ['es', 'en'] as const) {
    test(`dice en ${locale} que la tarifa publicada no se edita y cuándo entra en vigor la nueva`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/admin/tarifas`)

      const main = page.getByRole('main')

      for (const fragment of NOT_EDITABLE_NOTICE[locale]) {
        await expect(main).toContainText(fragment)
      }
      // El aviso es para el propietario: ni el código del error ni la promesa de una salida de dos
      // pasos (la serie no se queda sin tarifa vigente en ningún momento).
      await expect(main).not.toContainText('TARIFF_NOT_EDITABLE')
      await expect(main).not.toContainText('dos pasos')
    })
  }
})
