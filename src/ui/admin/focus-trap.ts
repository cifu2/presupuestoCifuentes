/**
 * Trampa de foco del menú móvil del panel (`sistema-de-diseno` §5: foco atrapado y `Esc`, el mismo
 * patrón que el `Modal`/`Sheet`). El `<dialog>` nativo del modal atrapa el foco él solo; el menú es
 * un `nav` desplegado sobre un scrim, así que el ciclo de tabulación se resuelve aquí.
 *
 * La decisión del ciclo es una función pura para poder probarla sin navegador (la suite unitaria
 * corre en el entorno `node`); el recorrido real con `Tab` lo cubre el E2E de `admin-shell`.
 * Hallazgo H2 de CIF-300 → CIF-311.
 */

/** Elementos que participan del ciclo de tabulación, en orden de documento. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Focos del ciclo: el botón que abre el menú primero y, después, los de su contenedor. */
export function cycleElements(
  scope: ParentNode | null,
  trigger: HTMLElement | null,
): HTMLElement[] {
  const inside = scope === null ? [] : [...scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]

  return trigger === null ? inside : [trigger, ...inside]
}

/**
 * Siguiente posición del ciclo. `current` es el índice del foco dentro de los elementos (`-1` si el
 * foco está fuera): al entrar desde fuera, `Tab` cae en el primero y `Shift+Tab` en el último.
 * Devuelve `null` si no hay ningún foco que dar.
 */
export function nextFocusIndex(current: number, total: number, backwards: boolean): number | null {
  if (total <= 0) {
    return null
  }

  if (current < 0) {
    return backwards ? total - 1 : 0
  }

  return backwards ? (current - 1 + total) % total : (current + 1) % total
}

/** Nodo que debe recibir el foco al tabular dentro del ciclo, o `null` si el ciclo está vacío. */
export function nextTrapTarget(
  elements: readonly HTMLElement[],
  active: Element | null,
  backwards: boolean,
): HTMLElement | null {
  const index = elements.findIndex((element) => element === active)
  const next = nextFocusIndex(index, elements.length, backwards)

  return next === null ? null : (elements[next] ?? null)
}
