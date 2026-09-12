/**
 * Siembra del catálogo sintético en la base efímera antes de los specs (ADR-0027 §5).
 *
 * Solo se registra en la suite **hermética** (`playwright.config.ts`): cuando `E2E_BASE_URL` apunta a
 * un entorno ya desplegado, su catálogo no es nuestro y no se toca (ADR-0025 §2-§3).
 *
 * Playwright arranca los `webServer` antes que este paso, así que la siembra ocurre con los dos
 * servidores ya en pie pero **antes de cualquier spec**; los repositorios Prisma leen en cada
 * petición, así que no hace falta sembrar antes de compilar: el flujo del panel escribe y el
 * configurador lee la misma base en cada petición.
 */

import { createPrismaClient } from '@/infrastructure/persistence/prisma/client'

import { seedCatalogoE2e } from './catalogo-e2e'
import { e2eDatabaseUrl } from './database'

/** Traduce los fallos de conexión o de esquema en una instrucción accionable, sin filtrar la URL. */
function seedFailure(error: unknown): Error {
  const code = (error as { code?: string }).code
  const hint =
    code === 'P2021'
      ? ' Falta aplicar las migraciones: `pnpm db:deploy` (con DATABASE_URL apuntando a la base efímera).'
      : code === 'P1001'
        ? ' La base efímera no responde: levántala antes de ejecutar la suite (docs/e2e-playbook.md).'
        : ''

  return new Error(`No se pudo sembrar el catálogo sintético del E2E.${hint}`, { cause: error })
}

export default async function globalSetup(): Promise<void> {
  const prisma = createPrismaClient(e2eDatabaseUrl())

  try {
    const summary = await seedCatalogoE2e(prisma)

    console.log(
      `[e2e] catálogo sintético sembrado: ${summary.series} series, ${summary.finishes} acabados, ` +
        `${summary.colors} colores, ${summary.accessories} accesorios, ` +
        `${summary.tariffVersions} versiones de tarifa`,
    )
  } catch (error) {
    throw seedFailure(error)
  } finally {
    await prisma.$disconnect()
  }
}
