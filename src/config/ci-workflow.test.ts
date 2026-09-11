import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repositoryRoot = new URL('../../', import.meta.url)
const ciWorkflow = readFileSync(
  fileURLToPath(new URL('.github/workflows/ci.yml', repositoryRoot)),
  'utf8',
)

/** Devuelve el bloque YAML del job, desde su clave hasta la siguiente clave de dos espacios. */
function jobSection(jobId: string): string {
  const lines = ciWorkflow.split('\n')
  const start = lines.findIndex((line) => line === `  ${jobId}:`)

  if (start === -1) return ''

  const end = lines.findIndex((line, index) => index > start && /^ {2}\S/.test(line))

  return lines.slice(start, end === -1 ? undefined : end).join('\n')
}

const calidad = jobSection('calidad')
const e2e = jobSection('e2e')

describe('job `calidad` con base de datos de test', () => {
  it('arranca un servicio PostgreSQL 17 para los tests de integración', () => {
    // Sin base de datos, los tests de integración de los adaptadores Prisma se saltan
    // (`describe.runIf(TEST_DATABASE_URL)`) y el CI da por bueno un adaptador que nadie ejecutó.
    expect(calidad).toMatch(/^\s+services:$/m)
    expect(calidad).toMatch(/^\s+image:\s*postgres:17\s*$/m)
  })

  it('publica TEST_DATABASE_URL al job para que los tests no se salten', () => {
    expect(calidad).toMatch(/^\s+TEST_DATABASE_URL:\s*postgresql:\/\//m)
  })

  it('aplica las migraciones sobre la base de datos de test antes de los tests', () => {
    expect(calidad).toMatch(/DATABASE_URL="\$TEST_DATABASE_URL"\s+pnpm db:deploy/)

    const migraciones = calidad.indexOf('pnpm db:deploy')
    const tests = calidad.indexOf('pnpm test:coverage')

    expect(migraciones).toBeGreaterThan(-1)
    expect(tests).toBeGreaterThan(migraciones)
  })

  it('espera a que el servicio esté sano antes de usar la base de datos', () => {
    expect(calidad).toMatch(/--health-cmd\s+"?pg_isready/)
  })
})

describe('checks requeridos en `main`', () => {
  it('no renombra el job `calidad`, del que depende la protección de rama', () => {
    expect(calidad).toMatch(/^\s+name:\s*calidad \(formato · lint · tipos · unitarios\)\s*$/m)
  })

  it('mantiene `e2e (puerta obligatoria)` ejecutando la suite completa', () => {
    expect(e2e).toMatch(/^\s+name:\s*e2e \(puerta obligatoria\)\s*$/m)
    expect(e2e).toMatch(/^\s+- run:\s*pnpm e2e\s*$/m)
  })

  it('adjunta el informe de Playwright cuando la puerta falla', () => {
    expect(e2e).toMatch(/^\s+name:\s*playwright-report\s*$/m)
  })
})
