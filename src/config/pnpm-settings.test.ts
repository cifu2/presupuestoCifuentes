import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = new URL('../../', import.meta.url)

function readRepositoryFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(name, repositoryRoot)), 'utf8')
}

const pnpmWorkspace = readRepositoryFile('pnpm-workspace.yaml')
const packageJson = JSON.parse(readRepositoryFile('package.json')) as Record<string, unknown>

function topLevelSetting(name: string): string | undefined {
  const match = pnpmWorkspace.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'm'))

  return match?.[1]?.trim() || undefined
}

function topLevelList(name: string): string[] {
  const lines = pnpmWorkspace.split('\n')
  const start = lines.findIndex((line) => line.trim() === `${name}:`)

  if (start === -1) return []

  const items: string[] = []

  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue

    const match = line.match(/^\s+-\s+(.+?)\s*$/)

    if (!match?.[1]) break

    items.push(match[1].replace(/^['"]|['"]$/g, ''))
  }

  return items
}

describe('ajustes de pnpm versionados con el repositorio', () => {
  it('fija minimumReleaseAge para que no dependa de la versión de pnpm', () => {
    // Sin este valor, pnpm 11 aplica 24 h por defecto y el updater de Dependabot falla (CIF-29).
    expect(topLevelSetting('minimumReleaseAge')).toBe('0')
  })

  it('declara los paquetes autorizados a ejecutar scripts de instalación', () => {
    expect(topLevelList('onlyBuiltDependencies')).toEqual([
      '@parcel/watcher',
      '@prisma/engines',
      '@swc/core',
      'prisma',
      'unrs-resolver',
    ])
  })

  it('no deja los ajustes de pnpm en package.json, que pnpm 11 ya no lee', () => {
    expect(packageJson).not.toHaveProperty('pnpm')
  })

  it('mantiene packageManager fijado a la serie de pnpm con la que se valida el lockfile', () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@10\./)
  })
})
