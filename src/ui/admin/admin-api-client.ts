/**
 * Cliente del API del panel (CIF-243, ADR-0023 §7).
 *
 * La UI no construye URLs ni interpreta códigos de estado a mano: pide una operación por su nombre y
 * este módulo arma la petición y traduce la respuesta del borde a un resultado discriminado.
 *
 * Dos reglas del contrato del API que se respetan aquí:
 *
 * - el sobre es `{ data }` en el camino feliz y `{ error: { code, message, issues? } }` en el fallo
 *   (`src/app/api/_lib/http.ts`), así que un `2xx` sin `data` es un error de contrato, no un éxito;
 * - la credencial viaja en la cookie de sesión del panel (CIF-241), de ahí `credentials: same-origin`
 *   en vez de una cabecera `Authorization` construida en el navegador.
 *
 * Los códigos de error del dominio se traducen con `DomainErrors.<CODE>`; los que no son de dominio
 * (`VALIDATION_ERROR` del borde, o cualquier código nuevo) caen en el mensaje genérico del panel, de
 * modo que un código sin traducir nunca deja al propietario sin explicación.
 */

import type { DomainErrorCode } from '@/domain/shared/errors'

import { TRANSLATED_DOMAIN_ERROR_CODES, domainErrorMessageKey } from '@/i18n/domain-errors'

export type AdminApiMethod = 'GET' | 'POST' | 'PATCH'

export interface AdminApiRequest {
  readonly url: string
  readonly method: AdminApiMethod
  readonly body?: unknown
}

export interface AdminApiIssues {
  readonly path: string
  readonly message: string
}

export type AdminApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false
      readonly code: string
      readonly message: string
      readonly issues?: readonly AdminApiIssues[]
    }

const TRANSLATED_CODES = new Set<string>(TRANSLATED_DOMAIN_ERROR_CODES)

/** Clave de traducción del mensaje de error; `null` cuando el código no está traducido. */
export function translatedDomainErrorKey(code: string): string | null {
  return TRANSLATED_CODES.has(code) ? domainErrorMessageKey(code as DomainErrorCode) : null
}

/**
 * Clave del mensaje que la UI muestra para un código de error.
 *
 * `CatalogAdmin.error.saveFailed` es el paracaídas: cubre `VALIDATION_ERROR`, los fallos de conexión y
 * cualquier código que el dominio añada antes de que se traduzca.
 */
export function adminApiErrorMessageKey(code: string): string {
  return translatedDomainErrorKey(code) ?? 'CatalogAdmin.error.saveFailed'
}

function encodeId(id: string): string {
  return encodeURIComponent(id)
}

export function upsertSeriesRequest(body: unknown): AdminApiRequest {
  return { url: '/api/admin/catalog/series', method: 'POST', body }
}

export function updateSeriesRequest(id: string, body: unknown): AdminApiRequest {
  return { url: `/api/admin/catalog/series/${encodeId(id)}`, method: 'PATCH', body }
}

export function deactivateSeriesRequest(id: string): AdminApiRequest {
  return { url: `/api/admin/catalog/series/${encodeId(id)}/deactivate`, method: 'POST', body: {} }
}

export function upsertCatalogItemRequest(
  entity: 'finishes' | 'colors' | 'accessories',
  body: unknown,
): AdminApiRequest {
  return { url: `/api/admin/catalog/${entity}`, method: 'POST', body }
}

export function deactivateCatalogItemRequest(
  entity: 'finish' | 'color' | 'accessory',
  id: string,
): AdminApiRequest {
  return {
    url: `/api/admin/catalog/items/${entity}/${encodeId(id)}/deactivate`,
    method: 'POST',
    body: {},
  }
}

export function updateTariffPriceRequest(id: string, body: unknown): AdminApiRequest {
  return { url: `/api/admin/tariff-versions/${encodeId(id)}/prices`, method: 'PATCH', body }
}

export function publishTariffVersionRequest(id: string): AdminApiRequest {
  return { url: `/api/admin/tariff-versions/${encodeId(id)}/publish`, method: 'POST', body: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readIssues(value: unknown): readonly AdminApiIssues[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const issues = value.flatMap((issue) => {
    if (!isRecord(issue) || typeof issue.path !== 'string' || typeof issue.message !== 'string') {
      return []
    }

    return [{ path: issue.path, message: issue.message }]
  })

  return issues.length === 0 ? undefined : issues
}

/** Lectura de la tabla de precios de una versión: precarga de la edición rápida. */
export function readTariffPriceTableRequest(id: string): AdminApiRequest {
  return { url: `/api/admin/tariff-versions/${encodeId(id)}/prices`, method: 'GET' }
}

/** Traduce el cuerpo de un fallo del borde al resultado que consume la UI. */
export function parseAdminApiError(payload: unknown, status: number): AdminApiResult<never> {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null
  const code =
    typeof error?.code === 'string' && error.code.length > 0 ? error.code : `HTTP_${status}`
  const message = typeof error?.message === 'string' ? error.message : ''
  const issues = readIssues(error?.issues)

  return { ok: false, code, message, ...(issues === undefined ? {} : { issues }) }
}

/**
 * Envía una petición del panel. `fetchImpl` se inyecta para poder probar el contrato sin conexión.
 *
 * Un `2xx` cuyo cuerpo no trae `data` se trata como fallo (`HTTP_<status>`): el sobre del API es una
 * promesa y devolverlo como éxito dejaría a la UI pintando un «guardado» que nunca ocurrió. Un
 * cuerpo ilegible se lee como `null`, que cae en la misma rama.
 */
export async function sendAdminApi<T>(
  fetchImpl: typeof fetch,
  request: AdminApiRequest,
): Promise<AdminApiResult<T>> {
  const response = await fetchImpl(request.url, {
    method: request.method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...(request.method === 'GET' ? {} : { body: JSON.stringify(request.body ?? {}) }),
  })

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    return parseAdminApiError(payload, response.status)
  }

  if (!isRecord(payload) || !('data' in payload)) {
    return { ok: false, code: `HTTP_${response.status}`, message: '' }
  }

  return { ok: true, data: payload.data as T }
}
