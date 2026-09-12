import { describe, expect, it } from 'vitest'

import { makeTariffVersion } from '@/domain/catalog/testing/factories'
import {
  InvalidTariffVersionError,
  ResourceNotFoundError,
  TariffVersionNotEditableError,
} from '@/domain/shared/errors'
import { makeTestWorld, TEST_TARIFF_ID } from '@/infrastructure/testing/fixtures'

import { updateTariffPrice, type UpdateTariffPriceInput } from './update-tariff-price'

const DRAFT_ID = 'tariff-ci-100-borrador'

function setup() {
  const world = makeTestWorld()
  world.catalog.upsertTariffVersion(
    makeTariffVersion({
      id: DRAFT_ID,
      versionNumber: 2,
      status: 'draft',
      publishedAt: null,
    }),
  )

  return {
    world,
    deps: {
      tariffVersionRepository: world.tariffVersionRepository,
      idGenerator: world.idGenerator,
    },
  }
}

function input(overrides: Partial<UpdateTariffPriceInput> = {}): UpdateTariffPriceInput {
  return { tariffVersionId: DRAFT_ID, perSquareMetre: '425.50', ...overrides }
}

describe('updateTariffPrice', () => {
  it('escribe la tabla de precios de un borrador y la devuelve serializada', async () => {
    const { world, deps } = setup()

    const table = await updateTariffPrice(deps, input())

    expect(table.tariffVersionId).toBe(DRAFT_ID)
    expect(table.strategy).toBe('per_square_metre')
    expect(table.perSquareMetre).toEqual({ amount: '425.50', currency: 'EUR' })
    await expect(
      world.tariffVersionRepository.findPriceTableByVersionId(DRAFT_ID),
    ).resolves.toMatchObject({ tariffVersionId: DRAFT_ID })
  })

  it('reemplaza la tabla entera, incluidas bandas y modificadores', async () => {
    const { world, deps } = setup()
    world.catalog.upsertTariffVersion(
      makeTariffVersion({
        id: 'tariff-bandas',
        versionNumber: 3,
        status: 'draft',
        publishedAt: null,
        strategy: 'size_bands',
      }),
    )

    const table = await updateTariffPrice(deps, {
      tariffVersionId: 'tariff-bandas',
      bands: [
        {
          id: 'banda-1',
          minWidthMm: 600,
          maxWidthMm: 900,
          minHeightMm: 1800,
          maxHeightMm: 2100,
          price: '500',
        },
        { minWidthMm: 901, maxWidthMm: 1200, minHeightMm: 1800, maxHeightMm: 2100, price: '620' },
      ],
      modifiers: [
        { code: 'INSTALACION', kind: 'fixed', target: 'installation', amount: '180' },
        {
          code: 'PROMO10',
          kind: 'percentage',
          target: 'discount',
          targetId: 'PROMO10',
          percentage: '10',
        },
      ],
    })

    expect(table.bands).toHaveLength(2)
    expect(table.bands[0]?.id).toBe('banda-1')
    expect(table.bands[1]?.id).not.toBe('banda-1')
    expect(table.modifiers.map((modifier) => modifier.kind)).toEqual(['fixed', 'percentage'])
    expect(
      world.catalog.pricing.find((entry) => entry.tariff.id === 'tariff-bandas')?.priceTable.bands,
    ).toHaveLength(2)
  })

  it('es idempotente por contenido: reenviar la misma tabla deja la misma fila', async () => {
    const { world, deps } = setup()

    await updateTariffPrice(deps, input({ perSquareMetre: '400' }))
    const second = await updateTariffPrice(deps, input({ perSquareMetre: '400' }))

    expect(second.perSquareMetre).toEqual({ amount: '400.00', currency: 'EUR' })
    expect(world.catalog.pricing.filter((entry) => entry.tariff.id === DRAFT_ID)).toHaveLength(1)
  })

  it('rechaza editar una tarifa publicada y no escribe', async () => {
    const { world, deps } = setup()

    await expect(
      updateTariffPrice(deps, { tariffVersionId: TEST_TARIFF_ID, perSquareMetre: '1' }),
    ).rejects.toThrow(TariffVersionNotEditableError)

    expect(
      world.catalog.pricing
        .find((entry) => entry.tariff.id === TEST_TARIFF_ID)
        ?.priceTable.perSquareMetre?.toString(),
    ).toBe('400.00')
  })

  it('lanza ResourceNotFoundError si la versión no existe', async () => {
    const { deps } = setup()

    await expect(
      updateTariffPrice(deps, { tariffVersionId: 'tariff-inexistente', perSquareMetre: '1' }),
    ).rejects.toThrow(ResourceNotFoundError)
  })

  it('exige el precio base de la estrategia de la versión', async () => {
    const { deps } = setup()

    await expect(
      updateTariffPrice(deps, { tariffVersionId: DRAFT_ID, modifiers: [] }),
    ).rejects.toThrow(InvalidTariffVersionError)
  })

  it('exige al menos una banda en una tarifa por tramos', async () => {
    const { world, deps } = setup()
    world.catalog.upsertTariffVersion(
      makeTariffVersion({
        id: 'tariff-bandas',
        status: 'draft',
        publishedAt: null,
        strategy: 'size_bands',
      }),
    )

    await expect(
      updateTariffPrice(deps, { tariffVersionId: 'tariff-bandas', bands: [] }),
    ).rejects.toThrow(InvalidTariffVersionError)
  })

  it('rechaza bandas de medida solapadas', async () => {
    const { world, deps } = setup()
    world.catalog.upsertTariffVersion(
      makeTariffVersion({
        id: 'tariff-bandas',
        status: 'draft',
        publishedAt: null,
        strategy: 'size_bands',
      }),
    )

    await expect(
      updateTariffPrice(deps, {
        tariffVersionId: 'tariff-bandas',
        bands: [
          { minWidthMm: 600, maxWidthMm: 1000, minHeightMm: 1800, maxHeightMm: 2100, price: '500' },
          { minWidthMm: 900, maxWidthMm: 1200, minHeightMm: 1800, maxHeightMm: 2100, price: '620' },
        ],
      }),
    ).rejects.toThrow(InvalidTariffVersionError)
  })

  it('etiqueta el modificador con sus traducciones', async () => {
    const { deps } = setup()

    const table = await updateTariffPrice(deps, {
      tariffVersionId: DRAFT_ID,
      perSquareMetre: '400',
      modifiers: [
        {
          code: 'INSTALACION',
          kind: 'fixed',
          target: 'installation',
          amount: '180',
          label: { es: 'Instalación', en: 'Installation' },
        },
      ],
    })

    expect(table.modifiers[0]?.label).toEqual({ es: 'Instalación', en: 'Installation' })
  })
})
