import { describe, expect, it } from 'vitest'

import { TEST_NOW, makeSeries } from '@/domain/catalog/testing/factories'
import {
  ConflictError,
  InvalidCatalogTextError,
  InvalidSizeRangeError,
} from '@/domain/shared/errors'
import { makeTestWorld } from '@/infrastructure/testing/fixtures'

import { upsertSeries, type UpsertSeriesInput } from './upsert-series'

const LIMITS = { minWidthMm: 700, maxWidthMm: 1100, minHeightMm: 1900, maxHeightMm: 2400 }

function setup() {
  const world = makeTestWorld()

  return {
    world,
    deps: {
      seriesWriteRepository: world.seriesWriteRepository,
      idGenerator: world.idGenerator,
      clock: world.clock,
    },
  }
}

function input(overrides: Partial<UpsertSeriesInput> = {}): UpsertSeriesInput {
  return {
    code: 'CI-700',
    slug: 'ci-700',
    name: { es: 'Serie CI-700', en: 'CI-700 series' },
    limits: LIMITS,
    ...overrides,
  }
}

describe('upsertSeries', () => {
  it('da de alta una serie nueva en borrador con sus límites y textos por idioma', async () => {
    const { world, deps } = setup()

    const series = await upsertSeries(deps, input({ description: { es: 'Una serie nueva' } }))

    expect(series.status).toBe('draft')
    expect(series.name).toEqual({ es: 'Serie CI-700', en: 'CI-700 series' })
    expect(series.description).toEqual({ es: 'Una serie nueva' })
    expect(series.limits).toEqual(LIMITS)
    expect(series.createdAt).toBe(TEST_NOW.toISOString())
    await expect(world.seriesRepository.findById(series.id)).resolves.toMatchObject({
      code: 'CI-700',
      slug: 'ci-700',
    })
  })

  it('es idempotente por code: repetir el alta actualiza la misma fila', async () => {
    const { world, deps } = setup()

    const first = await upsertSeries(deps, input())
    const second = await upsertSeries(deps, input({ name: { es: 'Serie CI-700 revisada' } }))

    expect(second.id).toBe(first.id)
    expect(world.catalog.series.filter((item) => item.code === 'CI-700')).toHaveLength(1)
    expect(second.name).toEqual({ es: 'Serie CI-700 revisada' })
  })

  it('conserva la descripción guardada si no se envía en el upsert', async () => {
    const { deps } = setup()

    const created = await upsertSeries(deps, input({ description: { es: 'Original' } }))
    const updated = await upsertSeries(deps, input())

    expect(updated.id).toBe(created.id)
    expect(updated.description).toEqual({ es: 'Original' })
  })

  it('lanza ConflictError si el slug ya lo usa otra serie', async () => {
    const { deps } = setup()

    await expect(upsertSeries(deps, input({ slug: 'ci-100' }))).rejects.toThrow(ConflictError)
  })

  it('valida el rango de medidas con el dominio', async () => {
    const { deps } = setup()

    await expect(
      upsertSeries(deps, input({ limits: { ...LIMITS, minWidthMm: 2000, maxWidthMm: 1000 } })),
    ).rejects.toThrow(InvalidSizeRangeError)
  })

  it('exige el idioma por defecto en el nombre', async () => {
    const { deps } = setup()

    await expect(
      upsertSeries(deps, input({ name: { en: 'Only english' } as never })),
    ).rejects.toThrow(InvalidCatalogTextError)
  })

  it('aplica el estado pedido validando la transición del dominio', async () => {
    const { deps } = setup()

    const published = await upsertSeries(deps, input({ status: 'published' }))

    expect(published.status).toBe('published')
  })

  it('no cambia el estado de una serie existente si el upsert no lo pide', async () => {
    const { world, deps } = setup()
    const published = await upsertSeries(deps, input({ status: 'published' }))

    const updated = await upsertSeries(deps, input({ slug: 'ci-700-bis' }))

    expect(updated.id).toBe(published.id)
    expect(updated.status).toBe('published')
    expect(world.catalog.series.filter((item) => item.code === 'CI-700')).toHaveLength(1)
  })

  it('guarda los vínculos de compatibilidad que llegan', async () => {
    const { world, deps } = setup()

    const series = await upsertSeries(
      deps,
      input({ allowedFinishIds: ['finish-lacado'], allowedAccessoryIds: ['accessory-manilla'] }),
    )

    expect(series.allowedFinishIds).toEqual(['finish-lacado'])
    expect(
      world.catalog.series
        .find((item) => item.id === series.id)
        ?.allowsAccessory('accessory-manilla'),
    ).toBe(true)
  })

  it('acepta una descripción explícitamente nula al crear', async () => {
    const { deps } = setup()

    const series = await upsertSeries(deps, input({ description: null }))

    expect(series.description).toBeNull()
  })

  it('actualiza los textos que llegan y mantiene los vínculos de una serie existente', async () => {
    const { world, deps } = setup()
    world.catalog.upsertSeries(
      makeSeries({ id: 'series-existente', code: 'CI-EXISTE', slug: 'ci-existe' }),
    )

    const updated = await upsertSeries(
      deps,
      input({ code: 'CI-EXISTE', slug: 'ci-existe', name: { es: 'Renombrada' } }),
    )

    expect(updated.id).toBe('series-existente')
    expect(updated.name).toEqual({ es: 'Renombrada' })
    expect(updated.allowedFinishIds).toEqual(['finish-lacado'])
  })

  it('rechaza un slug con formato inválido', async () => {
    const { deps } = setup()

    await expect(upsertSeries(deps, input({ slug: 'CI 700' }))).rejects.toThrow(/slug debe ser/)
  })
  it('serializa el nombre sin fallback: solo los idiomas escritos', async () => {
    const { deps } = setup()

    const series = await upsertSeries(deps, input({ name: { es: 'Solo castellano' } }))

    expect(series.name).toEqual({ es: 'Solo castellano' })
  })
})
