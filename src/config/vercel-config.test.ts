import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = new URL('../../', import.meta.url)
const vercelJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('vercel.json', repositoryRoot)), 'utf8'),
) as {
  $schema?: string
  git?: { deploymentEnabled?: Record<string, boolean> }
  buildCommand?: unknown
  ignoreCommand?: unknown
}

const deploymentEnabled = vercelJson.git?.deploymentEnabled ?? {}
const disabledBranches = Object.entries(deploymentEnabled)
  .filter(([, enabled]) => enabled === false)
  .map(([branch]) => branch)
  .sort()

describe('vercel.json: control del consumo de despliegues (ADR-0019)', () => {
  it('declara el esquema oficial de vercel.json', () => {
    expect(vercelJson.$schema).toBe('https://openapi.vercel.sh/vercel.json')
  })

  it('nunca apaga el despliegue de producción: un merge a `main` tiene que desplegar', () => {
    // CIF-149: `main@15b477a` se quedó sin despliegue de producción al agotarse la cuota y producción
    // sirvió el deployment anterior hasta que alguien lo relanzó a mano. Un `"main": false` (o un
    // comodín global) dejaría ese hueco abierto de forma permanente y silenciosa.
    expect(deploymentEnabled.main).not.toBe(false)
    expect(deploymentEnabled['*']).not.toBe(false)
    expect(deploymentEnabled['**']).not.toBe(false)
  })

  it('solo apaga las ramas sin código de la aplicación, que no necesitan preview', () => {
    // La lista blanca es la de ADR-0019, ampliada en la revisión de 7 días (CIF-153/CIF-155): los PR
    // de Dependabot los validan `calidad` y `e2e` (docs/despliegue.md §7) y las ramas `archive/**` ya
    // están archivadas. `docs/**` se apaga porque `scripts/docs-preview-guard.sh` falla si la rama
    // toca algo fuera de `docs/**` y `**/*.md`; sin esa guardia el ahorro no está autorizado y este
    // test obliga a justificarlo. Cualquier otra rama conserva su preview porque QA valida ahí.
    expect(disabledBranches).toEqual(['archive/**', 'dependabot/**', 'docs/**'])
  })

  it('no usa `ignoreCommand`: el Ignored Build Step no ahorra cuota', () => {
    // El comando del Ignored Build Step se ejecuta cuando el deployment ya está en `BUILDING`
    // (docs de Vercel), así que el despliegue se crea y se cancela: ahorra minutos de build, no
    // despliegues. Si algún día se añade por otro motivo, este test obliga a justificarlo aquí.
    expect(vercelJson).not.toHaveProperty('ignoreCommand')
  })

  it('no duplica configuración de build en el repositorio', () => {
    // El framework, el comando de build y la versión de Node se detectan solos (docs/despliegue.md §2).
    expect(vercelJson).not.toHaveProperty('buildCommand')
    expect(vercelJson).not.toHaveProperty('framework')
  })
})
