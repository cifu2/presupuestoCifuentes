/**
 * E2E del API de publicación de tarifas (ADR-0003, rev. 2 §8-§11; CIF-82/CIF-86/CIF-87/CIF-544).
 *
 * Cubre de punta a punta la guarda que falla cerrado, el contrato del identificador y la invariante
 * de no solapamiento: 503 sin `ADMIN_API_TOKEN`, 401 con credenciales ausentes o incorrectas, 404
 * `NOT_FOUND` con un id malformado o inexistente (nunca 500), 200 al publicar un borrador sin
 * predecesora, 200 idempotente al republicar una tarifa ya publicada y 409 `AMBIGUOUS_TARIFF` cuando
 * la candidata no es posterior a la predecesora de vigencia abierta de su serie.
 *
 * El camino de §8 («publicar cierra la predecesora de vigencia abierta») se comprueba de verdad:
 * publicar la sucesora responde 200 con `closedPredecessor` cerrado en el `validFrom` de la
 * candidata y, después, el configurador sirve el precio nuevo de esa serie. Cada proyecto de
 * Playwright publica en **su** serie (`SUCCESSOR_DRAFTS`), porque con `fullyParallel` los dos
 * proyectos mutan a la vez el mismo servidor y no pueden compartir estado.
 *
 * §12 («el panel dice la verdad») cierra el caso con lo que el panel sirve de verdad: una versión
 * publicada se pinta con su fecha de entrada en vigor en «Vigente desde» y el aviso de la pantalla
 * dice qué le pasa a la anterior al publicar (CIF-545). La aserción **no** observa el efecto de esta
 * publicación en el panel: la página y las rutas HTTP cargan contenedores distintos del catálogo de
 * demostración, con su propio catálogo en memoria cada una (hallazgo de CIF-545).
 *
 * Los casos 503 y 401 no se pueden observar en el mismo servidor, porque son configuraciones de
 * entorno distintas: la suite levanta dos servidores y el bloque autenticado cambia de `baseURL`.
 * El configurador de este bloque es el del servidor de administración —el mismo proceso que acaba
 * de publicar—, no el público: son dos catálogos de demostración en memoria independientes.
 *
 * Sin `skip`: el catálogo de demo se siembra por proceso y los ids de cada proyecto son distintos.
 */

import { expect, test, type TestInfo } from '@playwright/test'

import { E2E_ADMIN_BASE_URL, E2E_ADMIN_PANEL_PASSWORD, E2E_ADMIN_TOKEN } from './support/servers'

/**
 * Borradores que siembra `src/infrastructure/demo/demo-catalog.ts`. Los ids son UUID canónicos
 * porque el borde valida el `:id` como UUID (hallazgo N2 de CIF-85).
 */
interface PublishableDraft {
  readonly id: string
  readonly versionNumber: number
  readonly validFrom: string
  readonly validUntil: string
}

/**
 * Un borrador publicable por proyecto de Playwright, ambos de la serie CI-400 (la única publicada
 * sin tarifa vigente) y con ventanas que no se solapan ni entre sí ni con ninguna publicada. Así el
 * 200 de un proyecto no compite con el del otro.
 */
const PUBLISHABLE_DRAFTS = {
  chromium: {
    id: '0192f1b0-0000-7000-8000-000000000401',
    versionNumber: 1,
    validFrom: '2027-01-01T00:00:00.000Z',
    validUntil: '2028-01-01T00:00:00.000Z',
  },
  movil: {
    id: '0192f1b0-0000-7000-8000-000000000402',
    versionNumber: 2,
    validFrom: '2029-01-01T00:00:00.000Z',
    validUntil: '2030-01-01T00:00:00.000Z',
  },
} as const satisfies Record<string, PublishableDraft>

/**
 * Sucesora con predecesora de vigencia abierta, una serie por proyecto. La v1 de cada serie está
 * publicada y abierta desde 2026-01-01; el borrador entra en vigor después (y antes que el instante
 * de la suite), así que el configurador pasa a dar su precio en cuanto se publica. El precio base
 * esperado es el de la tabla del borrador, no el de la v1.
 */
const SUCCESSOR_DRAFTS = {
  chromium: {
    id: '0192f1b0-0000-7000-8000-000000000102',
    versionNumber: 2,
    seriesName: 'Serie CI-100',
    predecessorId: '0192f1b0-0000-7000-8000-000000000101',
    predecessorVersionNumber: 1,
    predecessorValidFrom: '2026-01-01T00:00:00.000Z',
    validFrom: '2026-06-01T00:00:00.000Z',
    priceQuery: { seriesSlug: 'ci-100', widthMm: 900, heightMm: 2000 },
    // 500,00 €/m² × 1,8 m² exactos.
    expectedBasePrice: '900.00',
  },
  movil: {
    id: '0192f1b0-0000-7000-8000-000000000302',
    versionNumber: 2,
    seriesName: 'Serie CI-300',
    predecessorId: '0192f1b0-0000-7000-8000-000000000301',
    predecessorVersionNumber: 1,
    predecessorValidFrom: '2026-01-01T00:00:00.000Z',
    validFrom: '2026-07-01T00:00:00.000Z',
    priceQuery: { seriesSlug: 'ci-300', widthMm: 800, heightMm: 2000 },
    // Precio fijo de la tabla del borrador.
    expectedBasePrice: '1620.00',
  },
} as const

/**
 * El día de entrada en vigor tal como lo pinta el panel: la columna «Vigente desde» usa el formato
 * del idioma de la página (`formatDay`, `src/ui/admin/panel-navigation.ts`). Se calcula con la misma
 * llamada a `Intl` que la interfaz para que el E2E afirme el texto servido, no una cadena copiada.
 */
function panelDay(isoInstant: string): string {
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(isoInstant),
  )
}

function byProject<T>(drafts: Record<string, T>, testInfo: TestInfo): T {
  const draft = drafts[testInfo.project.name]

  if (draft === undefined) {
    throw new Error(
      `No hay borrador de E2E para el proyecto "${testInfo.project.name}"; añádelo al mapa`,
    )
  }

  return draft
}

function publishableDraft(testInfo: TestInfo): PublishableDraft {
  return byProject(PUBLISHABLE_DRAFTS, testInfo)
}

/**
 * Borrador de CI-200 que empieza a la vez que su v1 publicada: la candidata no es posterior a la
 * predecesora abierta, así que la publicación falla cerrada sin escribir. Es idempotente entre
 * proyectos y entre repeticiones porque nunca muta el catálogo.
 */
const DRAFT_STARTING_WITH_OPEN_PREDECESSOR = '0192f1b0-0000-7000-8000-000000000202'
/** v1 publicada de la serie CI-100; republicarla es el camino idempotente puro (sin escribir). */
const PUBLISHED_CI_100_V1 = '0192f1b0-0000-7000-8000-000000000101'
/** UUID válido que no corresponde a ninguna versión de tarifa. */
const MISSING_TARIFF = '00000000-0000-4000-8000-000000000000'
/** Id con formato legado: no es UUID, así que el borde lo corta antes de consultar el catálogo. */
const NON_UUID_ID = 'tariff-ci-100-v1'

function publishPath(tariffVersionId: string): string {
  return `/api/admin/tariff-versions/${tariffVersionId}/publish`
}

function withToken(token: string): { readonly authorization: string } {
  return { authorization: `Bearer ${token}` }
}

test.describe('sin ADMIN_API_TOKEN, el endpoint de publicación', () => {
  test('falla cerrado con 503 y no llega a mirar la versión', async ({ request }, testInfo) => {
    // Ni un borrador publicable ni un id inexistente pasan de la guarda: la comprobación de
    // existencia ocurre después, así que ambos responden 503 (no 404).
    for (const tariffVersionId of [publishableDraft(testInfo).id, MISSING_TARIFF]) {
      const response = await request.post(publishPath(tariffVersionId))
      const body = await response.json()

      expect(response.status()).toBe(503)
      expect(body.error.code).toBe('ADMIN_API_DISABLED')
    }
  })
})

test.describe('con ADMIN_API_TOKEN, el endpoint de publicación', () => {
  test.use({ baseURL: E2E_ADMIN_BASE_URL })

  test('rechaza con 401 las credenciales ausentes o incorrectas', async ({ request }, testInfo) => {
    const withoutCredentials = await request.post(publishPath(publishableDraft(testInfo).id))

    expect(withoutCredentials.status()).toBe(401)
    expect((await withoutCredentials.json()).error.code).toBe('UNAUTHORIZED')

    const withWrongToken = await request.post(publishPath(publishableDraft(testInfo).id), {
      headers: withToken(`${E2E_ADMIN_TOKEN}-incorrecto`),
    })

    expect(withWrongToken.status()).toBe(401)
    expect((await withWrongToken.json()).error.code).toBe('UNAUTHORIZED')
  })

  test('responde 404 NOT_FOUND con un id que no es UUID, sin 500', async ({ request }) => {
    const response = await request.post(publishPath(NON_UUID_ID), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(response.status()).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
  })

  test('responde 404 NOT_FOUND con un UUID válido que no existe, sin 500', async ({ request }) => {
    const response = await request.post(publishPath(MISSING_TARIFF), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(response.status()).toBe(404)
    expect((await response.json()).error.code).toBe('NOT_FOUND')
  })

  test('republicar la v1 publicada de CI-100 responde 200 y conserva su publicación', async ({
    request,
  }) => {
    const first = await request.post(publishPath(PUBLISHED_CI_100_V1), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })
    const published = (await first.json()).data

    expect(first.status()).toBe(200)
    expect(published).toMatchObject({
      id: PUBLISHED_CI_100_V1,
      seriesId: 'series-ci-100',
      versionNumber: 1,
      status: 'published',
    })
    // Ya estaba publicada con la fecha de la semilla: republicar no la reescribe.
    expect(published.publishedAt).toBe('2026-01-01T00:00:00.000Z')

    const repeated = await request.post(publishPath(PUBLISHED_CI_100_V1), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(repeated.status()).toBe(200)
    expect((await repeated.json()).data.publishedAt).toBe(published.publishedAt)
  })

  test('publica sobre la predecesora abierta, la cierra en el validFrom y deja el precio nuevo', async ({
    request,
    page,
  }, testInfo) => {
    const draft = byProject(SUCCESSOR_DRAFTS, testInfo)
    const published = await publish(request, draft.id)

    expect(published.status).toBe(200)
    expect(published.data).toMatchObject({
      id: draft.id,
      versionNumber: draft.versionNumber,
      status: 'published',
      validFrom: draft.validFrom,
      validUntil: null,
    })
    // §8: la predecesora se cierra en el validFrom de la candidata y conserva el estado publicado.
    expect(published.data.closedPredecessor).toEqual({
      id: draft.predecessorId,
      versionNumber: draft.predecessorVersionNumber,
      status: 'published',
      validFrom: draft.predecessorValidFrom,
      validUntil: draft.validFrom,
    })

    const repeated = await request.post(publishPath(draft.id), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(repeated.status()).toBe(200)
    // Republicar no vuelve a escribir: conserva la fecha de publicación original.
    expect((await repeated.json()).data.publishedAt).toBe(published.data.publishedAt)

    // Y el configurador (el mismo proceso que acaba de publicar) sirve el precio de la sucesora: la
    // predecesora ya no está vigente, así que no hay dos tarifas en vigor para la serie.
    const price = await request.post('/api/quotes/price', {
      data: { ...draft.priceQuery, locale: 'es' },
    })
    const priceBody = await price.json()

    expect(price.status()).toBe(200)
    expect(priceBody.status).toBe('priced')
    expect(priceBody.breakdown.basePrice.amount).toBe(draft.expectedBasePrice)

    // §12: el panel dice la misma verdad que la respuesta de publicación. La página del panel y las
    // rutas HTTP del catálogo de demostración no comparten contenedor —cada capa resuelve el suyo, con
    // su propio catálogo en memoria—, así que la aserción va sobre lo que el panel sí sirve: una
    // versión publicada con su fecha de entrada en vigor en «Vigente desde», la misma columna y el
    // mismo formato con los que anunciará la fecha de la versión nueva (CIF-545).
    const session = await page.request.post('/api/admin/session', {
      data: { password: E2E_ADMIN_PANEL_PASSWORD },
    })

    expect(session.status()).toBe(200)

    await page.goto('/es/admin/tarifas')

    const predecessorRow = page
      .getByRole('row')
      .filter({ hasText: draft.seriesName })
      .filter({ hasText: `v${draft.predecessorVersionNumber}` })

    await expect(predecessorRow).toContainText(panelDay(draft.predecessorValidFrom))
    // Y el aviso de la pantalla explica qué le pasa a la versión anterior, sin prometer dos pasos.
    await expect(page.getByRole('main')).toContainText(
      'deja sin vigencia a la anterior en ese mismo instante',
    )
  })

  test('publica el borrador de su proyecto sin predecesora y repetirlo es idempotente', async ({
    request,
  }, testInfo) => {
    const draft = publishableDraft(testInfo)
    const published = await publish(request, draft.id)

    expect(published.status).toBe(200)
    expect(published.data).toMatchObject({
      id: draft.id,
      seriesId: 'series-ci-400',
      versionNumber: draft.versionNumber,
      status: 'published',
      strategy: 'per_square_metre',
      validFrom: draft.validFrom,
      validUntil: draft.validUntil,
      currency: 'EUR',
      taxRatePercent: '21.00',
      // CI-400 no tiene ninguna publicada con vigencia abierta: no hay predecesora que cerrar.
      closedPredecessor: null,
    })
    expect(published.data.publishedAt).not.toBeNull()

    const repeated = await request.post(publishPath(draft.id), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(repeated.status()).toBe(200)
    // Republicar no vuelve a escribir: conserva la fecha de publicación original.
    expect((await repeated.json()).data.publishedAt).toBe(published.data.publishedAt)
  })

  test('rechaza con 409 la candidata que no es posterior a la predecesora abierta y no escribe', async ({
    request,
  }) => {
    const first = await request.post(publishPath(DRAFT_STARTING_WITH_OPEN_PREDECESSOR), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(first.status()).toBe(409)
    expect((await first.json()).error.code).toBe('AMBIGUOUS_TARIFF')

    // Si el rechazo hubiera escrito la versión, el segundo intento encontraría una tarifa ya
    // publicada y respondería 200 (camino idempotente): el 409 repetido demuestra que sigue en
    // borrador y que tampoco se ha cerrado la predecesora.
    const repeated = await request.post(publishPath(DRAFT_STARTING_WITH_OPEN_PREDECESSOR), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(repeated.status()).toBe(409)
    expect((await repeated.json()).error.code).toBe('AMBIGUOUS_TARIFF')
  })
})

/** Publica y devuelve el cuerpo tipado, para no repetir el `json()` en cada caso. */
async function publish(
  request: import('@playwright/test').APIRequestContext,
  tariffVersionId: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  const response = await request.post(publishPath(tariffVersionId), {
    headers: withToken(E2E_ADMIN_TOKEN),
  })

  return { status: response.status(), data: (await response.json()).data }
}
