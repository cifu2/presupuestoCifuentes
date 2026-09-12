/**
 * Guarda de destino del E2E (CIF-525): unitarios del helper y del propio `playwright.config.ts`.
 *
 * El caso que importa es el que falla cerrado: con `E2E_BASE_URL` (o `E2E_ADMIN_BASE_URL`) apuntando
 * a un host declarado como producción, la configuración **no se puede cargar**. Los casos verdes son
 * los entornos que la suite sí admite: hermético sin `E2E_BASE_URL`, local y preview sembrado.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  E2E_TARGET_VARIABLES,
  PRODUCTION_HOSTS,
  assertE2eTargetsAreNotProduction,
  findProductionTargets,
  hostOf,
  isProductionHost,
  productionTargetMessage,
} from './production-guard'

/** Entorno sin ninguna variable de destino, como el E2E hermético de CI. */
const hermetic: Record<string, string | undefined> = {}

function targetsWith(env: Record<string, string | undefined>) {
  return findProductionTargets(env).map((target) => `${target.variable}=${target.host}`)
}

describe('hosts de producción declarados', () => {
  it('reconoce cada host declarado en el repositorio', () => {
    for (const host of PRODUCTION_HOSTS) {
      expect(isProductionHost(host)).toBe(true)
    }
  })

  it('reconoce el alias de la rama main de Vercel, que sirve el despliegue de Production', () => {
    expect(isProductionHost('presupuesto-cifuentes-git-main-equipo.vercel.app')).toBe(true)
    expect(isProductionHost('presupuesto-cifuentes-git-main.vercel.app')).toBe(true)
  })

  it('no confunde un preview del proyecto con producción', () => {
    expect(isProductionHost('presupuesto-cifuentes-4f2a1c9b7-equipo.vercel.app')).toBe(false)
    expect(isProductionHost('presupuesto-cifuentes-git-cif525-guarda-equipo.vercel.app')).toBe(
      false,
    )
  })

  it('normaliza esquema, puerto, `www.` y mayúsculas antes de comparar', () => {
    expect(hostOf('https://WWW.Presupuesto-Cifuentes.vercel.app:443/')).toBe(
      'presupuesto-cifuentes.vercel.app',
    )
    expect(hostOf('127.0.0.1:3000')).toBe('127.0.0.1')
    expect(isProductionHost('www.puertascifuentes.com.')).toBe(true)
  })

  it('no inventa hosts cuando la URL no se puede leer', () => {
    expect(hostOf('')).toBeUndefined()
    expect(hostOf('http://')).toBeUndefined()
    expect(isProductionHost('')).toBe(false)
  })
})

describe('detección de destinos prohibidos', () => {
  it('deja pasar el E2E hermético, sin variables de destino', () => {
    expect(findProductionTargets(hermetic)).toEqual([])
    expect(() => assertE2eTargetsAreNotProduction(hermetic)).not.toThrow()
  })

  it('deja pasar local y el preview sembrado', () => {
    const env = {
      E2E_BASE_URL: 'http://127.0.0.1:3000',
      E2E_ADMIN_BASE_URL: 'http://localhost:3001',
    }

    expect(findProductionTargets(env)).toEqual([])

    expect(
      targetsWith({
        E2E_BASE_URL: 'https://presupuesto-cifuentes-git-cif525-guarda-equipo.vercel.app',
        E2E_ADMIN_BASE_URL: 'http://127.0.0.1:3001',
      }),
    ).toEqual([])
  })

  it('aborta nombrando ADR-0025 §5 / ADR-0026 §7 y el entorno válido', () => {
    const env = { E2E_BASE_URL: 'https://presupuesto-cifuentes.vercel.app' }

    expect(targetsWith(env)).toEqual(['E2E_BASE_URL=presupuesto-cifuentes.vercel.app'])
    expect(() => assertE2eTargetsAreNotProduction(env)).toThrow(/ADR-0025 §5/)
    expect(() => assertE2eTargetsAreNotProduction(env)).toThrow(/ADR-0026 §7/)
    expect(() => assertE2eTargetsAreNotProduction(env)).toThrow(/seed-preview-catalogo\.sh/)
  })

  it('no imprime la URL declarada: solo el host, por si lleva credenciales', () => {
    const message = productionTargetMessage(
      findProductionTargets({ E2E_BASE_URL: 'https://usuario:secreto@puertascifuentes.com' }),
    )

    expect(message).toContain('puertascifuentes.com')
    expect(message).not.toContain('secreto')
    expect(message).not.toContain('usuario')
  })

  it('vigila también el destino de la suite de administración, que también escribe', () => {
    const env = { E2E_ADMIN_BASE_URL: 'https://presupuesto-cifuentes-git-main-equipo.vercel.app' }

    expect(E2E_TARGET_VARIABLES).toContain('E2E_ADMIN_BASE_URL')
    expect(targetsWith(env)).toEqual([
      'E2E_ADMIN_BASE_URL=presupuesto-cifuentes-git-main-equipo.vercel.app',
    ])
    expect(() => assertE2eTargetsAreNotProduction(env)).toThrow(/guarda de destino/)
  })

  it('nombra todos los destinos prohibidos a la vez, no solo el primero', () => {
    const targets = findProductionTargets({
      E2E_BASE_URL: 'https://presupuesto-cifuentes.vercel.app',
      E2E_ADMIN_BASE_URL: 'https://puertascifuentes.com',
    })

    expect(targets).toHaveLength(2)
  })
})

describe('el propio `playwright.config.ts` cierra en falso', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function loadConfig() {
    vi.resetModules()

    return import('../../playwright.config')
  }

  it('no se puede cargar con `E2E_BASE_URL` en producción, así que no se ejecuta ningún test', async () => {
    vi.stubEnv('E2E_BASE_URL', 'https://presupuesto-cifuentes.vercel.app')

    await expect(loadConfig()).rejects.toThrow(/ADR-0025 §5/)
  })

  it('se carga con el destino hermético de local', async () => {
    const config = await loadConfig()

    expect(config.default.projects?.map((project) => project.name)).toEqual(['chromium', 'movil'])
  })
})
