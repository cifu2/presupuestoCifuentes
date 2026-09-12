/**
 * Utilidades del borde HTTP.
 *
 * Único sitio donde un error de dominio se convierte en código HTTP (docs/coding-conventions.md):
 * nunca se devuelve un stack trace al cliente y los códigos de error son estables.
 */

import { NextResponse } from 'next/server'
import type { ZodError, ZodType } from 'zod'

import { isDomainError, type DomainErrorCode } from '@/domain/shared/errors'

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  INVALID_VALUE: 400,
  INVALID_MEASUREMENT: 400,
  INVALID_SIZE_RANGE: 400,
  INVALID_CATALOG_VALUE: 400,
  INVALID_CATALOG_TEXT: 400,
  UNSUPPORTED_LOCALE: 400,
  INVALID_VALIDITY_PERIOD: 400,
  INVALID_TARIFF: 400,
  AMBIGUOUS_TARIFF: 409,
  INVALID_SERIES_TRANSITION: 409,
  INVALID_CATALOG_TRANSITION: 409,
  INVALID_MANUAL_QUOTE_REQUEST: 400,
  INVALID_MANUAL_QUOTE_TRANSITION: 409,
  INVALID_QUOTE: 400,
  INVALID_QUOTE_TRANSITION: 409,
  INVALID_QUOTE_REFERENCE: 400,
  INVALID_QUOTE_DELIVERY: 400,
  INVALID_QUOTE_DELIVERY_TRANSITION: 409,
  // Fallback defensivo: hoy los casos de uso de entrega filtran el agotamiento y responden 200 con
  // `attempts_exhausted`, así que este mapeo no se alcanza por HTTP (CIF-195, N2 de CIF-194).
  QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED: 409,
  // Escritura de catálogo (CIF-126a). El `Record` es exhaustivo, así que los códigos nuevos del
  // dominio se mapean aquí aunque los endpoints de escritura sean de CIF-243.
  CONFLICT: 409,
  SERIES_IN_USE: 409,
  ITEM_IN_USE: 409,
  EMPTY_PRICE_TABLE: 409,
  TARIFF_NOT_EDITABLE: 409,
  NOT_FOUND: 404,
}

export interface ApiError {
  readonly error: {
    readonly code: string
    readonly message: string
    readonly issues?: readonly { readonly path: string; readonly message: string }[]
  }
}

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status })
}

export function validationErrorResponse(error: ZodError): NextResponse {
  const body: ApiError = {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'La petición no es válida',
      issues: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
  }

  return jsonResponse(body, 400)
}

export function errorResponse(error: unknown): NextResponse {
  if (isDomainError(error)) {
    const body: ApiError = { error: { code: error.code, message: error.message } }

    return jsonResponse(body, STATUS_BY_CODE[error.code])
  }

  // Error inesperado: se registra sin datos personales y se responde genérico.
  console.error('[api] error inesperado', error instanceof Error ? error.name : typeof error)

  return jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, 500)
}

/** Lee y valida el cuerpo JSON con Zod; lanza la respuesta de error si no es válido. */
export async function readJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const payload = await parseJsonBody(request)

  if (!payload.ok) {
    return payload
  }

  return validateBody(payload.data, schema)
}

/**
 * Como `readJsonBody`, pero un cuerpo vacío equivale a `{}`: para acciones sin parámetros
 * (reintentar una entrega) un POST sin cuerpo es una petición válida, no un error de formato.
 */
export async function readOptionalJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const raw = await request.text()

  if (raw.trim().length === 0) {
    return validateBody({}, schema)
  }

  let payload: unknown

  try {
    payload = JSON.parse(raw)
  } catch {
    return invalidJsonResponse()
  }

  return validateBody(payload, schema)
}

async function parseJsonBody(
  request: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, data: await request.json() }
  } catch {
    return invalidJsonResponse()
  }
}

function validateBody<T>(
  payload: unknown,
  schema: ZodType<T>,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(payload)

  if (!result.success) {
    return { ok: false, response: validationErrorResponse(result.error) }
  }

  return { ok: true, data: result.data }
}

function invalidJsonResponse(): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: jsonResponse(
      { error: { code: 'INVALID_JSON', message: 'El cuerpo debe ser JSON válido' } },
      400,
    ),
  }
}
