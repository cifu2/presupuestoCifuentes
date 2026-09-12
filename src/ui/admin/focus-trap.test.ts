import { describe, expect, it } from 'vitest'

import { FOCUSABLE_SELECTOR, cycleElements, nextFocusIndex, nextTrapTarget } from './focus-trap'

/**
 * Trampa de foco del menú móvil (H2 de CIF-300 → CIF-311). El ciclo se prueba aquí sin navegador;
 * el recorrido real con `Tab` y el scrim lo cubre `e2e/admin-shell.spec.ts` en el proyecto `movil`.
 */

const cycle = ['menú', 'Series', 'Acabados', 'Colores', 'Accesorios', 'Tarifas', 'Idiomas'].map(
  (name) => ({ name }) as unknown as HTMLElement,
)

describe('ciclo de foco del menú', () => {
  it('recorre los elementos en orden y vuelve al primero después del último', () => {
    expect(nextFocusIndex(0, cycle.length, false)).toBe(1)
    expect(nextFocusIndex(cycle.length - 1, cycle.length, false)).toBe(0)
  })

  it('hacia atrás vuelve al último desde el primero', () => {
    expect(nextFocusIndex(0, cycle.length, true)).toBe(cycle.length - 1)
    expect(nextFocusIndex(3, cycle.length, true)).toBe(2)
  })

  it('entra por el primero al tabular desde fuera y por el último con `Shift+Tab`', () => {
    expect(nextFocusIndex(-1, cycle.length, false)).toBe(0)
    expect(nextFocusIndex(-1, cycle.length, true)).toBe(cycle.length - 1)
  })

  it('no da foco cuando el menú no tiene elementos', () => {
    expect(nextFocusIndex(0, 0, false)).toBeNull()
    expect(nextTrapTarget([], null, false)).toBeNull()
  })

  it('devuelve el nodo siguiente y envuelve el ciclo', () => {
    expect(nextTrapTarget(cycle, cycle[0] ?? null, false)).toBe(cycle[1])
    expect(nextTrapTarget(cycle, cycle[cycle.length - 1] ?? null, false)).toBe(cycle[0])
    expect(nextTrapTarget(cycle, cycle[0] ?? null, true)).toBe(cycle[cycle.length - 1])
  })

  it('trata un foco de fuera del ciclo como una entrada desde el principio', () => {
    expect(nextTrapTarget(cycle, null, false)).toBe(cycle[0])
    expect(nextTrapTarget(cycle, { name: 'main' } as unknown as Element, false)).toBe(cycle[0])
    expect(nextTrapTarget(cycle, { name: 'main' } as unknown as Element, true)).toBe(
      cycle[cycle.length - 1],
    )
  })

  it('completa los focos del contenedor con el botón que abre el menú, delante', () => {
    const trigger = { name: 'Abrir menú' } as unknown as HTMLElement
    const scope = {
      querySelectorAll: () => cycle.slice(1),
    } as unknown as ParentNode

    expect(cycleElements(scope, trigger)).toEqual([trigger, ...cycle.slice(1)])
    expect(cycleElements(null, trigger)).toEqual([trigger])
    expect(cycleElements(null, null)).toEqual([])
  })

  it('el selector no deja fuera enlaces ni botones y descarta los `tabindex="-1"`', () => {
    expect(FOCUSABLE_SELECTOR).toContain('a[href]')
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })
})
