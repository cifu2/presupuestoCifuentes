/**
 * Guarda de capas del ADR-0001: la capa de aplicación no puede depender de infraestructura.
 *
 * Recorre los módulos de producción de `src/application` y falla si alguno importa
 * `@/infrastructure`. Los tests quedan fuera: montar adaptadores en un test es legítimo y el mundo
 * de pruebas compartido vive en `src/infrastructure/testing` (hallazgo N4 de CIF-78).
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const applicationDirectory = fileURLToPath(new URL('.', import.meta.url))

function productionModules(): string[] {
  return readdirSync(applicationDirectory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.endsWith('.test.ts'))
    .sort()
}

describe('límites de capas de la aplicación', () => {
  it('ningún módulo de aplicación importa infraestructura', () => {
    const offenders = productionModules().filter((file) =>
      readFileSync(file, 'utf8').includes('@/infrastructure'),
    )

    expect(offenders.map((file) => relative(applicationDirectory, file))).toEqual([])
  })
})
