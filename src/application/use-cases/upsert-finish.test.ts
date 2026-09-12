import { describe, expect, it } from 'vitest'

import { InvalidCatalogTextError } from '@/domain/shared/errors'
import { makeTestWorld } from '@/infrastructure/testing/fixtures'

import { upsertFinish, type UpsertFinishInput } from './upsert-finish'

function setup() {
  const world = makeTestWorld()

  return {
    world,
    deps: {
      finishWriteRepository: world.finishWriteRepository,
      idGenerator: world.idGenerator,
      clock: world.clock,
    },
  }
}

function input(overrides: Partial<UpsertFinishInput> = {}): UpsertFinishInput {
  return { code: 'MADERA', name: { es: 'Madera natural', en: 'Natural wood' }, ...overrides }
}

describe('upsertFinish', () => {
  it('da de alta un acabado nuevo en borrador con sus textos', async () => {
    const { world, deps } = setup()

    const finish = await upsertFinish(deps, input({ description: { es: 'Roble' } }))

    expect(finish.status).toBe('draft')
    expect(finish.name).toEqual({ es: 'Madera natural', en: 'Natural wood' })
    expect(finish.description).toEqual({ es: 'Roble' })
    expect(world.catalog.finishes.find((item) => item.code === 'MADERA')?.id).toBe(finish.id)
  })

  it('es idempotente por code y actualiza el existente', async () => {
    const { world, deps } = setup()

    const first = await upsertFinish(deps, input())
    const second = await upsertFinish(deps, input({ name: { es: 'Madera' }, sortOrder: 7 }))

    expect(second.id).toBe(first.id)
    expect(second.sortOrder).toBe(7)
    expect(world.catalog.finishes.filter((item) => item.code === 'MADERA')).toHaveLength(1)
  })

  it('permite publicar en el mismo upsert validando la transición', async () => {
    const { deps } = setup()

    const finish = await upsertFinish(deps, input({ status: 'published' }))

    expect(finish.status).toBe('published')
  })

  it('conserva el estado de un acabado existente si el upsert no lo pide', async () => {
    const { deps } = setup()
    await upsertFinish(deps, input({ status: 'published' }))

    const finish = await upsertFinish(deps, input())

    expect(finish.status).toBe('published')
  })

  it('exige el idioma por defecto en el nombre', async () => {
    const { deps } = setup()

    await expect(upsertFinish(deps, input({ name: { en: 'Wood' } as never }))).rejects.toThrow(
      InvalidCatalogTextError,
    )
  })

  it('rechaza un código con formato inválido', async () => {
    const { deps } = setup()

    await expect(upsertFinish(deps, input({ code: 'madera' }))).rejects.toThrow(
      /code debe ser un código estable/,
    )
  })

  it('actualiza un acabado existente del mundo de pruebas por su código', async () => {
    const { deps } = setup()

    const finish = await upsertFinish(deps, input({ code: 'LACADO', name: { es: 'Lacado mate' } }))

    expect(finish.id).toBe('finish-lacado')
    expect(finish.status).toBe('published')
    expect(finish.name).toEqual({ es: 'Lacado mate' })
  })
})
