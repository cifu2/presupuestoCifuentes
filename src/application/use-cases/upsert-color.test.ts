import { describe, expect, it } from 'vitest'

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { makeFinish } from '@/domain/catalog/testing/factories'
import { InvalidCatalogValueError, ResourceNotFoundError } from '@/domain/shared/errors'
import { makeTestWorld } from '@/infrastructure/testing/fixtures'

import { upsertColor, type UpsertColorInput } from './upsert-color'

function setup() {
  const world = makeTestWorld()

  return {
    world,
    deps: {
      finishRepository: world.finishRepository,
      colorWriteRepository: world.colorWriteRepository,
      idGenerator: world.idGenerator,
      clock: world.clock,
    },
  }
}

function input(overrides: Partial<UpsertColorInput> = {}): UpsertColorInput {
  return {
    finishId: 'finish-lacado',
    code: 'RAL-7016',
    name: { es: 'Gris antracita' },
    ...overrides,
  }
}

describe('upsertColor', () => {
  it('da de alta un color nuevo del acabado en borrador', async () => {
    const { world, deps } = setup()

    const color = await upsertColor(deps, input({ hex: '#383e42' }))

    expect(color.status).toBe('draft')
    expect(color.finishId).toBe('finish-lacado')
    expect(color.hex).toBe('#383E42')
    expect(world.catalog.colors.find((item) => item.code === 'RAL-7016')?.id).toBe(color.id)
  })

  it('es idempotente por (finishId, code)', async () => {
    const { world, deps } = setup()

    const first = await upsertColor(deps, input())
    const second = await upsertColor(deps, input({ name: { es: 'Antracita' } }))

    expect(second.id).toBe(first.id)
    expect(second.name).toEqual({ es: 'Antracita' })
    expect(world.catalog.colors.filter((item) => item.code === 'RAL-7016')).toHaveLength(1)
  })

  it('el mismo código en otro acabado es otro color', async () => {
    const { world, deps } = setup()
    world.catalog.upsertFinish(
      makeFinish({
        id: 'finish-chapa',
        code: 'CHAPA',
        name: LocalizedText.single('Chapa natural'),
      }),
    )

    const first = await upsertColor(deps, input())
    const second = await upsertColor(deps, input({ finishId: 'finish-chapa' }))

    expect(second.id).not.toBe(first.id)
  })

  it('lanza ResourceNotFoundError si el acabado no existe', async () => {
    const { deps } = setup()

    await expect(upsertColor(deps, input({ finishId: 'finish-inexistente' }))).rejects.toThrow(
      ResourceNotFoundError,
    )
  })

  it('rechaza un hexadecimal con formato inválido', async () => {
    const { deps } = setup()

    await expect(upsertColor(deps, input({ hex: 'gris' }))).rejects.toThrow(
      InvalidCatalogValueError,
    )
  })

  it('conserva el hex si el upsert no lo envía', async () => {
    const { deps } = setup()
    await upsertColor(deps, input({ hex: '#383E42' }))

    const color = await upsertColor(deps, input())

    expect(color.hex).toBe('#383E42')
  })

  it('permite archivar en el mismo upsert validando la transición', async () => {
    const { deps } = setup()

    const color = await upsertColor(deps, input({ status: 'published' }))
    const archived = await upsertColor(deps, input({ status: 'archived' }))

    expect(color.status).toBe('published')
    expect(archived.status).toBe('archived')
  })
})
