/**
 * Lógica de la edición rápida de precios del panel (CIF-243, ADR-0023 §7).
 *
 * Vive fuera del componente para poder probarla sin navegador, como el resto de la fase 1 del panel.
 *
 * La regla que importa: la edición rápida envía **solo lo que el propietario ha cambiado**. El caso
 * de uso reemplaza la tabla completa de la versión, así que mandar un campo vacío que nadie tocó
 * borraría un precio vivo; por eso el diff distingue «no lo he tocado» (ausente) de «lo he vaciado»
 * (`null`).
 */

import type { CatalogStatus } from '@/domain/catalog/catalog-status'

/** Vista mínima de la tabla de precios que consume el formulario (subconjunto de `PriceTableOutput`). */
export interface PriceTableValue {
  readonly amount: string
  readonly currency: string
}

export interface PriceTableView {
  readonly tariffVersionId: string
  readonly strategy: string
  readonly perSquareMetre: PriceTableValue | null
  readonly fixedPrice: PriceTableValue | null
  readonly bands: readonly unknown[]
  readonly modifiers: readonly unknown[]
}

export interface PriceQuickEditForm {
  readonly perSquareMetre: string
  readonly fixedPrice: string
}

export type PriceQuickEditField = keyof PriceQuickEditForm

export const EMPTY_FORM: PriceQuickEditForm = { perSquareMetre: '', fixedPrice: '' }

/**
 * Importe tal y como lo acepta el borde (`decimalSchema` de `admin-catalog-schemas.ts`), con la
 * coma decimal que el propietario teclea en español normalizada a punto.
 */
const DECIMAL = /^-?\d{1,9}(\.\d{1,4})?$/

/** `''` se lee como «vaciar» (`null`); un valor no vacío que no es decimal es un error de teclado. */
export function normalizePriceInput(
  raw: string,
): { ok: true; value: string | null } | { ok: false } {
  const trimmed = raw.trim()

  if (trimmed === '') {
    return { ok: true, value: null }
  }

  const normalized =
    trimmed.includes(',') && !trimmed.includes('.') ? trimmed.replace(',', '.') : trimmed

  return DECIMAL.test(normalized) ? { ok: true, value: normalized } : { ok: false }
}

/** Estado inicial del formulario a partir de la tabla leída; `null` (sin tabla) deja los campos vacíos. */
export function toPriceQuickEditForm(table: PriceTableView | null): PriceQuickEditForm {
  return {
    perSquareMetre: table?.perSquareMetre?.amount ?? '',
    fixedPrice: table?.fixedPrice?.amount ?? '',
  }
}

export interface PriceQuickEditPatch {
  readonly perSquareMetre?: string | null
  readonly fixedPrice?: string | null
}

export type PriceQuickEditDiff =
  | { readonly ok: true; readonly patch: PriceQuickEditPatch; readonly changed: boolean }
  | { readonly ok: false; readonly field: PriceQuickEditField }

/**
 * Diff entre lo que había y lo que hay en el formulario: solo los campos tocados viajan al API.
 *
 * Un importe ilegible detiene el envío y señala el campo (`field`) para que la UI lo marque, en vez
 * de mandar `NaN` o el texto tal cual y dejar que falle lejos del dedo que lo escribió.
 */
export function diffPriceQuickEdit(
  initial: PriceQuickEditForm,
  draft: PriceQuickEditForm,
): PriceQuickEditDiff {
  const patch: { perSquareMetre?: string | null; fixedPrice?: string | null } = {}

  for (const field of ['perSquareMetre', 'fixedPrice'] as const) {
    if (draft[field] === initial[field]) {
      continue
    }

    const parsed = normalizePriceInput(draft[field])

    if (!parsed.ok) {
      return { ok: false, field }
    }

    patch[field] = parsed.value
  }

  return { ok: true, patch, changed: Object.keys(patch).length > 0 }
}

/**
 * `true` si publicar la versión respondería `EMPTY_PRICE_TABLE` (ADR-0027 §5): el dominio exige
 * tarifa con precios, y el aviso tiene que estar **antes** del clic, no después del 409.
 */
export function isEmptyPriceTable(table: PriceTableView | null): boolean {
  if (table === null) {
    return true
  }

  return table.perSquareMetre === null && table.fixedPrice === null && table.bands.length === 0
}

/** Motivo por el que la edición rápida está cerrada, o `null` si se puede editar. */
export function priceEditLockReason(status: CatalogStatus): 'published' | 'archived' | null {
  if (status === 'draft') {
    return null
  }

  return status === 'published' ? 'published' : 'archived'
}
