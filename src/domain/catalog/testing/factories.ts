/**
 * Factorías de datos de prueba del catálogo (ver docs/testing-strategy.md).
 *
 * Viven en `testing/` y quedan fuera de la cobertura: son andamiaje de tests, no código de
 * producción. Cada factoría parte de un caso válido y acepta sobrescribir los campos que el test
 * necesite, para no repetir literales largos.
 */

import { Accessory } from '../accessory'
import { LocalizedText } from '../catalog-text'
import { Color } from '../color'
import { Finish } from '../finish'
import { Dimensions, SizeRange } from '../measurement'
import { DoorSeries } from '../series'
import { TariffVersion } from '../tariff-version'
import { ValidityPeriod } from '../validity-period'

export const TEST_NOW = new Date('2026-09-11T10:00:00.000Z')

export function makeDimensions(widthMm = 900, heightMm = 2100): Dimensions {
  return Dimensions.of(widthMm, heightMm)
}

export function makeSizeRange(
  minWidthMm = 600,
  maxWidthMm = 1000,
  minHeightMm = 1800,
  maxHeightMm = 2200,
): SizeRange {
  return SizeRange.of({ minWidthMm, maxWidthMm, minHeightMm, maxHeightMm })
}

export function makeSeries(
  overrides: Partial<Parameters<typeof DoorSeries.create>[0]> = {},
): DoorSeries {
  return DoorSeries.create({
    id: overrides.id ?? 'series-ci-100',
    code: overrides.code ?? 'CI-100',
    slug: overrides.slug ?? 'ci-100',
    name: overrides.name ?? LocalizedText.single('Serie CI-100'),
    description: overrides.description ?? null,
    status: overrides.status ?? 'published',
    sizeRange: overrides.sizeRange ?? makeSizeRange(),
    allowedFinishIds: overrides.allowedFinishIds ?? ['finish-lacado'],
    allowedAccessoryIds: overrides.allowedAccessoryIds ?? ['accessory-manilla'],
    sortOrder: overrides.sortOrder ?? 1,
    createdAt: overrides.createdAt ?? TEST_NOW,
    updatedAt: overrides.updatedAt ?? TEST_NOW,
  })
}

export function makeFinish(overrides: Partial<Parameters<typeof Finish.create>[0]> = {}): Finish {
  return Finish.create({
    id: overrides.id ?? 'finish-lacado',
    code: overrides.code ?? 'LACADO',
    name: overrides.name ?? LocalizedText.single('Lacado'),
    description: overrides.description ?? null,
    status: overrides.status ?? 'published',
    sortOrder: overrides.sortOrder ?? 1,
    createdAt: overrides.createdAt ?? TEST_NOW,
    updatedAt: overrides.updatedAt ?? TEST_NOW,
  })
}

export function makeColor(overrides: Partial<Parameters<typeof Color.create>[0]> = {}): Color {
  return Color.create({
    id: overrides.id ?? 'color-ral-9010',
    finishId: overrides.finishId ?? 'finish-lacado',
    code: overrides.code ?? 'RAL-9010',
    name: overrides.name ?? LocalizedText.single('Blanco puro'),
    hex: overrides.hex === undefined ? '#F1EDE1' : overrides.hex,
    status: overrides.status ?? 'published',
    sortOrder: overrides.sortOrder ?? 1,
    createdAt: overrides.createdAt ?? TEST_NOW,
    updatedAt: overrides.updatedAt ?? TEST_NOW,
  })
}

export function makeAccessory(
  overrides: Partial<Parameters<typeof Accessory.create>[0]> = {},
): Accessory {
  return Accessory.create({
    id: overrides.id ?? 'accessory-manilla',
    code: overrides.code ?? 'MANILLA-A',
    name: overrides.name ?? LocalizedText.single('Manilla'),
    description: overrides.description ?? null,
    category: overrides.category ?? 'hardware',
    status: overrides.status ?? 'published',
    sortOrder: overrides.sortOrder ?? 1,
    createdAt: overrides.createdAt ?? TEST_NOW,
    updatedAt: overrides.updatedAt ?? TEST_NOW,
  })
}

export function makeTariffVersion(
  overrides: Partial<Parameters<typeof TariffVersion.create>[0]> = {},
): TariffVersion {
  return TariffVersion.create({
    id: overrides.id ?? 'tariff-ci-100-v1',
    seriesId: overrides.seriesId ?? 'series-ci-100',
    versionNumber: overrides.versionNumber ?? 1,
    status: overrides.status ?? 'published',
    strategy: overrides.strategy ?? 'per_square_metre',
    validity: overrides.validity ?? ValidityPeriod.of(new Date('2026-01-01T00:00:00.000Z')),
    taxRatePercent: overrides.taxRatePercent ?? '21',
    currency: overrides.currency ?? 'EUR',
    notes: overrides.notes ?? null,
    publishedAt: overrides.publishedAt === undefined ? TEST_NOW : overrides.publishedAt,
    createdAt: overrides.createdAt ?? TEST_NOW,
    updatedAt: overrides.updatedAt ?? TEST_NOW,
  })
}
