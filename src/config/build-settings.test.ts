import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = new URL('../../', import.meta.url)
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('package.json', repositoryRoot)), 'utf8'),
) as { scripts?: Record<string, string> }
const scripts = packageJson.scripts ?? {}

describe('build de producción versionado con el repositorio', () => {
  it('fuerza NODE_ENV=production para que el prerender no dependa del entorno', () => {
    // Next 16 respeta un `NODE_ENV=development` heredado y cambia a su modo debug de prerender; en
    // ese modo el prerender de la página builtin `/_global-error` aborta el build (CIF-49). El job
    // `e2e` de CI no exporta NODE_ENV, así que el fallo solo aparece en entornos que lo inyectan:
    // sin esta guarda, quitar el prefijo dejaría el CI en verde y el build roto en local.
    expect(scripts.build).toMatch(/(?:^|\s)NODE_ENV=production(?:\s|$)/)
  })

  it('sigue ejecutando next build después de fijar el entorno', () => {
    expect(scripts.build).toMatch(/(?:^|\s)next build(?:\s|$)/)
  })

  it('no fija NODE_ENV en dev, que sí depende del entorno', () => {
    expect(scripts.dev).toBe('next dev')
  })
})
