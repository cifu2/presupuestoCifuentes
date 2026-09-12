import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Guarda de regresión de los estilos del diálogo. El centrado real se mide en el E2E
 * (`e2e/admin-shell.spec.ts`, H2 de CIF-281): en el entorno `node` de la suite no hay maquetación,
 * así que aquí solo se comprueba que las declaraciones que lo hacen posible siguen en `admin.css`.
 */

// Sin comentarios: los bloques se extraen con una regex que no entiende de `}` dentro de un texto.
const css = readFileSync(fileURLToPath(new URL('./admin.css', import.meta.url)), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

function rule(selector: string): string {
  return new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
}

describe('estilos del diálogo del panel', () => {
  it('centra el modal en escritorio (H2 de CIF-281)', () => {
    // El preflight de Tailwind v4 (`* { margin: 0 }`) anula el `margin: auto` de la hoja del navegador.
    expect(rule('\\.admin-dialog')).toMatch(/margin:\s*auto/)
  })

  it('en móvil lo ancla como hoja inferior y anula el centrado', () => {
    const mobile =
      /@media \(max-width: 767px\)\s*\{\s*\.admin-dialog\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''

    expect(mobile).toMatch(/inset:\s*auto 0 0 0/)
    expect(mobile).toMatch(/margin:\s*0/)
  })
})
