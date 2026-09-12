import { describe, expect, it } from 'vitest'

import { LocalizedText } from '@/domain/catalog/catalog-text'
import { makeAccessory, makeFinish } from '@/domain/catalog/testing/factories'
import { ItemInUseError, ResourceNotFoundError } from '@/domain/shared/errors'
import { makeTestWorld } from '@/infrastructure/testing/fixtures'

import { upsertColor } from './upsert-color'
import { deactivateCatalogItem } from './deactivate-catalog-item'

function setup() {
  const world = makeTestWorld()

  return {
    world,
    deps: {
      finishRepository: world.finishRepository,
      colorRepository: world.colorRepository,
      accessoryRepository: world.accessoryRepository,
      finishWriteRepository: world.finishWriteRepository,
      colorWriteRepository: world.colorWriteRepository,
      accessoryWriteRepository: world.accessoryWriteRepository,
      catalogUsageReader: world.catalogUsageReader,
      clock: world.clock,
    },
  }
}

describe('deactivateCatalogItem', () => {
  it('archiva un acabado que ninguna serie viva permite', async () => {
    const { world, deps } = setup()
    world.catalog.upsertFinish(
      makeFinish({ id: 'finish-suelto', code: 'SUELTO', name: LocalizedText.single('Suelto') }),
    )

    const result = await deactivateCatalogItem(deps, { entity: 'finish', id: 'finish-suelto' })

    expect(result.entity).toBe('finish')
    expect(result.item.status).toBe('archived')
    expect(world.catalog.finishes.find((item) => item.id === 'finish-suelto')?.status).toBe(
      'archived',
    )
  })

  it('lanza ItemInUseError y no escribe si una serie viva sigue permitiendo el acabado', async () => {
    const { world, deps } = setup()

    await expect(
      deactivateCatalogItem(deps, { entity: 'finish', id: 'finish-lacado' }),
    ).rejects.toThrow(ItemInUseError)

    expect(world.catalog.finishes.find((item) => item.id === 'finish-lacado')?.status).toBe(
      'published',
    )
  })

  it('lanza ItemInUseError si el acabado todavía tiene colores vivos', async () => {
    const { world, deps } = setup()
    world.catalog.upsertFinish(
      makeFinish({
        id: 'finish-con-color',
        code: 'CONCOLOR',
        name: LocalizedText.single('Con color'),
      }),
    )
    await upsertColor(
      {
        finishRepository: world.finishRepository,
        colorWriteRepository: world.colorWriteRepository,
        idGenerator: world.idGenerator,
        clock: world.clock,
      },
      { finishId: 'finish-con-color', code: 'RAL-1', name: { es: 'Uno' } },
    )

    await expect(
      deactivateCatalogItem(deps, { entity: 'finish', id: 'finish-con-color' }),
    ).rejects.toThrow(ItemInUseError)
  })

  it('archiva un color sin guarda de uso', async () => {
    const { world, deps } = setup()

    const result = await deactivateCatalogItem(deps, { entity: 'color', id: 'color-ral-9010' })

    expect(result.item.status).toBe('archived')
    expect(world.catalog.colors.find((item) => item.id === 'color-ral-9010')?.status).toBe(
      'archived',
    )
  })

  it('archiva un complemento que ninguna serie viva permite', async () => {
    const { world, deps } = setup()
    world.catalog.upsertAccessory(makeAccessory({ id: 'accessory-suelto', code: 'SUELTO-A' }))

    const result = await deactivateCatalogItem(deps, {
      entity: 'accessory',
      id: 'accessory-suelto',
    })

    expect(result.item.status).toBe('archived')
  })

  it('lanza ItemInUseError si una serie viva permite el complemento', async () => {
    const { world, deps } = setup()

    await expect(
      deactivateCatalogItem(deps, { entity: 'accessory', id: 'accessory-manilla' }),
    ).rejects.toThrow(ItemInUseError)

    expect(world.catalog.accessories.find((item) => item.id === 'accessory-manilla')?.status).toBe(
      'published',
    )
  })

  it('es idempotente sobre un elemento ya archivado', async () => {
    const { deps } = setup()

    const result = await deactivateCatalogItem(deps, { entity: 'finish', id: 'finish-retirado' })

    expect(result.item.status).toBe('archived')
    expect(result.item.code).toBe('RETIRADO')
  })

  it('lanza ResourceNotFoundError si el elemento no existe', async () => {
    const { deps } = setup()

    await expect(
      deactivateCatalogItem(deps, { entity: 'color', id: 'color-inexistente' }),
    ).rejects.toThrow(ResourceNotFoundError)
  })

  it('el resultado lleva la entidad a la que pertenece el elemento desactivado', async () => {
    const { world, deps } = setup()
    world.catalog.upsertAccessory(makeAccessory({ id: 'accessory-suelto', code: 'SUELTO-A' }))

    const accessory = await deactivateCatalogItem(deps, {
      entity: 'accessory',
      id: 'accessory-suelto',
    })
    const color = await deactivateCatalogItem(deps, { entity: 'color', id: 'color-ral-9010' })

    expect(accessory.entity).toBe('accessory')
    expect(color.entity).toBe('color')
  })
})
