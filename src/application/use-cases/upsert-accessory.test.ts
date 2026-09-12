import { describe, expect, it } from 'vitest'

import { InvalidValueError } from '@/domain/shared/errors'
import { makeTestWorld } from '@/infrastructure/testing/fixtures'

import { upsertAccessory, type UpsertAccessoryInput } from './upsert-accessory'

function setup() {
  const world = makeTestWorld()

  return {
    world,
    deps: {
      accessoryWriteRepository: world.accessoryWriteRepository,
      idGenerator: world.idGenerator,
      clock: world.clock,
    },
  }
}

function input(overrides: Partial<UpsertAccessoryInput> = {}): UpsertAccessoryInput {
  return { code: 'CIERRAPUERTAS', name: { es: 'Cierrapuertas', en: 'Door closer' }, ...overrides }
}

describe('upsertAccessory', () => {
  it('da de alta un complemento nuevo con su categoría', async () => {
    const { world, deps } = setup()

    const accessory = await upsertAccessory(deps, input({ category: 'closing' }))

    expect(accessory.status).toBe('draft')
    expect(accessory.category).toBe('closing')
    expect(world.catalog.accessories.find((item) => item.code === 'CIERRAPUERTAS')?.id).toBe(
      accessory.id,
    )
  })

  it('es idempotente por code', async () => {
    const { world, deps } = setup()

    const first = await upsertAccessory(deps, input())
    const second = await upsertAccessory(deps, input({ name: { es: 'Cierrapuertas hidráulico' } }))

    expect(second.id).toBe(first.id)
    expect(world.catalog.accessories.filter((item) => item.code === 'CIERRAPUERTAS')).toHaveLength(
      1,
    )
  })

  it('mantiene la categoría anterior si el upsert no la envía', async () => {
    const { deps } = setup()
    await upsertAccessory(deps, input({ category: 'closing' }))

    const accessory = await upsertAccessory(deps, input())

    expect(accessory.category).toBe('closing')
  })

  it('rechaza una categoría que no existe', async () => {
    const { deps } = setup()

    await expect(upsertAccessory(deps, input({ category: 'inventada' as never }))).rejects.toThrow(
      InvalidValueError,
    )
  })

  it('publica en el mismo upsert si se pide y el dominio lo permite', async () => {
    const { deps } = setup()

    const accessory = await upsertAccessory(deps, input({ status: 'published' }))

    expect(accessory.status).toBe('published')
  })

  it('actualiza un complemento existente del mundo de pruebas', async () => {
    const { deps } = setup()

    const accessory = await upsertAccessory(
      deps,
      input({ code: 'MANILLA-A', name: { es: 'Manilla recta' } }),
    )

    expect(accessory.id).toBe('accessory-manilla')
    expect(accessory.name).toEqual({ es: 'Manilla recta' })
  })
})
