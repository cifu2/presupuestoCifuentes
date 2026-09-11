import { describe, expect, it } from 'vitest'

import { ResourceNotFoundError } from '@/domain/shared/errors'

import { makeTestWorld } from '@/infrastructure/testing/fixtures'
import { getSeriesDetail } from './get-series-detail'

function deps(world: ReturnType<typeof makeTestWorld>) {
  return {
    seriesRepository: world.seriesRepository,
    finishRepository: world.finishRepository,
    colorRepository: world.colorRepository,
    accessoryRepository: world.accessoryRepository,
  }
}

describe('getSeriesDetail', () => {
  it('devuelve acabados con sus colores y accesorios compatibles', async () => {
    const world = makeTestWorld()

    const detail = await getSeriesDetail(deps(world), { slug: 'ci-100', locale: 'en' })

    expect(detail.series.name).toBe('CI-100 series')
    expect(detail.finishes.map((finish) => finish.id)).toEqual(['finish-lacado'])
    expect(detail.finishes[0]?.name).toBe('Lacquered')
    expect(detail.finishes[0]?.colors.map((color) => color.id)).toEqual(['color-ral-9010'])
    expect(detail.accessories.map((accessory) => accessory.id)).toEqual(['accessory-manilla'])
  })

  it('no incluye acabados retirados del catálogo', async () => {
    const world = makeTestWorld()

    const detail = await getSeriesDetail(deps(world), { slug: 'ci-100', locale: 'es' })

    expect(detail.finishes.map((finish) => finish.id)).not.toContain('finish-retirado')
  })

  it('lanza NOT_FOUND si la serie no existe o no está publicada', async () => {
    const world = makeTestWorld()

    await expect(getSeriesDetail(deps(world), { slug: 'no-existe', locale: 'es' })).rejects.toThrow(
      ResourceNotFoundError,
    )
  })
})
