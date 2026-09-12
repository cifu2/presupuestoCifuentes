/**
 * E2E del API de publicación de tarifas (ADR-0003, CIF-82/CIF-86/CIF-87).
 *
 * Cubre de punta a punta la guarda que falla cerrado, el contrato del identificador y la invariante
 * de no solapamiento: 503 sin `ADMIN_API_TOKEN`, 401 con credenciales ausentes o incorrectas, 404
 * `NOT_FOUND` con un id malformado o inexistente (nunca 500), 200 al publicar un borrador sin
 * solape, 200 idempotente al republicar una tarifa ya publicada y 409 `AMBIGUOUS_TARIFF` cuando el
 * borrador solapa con una tarifa publicada.
 *
 * Los casos 503 y 401 no se pueden observar en el mismo servidor, porque son configuraciones de
 * entorno distintas: la suite levanta dos servidores (ver `playwright.config.ts`) y el bloque
 * autenticado cambia de `baseURL`.
 *
 * El caso que publica (200) **muta** el catálogo del servidor de administración, y los proyectos
 * `chromium` y `movil` corren en paralelo (`fullyParallel`): cada proyecto publica el borrador que
 * le corresponde (`PUBLISHABLE_DRAFTS`) para no compartir estado mutable. Sin `skip`.
 */

import { expect, test, type TestInfo } from '@playwright/test'

import { E2E_ADMIN_BASE_URL, E2E_ADMIN_TOKEN } from './support/servers'

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

function publishableDraft(testInfo: TestInfo): PublishableDraft {
  const draft = PUBLISHABLE_DRAFTS[testInfo.project.name as keyof typeof PUBLISHABLE_DRAFTS]

  if (draft === undefined) {
    throw new Error(
      `No hay borrador de E2E para el proyecto "${testInfo.project.name}"; añádelo a PUBLISHABLE_DRAFTS`,
    )
  }

  return draft
}

const DRAFT_WITH_OVERLAP = '0192f1b0-0000-7000-8000-000000000102'
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

  test('publica el borrador de su proyecto sin solape y repetirlo es idempotente', async ({
    request,
  }, testInfo) => {
    const draft = publishableDraft(testInfo)
    const first = await request.post(publishPath(draft.id), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })
    const published = (await first.json()).data

    expect(first.status()).toBe(200)
    expect(published).toMatchObject({
      id: draft.id,
      seriesId: 'series-ci-400',
      versionNumber: draft.versionNumber,
      status: 'published',
      strategy: 'per_square_metre',
      validFrom: draft.validFrom,
      validUntil: draft.validUntil,
      currency: 'EUR',
      taxRatePercent: '21.00',
    })
    expect(published.publishedAt).not.toBeNull()

    const repeated = await request.post(publishPath(draft.id), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(repeated.status()).toBe(200)
    // Republicar no vuelve a escribir: conserva la fecha de publicación original.
    expect((await repeated.json()).data.publishedAt).toBe(published.publishedAt)
  })

  test('rechaza con 409 el borrador que solapa con la tarifa publicada y lo deja intacto', async ({
    request,
  }) => {
    const first = await request.post(publishPath(DRAFT_WITH_OVERLAP), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(first.status()).toBe(409)
    expect((await first.json()).error.code).toBe('AMBIGUOUS_TARIFF')

    // Si el rechazo hubiera escrito la versión, el segundo intento encontraría una tarifa ya
    // publicada y respondería 200 (camino idempotente): el 409 repetido demuestra que sigue en
    // borrador.
    const repeated = await request.post(publishPath(DRAFT_WITH_OVERLAP), {
      headers: withToken(E2E_ADMIN_TOKEN),
    })

    expect(repeated.status()).toBe(409)
    expect((await repeated.json()).error.code).toBe('AMBIGUOUS_TARIFF')
  })
})
