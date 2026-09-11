import { describe, expect, it } from 'vitest'

import {
  InvalidCatalogValueError,
  InvalidSeriesTransitionError,
  InvalidValueError,
} from '@/domain/shared/errors'

import { SizeRange } from './measurement'
import { makeDimensions, makeSeries, makeSizeRange, TEST_NOW } from './testing/factories'

describe('DoorSeries', () => {
  it('crea una serie publicada con su tamaño máximo', () => {
    const series = makeSeries()

    expect(series.isPublished()).toBe(true)
    expect(series.maxWidthMm).toBe(1000)
    expect(series.maxHeightMm).toBe(2200)
  })

  it('valida código, slug, orden y fechas', () => {
    expect(() => makeSeries({ code: 'ci-100' })).toThrow(InvalidCatalogValueError)
    expect(() => makeSeries({ slug: 'CI 100' })).toThrow(InvalidCatalogValueError)
    expect(() => makeSeries({ id: '   ' })).toThrow(InvalidValueError)
    expect(() => makeSeries({ sortOrder: -1 })).toThrow(InvalidValueError)
    expect(() => makeSeries({ allowedFinishIds: [''] })).toThrow(InvalidValueError)
    expect(() => makeSeries({ allowedAccessoryIds: [''] })).toThrow(InvalidValueError)
    expect(() => makeSeries({ createdAt: new Date('no-es-fecha') })).toThrow(InvalidValueError)
    expect(() => makeSeries({ updatedAt: new Date('no-es-fecha') })).toThrow(InvalidValueError)
  })

  it('aplica el tamaño máximo de la serie y señala el paso a presupuesto manual', () => {
    const series = makeSeries({ sizeRange: makeSizeRange(600, 1000, 1800, 2200) })

    expect(series.assessSize(makeDimensions(900, 2100))).toEqual({ status: 'within_range' })
    expect(series.requiresManualQuoteFor(makeDimensions(900, 2100))).toBe(false)

    expect(series.requiresManualQuoteFor(makeDimensions(1001, 2100))).toBe(true)
    expect(series.requiresManualQuoteFor(makeDimensions(900, 2300))).toBe(true)
    expect(series.requiresManualQuoteFor(makeDimensions(1300, 2500))).toBe(true)
  })

  it('no pide presupuesto manual por quedarse por debajo del mínimo', () => {
    const series = makeSeries({ sizeRange: makeSizeRange(600, 1000, 1800, 2200) })

    expect(series.assessSize(makeDimensions(500, 1700)).status).toBe('out_of_range')
    expect(series.requiresManualQuoteFor(makeDimensions(500, 1700))).toBe(false)
  })

  it('comprueba las compatibilidades de acabados y accesorios', () => {
    const series = makeSeries({
      allowedFinishIds: ['finish-lacado'],
      allowedAccessoryIds: ['accessory-manilla'],
    })

    expect(series.allowsFinish('finish-lacado')).toBe(true)
    expect(series.allowsFinish('finish-chapa')).toBe(false)
    expect(series.allowsAccessory('accessory-manilla')).toBe(true)
    expect(series.allowsAccessory('accessory-vidrio')).toBe(false)
  })

  it('permite publicar, archivar y volver a borrador', () => {
    const draft = makeSeries({ status: 'draft' })
    const published = draft.publish(TEST_NOW)
    const archived = published.archive(TEST_NOW)
    const restored = archived.restore(TEST_NOW)

    expect(draft.isPublished()).toBe(false)
    expect(published.isPublished()).toBe(true)
    expect(archived.status).toBe('archived')
    expect(restored.status).toBe('draft')
  })

  it('rechaza republicar una serie archivada sin pasar por borrador', () => {
    const archived = makeSeries({ status: 'archived' })

    expect(() => archived.publish(TEST_NOW)).toThrow(InvalidSeriesTransitionError)
    expect(() => archived.withStatus('draft', new Date('no-es-fecha'))).toThrow(InvalidValueError)
  })

  it('mantiene el rango de medidas intacto al cambiar de estado', () => {
    const series = makeSeries({ sizeRange: SizeRange.withMaximum(1200, 2400) })
    const archived = series.archive(TEST_NOW)

    expect(archived.sizeRange.maxWidthMm).toBe(1200)
    expect(archived.maxHeightMm).toBe(2400)
    expect(archived.updatedAt).toEqual(TEST_NOW)
  })
})
