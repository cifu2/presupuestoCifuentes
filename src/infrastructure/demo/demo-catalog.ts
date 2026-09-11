/**
 * Catálogo de demostración.
 *
 * Datos **inventados** para desarrollo, tests E2E y demostración sin base de datos: no contienen
 * información real de clientes ni tarifas comerciales de Puertas Cifuentes. El catálogo real lo
 * gestiona el propietario desde el panel (CIF-13/CIF-9).
 */

import { Accessory } from '@/domain/catalog/accessory'
import { LocalizedText } from '@/domain/catalog/catalog-text'
import { Color } from '@/domain/catalog/color'
import { Finish } from '@/domain/catalog/finish'
import { SizeRange } from '@/domain/catalog/measurement'
import { DoorSeries } from '@/domain/catalog/series'
import { TariffVersion } from '@/domain/catalog/tariff-version'
import { ValidityPeriod } from '@/domain/catalog/validity-period'
import { PriceModifier, PriceTable, SizeBand } from '@/domain/pricing/price-table'
import { Money } from '@/domain/shared/money'

import type { CatalogStoreSnapshot } from '@/infrastructure/persistence/in-memory/catalog-store'
import { InMemoryCatalogStore } from '@/infrastructure/persistence/in-memory/catalog-store'

const SEED_INSTANT = new Date('2026-01-01T00:00:00.000Z')

/**
 * Ids de tarifa en UUID canónico: el panel publica contra ellos también en modo demo y el borde
 * valida el `:id` con `z.uuid` (hallazgo N2 de CIF-85, regresión R1 de la revisión de CIF-87).
 */
const TARIFF_CI_100_V1 = '0192f1b0-0000-7000-8000-000000000101'
const TARIFF_CI_200_V1 = '0192f1b0-0000-7000-8000-000000000201'
const TARIFF_CI_300_V1 = '0192f1b0-0000-7000-8000-000000000301'

function money(value: string): Money {
  return Money.fromDecimalString(value)
}

function tariff(props: {
  id: string
  seriesId: string
  strategy: TariffVersion['strategy']
  versionNumber?: number
}): TariffVersion {
  return TariffVersion.create({
    id: props.id,
    seriesId: props.seriesId,
    versionNumber: props.versionNumber ?? 1,
    status: 'published',
    strategy: props.strategy,
    validity: ValidityPeriod.of(SEED_INSTANT),
    taxRatePercent: '21',
    currency: 'EUR',
    notes: null,
    publishedAt: SEED_INSTANT,
    createdAt: SEED_INSTANT,
    updatedAt: SEED_INSTANT,
  })
}

export function buildDemoCatalog(): CatalogStoreSnapshot {
  const lacado = Finish.create({
    id: 'finish-lacado',
    code: 'LACADO',
    name: LocalizedText.of({ es: 'Lacado', en: 'Lacquered' }),
    description: LocalizedText.of({ es: 'Acabado lacado liso', en: 'Smooth lacquered finish' }),
    status: 'published',
    sortOrder: 1,
    createdAt: SEED_INSTANT,
    updatedAt: SEED_INSTANT,
  })

  const madera = Finish.create({
    id: 'finish-madera',
    code: 'MADERA',
    name: LocalizedText.of({ es: 'Chapa natural', en: 'Natural wood veneer' }),
    description: null,
    status: 'published',
    sortOrder: 2,
    createdAt: SEED_INSTANT,
    updatedAt: SEED_INSTANT,
  })

  const colors = [
    Color.create({
      id: 'color-ral-9010',
      finishId: lacado.id,
      code: 'RAL-9010',
      name: LocalizedText.of({ es: 'Blanco puro', en: 'Pure white' }),
      hex: '#F1EDE1',
      status: 'published',
      sortOrder: 1,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
    Color.create({
      id: 'color-ral-7016',
      finishId: lacado.id,
      code: 'RAL-7016',
      name: LocalizedText.of({ es: 'Gris antracita', en: 'Anthracite grey' }),
      hex: '#383E42',
      status: 'published',
      sortOrder: 2,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
    Color.create({
      id: 'color-roble',
      finishId: madera.id,
      code: 'ROBLE',
      name: LocalizedText.of({ es: 'Roble', en: 'Oak' }),
      hex: '#B98A54',
      status: 'published',
      sortOrder: 1,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
  ]

  const accessories = [
    Accessory.create({
      id: 'accessory-manilla',
      code: 'MANILLA-A',
      name: LocalizedText.of({ es: 'Manilla de acero', en: 'Steel handle' }),
      description: null,
      category: 'hardware',
      status: 'published',
      sortOrder: 1,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
    Accessory.create({
      id: 'accessory-cierrapuertas',
      code: 'CIERRAPUERTAS',
      name: LocalizedText.of({ es: 'Cierrapuertas', en: 'Door closer' }),
      description: null,
      category: 'closing',
      status: 'published',
      sortOrder: 2,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
    Accessory.create({
      id: 'accessory-vidrio',
      code: 'VIDRIO-TRASERO',
      name: LocalizedText.of({ es: 'Vidrio trasero', en: 'Rear glazing' }),
      description: null,
      category: 'glass',
      status: 'published',
      sortOrder: 3,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
  ]

  const series = [
    DoorSeries.create({
      id: 'series-ci-100',
      code: 'CI-100',
      slug: 'ci-100',
      name: LocalizedText.of({ es: 'Serie CI-100', en: 'CI-100 series' }),
      description: LocalizedText.of({
        es: 'Puerta de paso interior con acabado a elegir',
        en: 'Interior door with a choice of finish',
      }),
      status: 'published',
      sizeRange: SizeRange.of({
        minWidthMm: 600,
        maxWidthMm: 1000,
        minHeightMm: 1800,
        maxHeightMm: 2200,
      }),
      allowedFinishIds: [lacado.id, madera.id],
      allowedAccessoryIds: ['accessory-manilla', 'accessory-cierrapuertas', 'accessory-vidrio'],
      sortOrder: 1,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
    DoorSeries.create({
      id: 'series-ci-200',
      code: 'CI-200',
      slug: 'ci-200',
      name: LocalizedText.of({ es: 'Serie CI-200', en: 'CI-200 series' }),
      description: LocalizedText.of({
        es: 'Puerta de grandes dimensiones por bandas',
        en: 'Large-format door priced by size band',
      }),
      status: 'published',
      sizeRange: SizeRange.of({
        minWidthMm: 700,
        maxWidthMm: 1200,
        minHeightMm: 1900,
        maxHeightMm: 2400,
      }),
      allowedFinishIds: [lacado.id],
      allowedAccessoryIds: ['accessory-manilla'],
      sortOrder: 2,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
    DoorSeries.create({
      id: 'series-ci-300',
      code: 'CI-300',
      slug: 'ci-300',
      name: LocalizedText.of({ es: 'Serie CI-300', en: 'CI-300 series' }),
      description: null,
      status: 'published',
      sizeRange: SizeRange.of({
        minWidthMm: 500,
        maxWidthMm: 900,
        minHeightMm: 1500,
        maxHeightMm: 2100,
      }),
      allowedFinishIds: [madera.id],
      allowedAccessoryIds: ['accessory-manilla'],
      sortOrder: 3,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
    DoorSeries.create({
      id: 'series-ci-400',
      code: 'CI-400',
      slug: 'ci-400',
      name: LocalizedText.of({ es: 'Serie CI-400', en: 'CI-400 series' }),
      description: LocalizedText.of({
        es: 'Serie publicada sin tarifa vigente (pasa a presupuesto manual)',
        en: 'Published series without a tariff in force (manual quote)',
      }),
      status: 'published',
      sizeRange: SizeRange.of({
        minWidthMm: 600,
        maxWidthMm: 1000,
        minHeightMm: 1800,
        maxHeightMm: 2200,
      }),
      allowedFinishIds: [lacado.id],
      allowedAccessoryIds: [],
      sortOrder: 4,
      createdAt: SEED_INSTANT,
      updatedAt: SEED_INSTANT,
    }),
  ]

  const catalogoSeries = series[0] as DoorSeries
  const ci200 = series[1] as DoorSeries
  const ci300 = series[2] as DoorSeries

  const pricing = [
    {
      tariff: tariff({
        id: TARIFF_CI_100_V1,
        seriesId: catalogoSeries.id,
        strategy: 'per_square_metre',
      }),
      priceTable: PriceTable.create({
        tariffVersionId: TARIFF_CI_100_V1,
        strategy: 'per_square_metre',
        perSquareMetre: money('380.00'),
        fixedPrice: null,
        bands: [],
        modifiers: [
          PriceModifier.create({
            id: 'mod-ci-100-lacado',
            code: 'ACABADO-LACADO',
            label: LocalizedText.of({ es: 'Acabado lacado', en: 'Lacquered finish' }),
            kind: 'fixed',
            target: 'finish',
            targetId: lacado.id,
            amount: money('45.00'),
            percentage: null,
          }),
          PriceModifier.create({
            id: 'mod-ci-100-ral7016',
            code: 'COLOR-RAL-7016',
            label: LocalizedText.of({ es: 'Color gris antracita', en: 'Anthracite grey colour' }),
            kind: 'fixed',
            target: 'color',
            targetId: 'color-ral-7016',
            amount: money('25.00'),
            percentage: null,
          }),
          PriceModifier.create({
            id: 'mod-ci-100-manilla',
            code: 'MANILLA-A',
            label: LocalizedText.of({ es: 'Manilla de acero', en: 'Steel handle' }),
            kind: 'per_unit',
            target: 'accessory',
            targetId: 'accessory-manilla',
            amount: money('32.00'),
            percentage: null,
          }),
          PriceModifier.create({
            id: 'mod-ci-100-instalacion',
            code: 'INSTALACION',
            label: LocalizedText.of({ es: 'Instalación', en: 'Installation' }),
            kind: 'fixed',
            target: 'installation',
            targetId: null,
            amount: money('180.00'),
            percentage: null,
          }),
          PriceModifier.create({
            id: 'mod-ci-100-portes',
            code: 'PORTES',
            label: LocalizedText.of({ es: 'Portes', en: 'Delivery' }),
            kind: 'fixed',
            target: 'shipping',
            targetId: null,
            amount: money('95.00'),
            percentage: null,
          }),
          PriceModifier.create({
            id: 'mod-ci-100-urgencia',
            code: 'URGENCIA',
            label: LocalizedText.of({ es: 'Entrega urgente', en: 'Express delivery' }),
            kind: 'percentage',
            target: 'urgency',
            targetId: null,
            amount: null,
            percentage: '5',
          }),
          PriceModifier.create({
            id: 'mod-ci-100-promo10',
            code: 'PROMO10',
            label: LocalizedText.of({ es: 'Descuento promocional', en: 'Promotional discount' }),
            kind: 'percentage',
            target: 'discount',
            targetId: 'PROMO10',
            amount: null,
            percentage: '10',
          }),
        ],
      }),
    },
    {
      tariff: tariff({ id: TARIFF_CI_200_V1, seriesId: ci200.id, strategy: 'size_bands' }),
      priceTable: PriceTable.create({
        tariffVersionId: TARIFF_CI_200_V1,
        strategy: 'size_bands',
        perSquareMetre: null,
        fixedPrice: null,
        bands: [
          SizeBand.create({
            id: 'band-ci-200-1',
            label: LocalizedText.of({ es: 'Mediana', en: 'Medium' }),
            minWidthMm: 700,
            maxWidthMm: 950,
            minHeightMm: 1900,
            maxHeightMm: 2150,
            price: money('980.00'),
          }),
          SizeBand.create({
            id: 'band-ci-200-2',
            label: LocalizedText.of({ es: 'Ancha', en: 'Wide' }),
            minWidthMm: 951,
            maxWidthMm: 1200,
            minHeightMm: 1900,
            maxHeightMm: 2150,
            price: money('1180.00'),
          }),
          SizeBand.create({
            id: 'band-ci-200-3',
            label: LocalizedText.of({ es: 'Alta', en: 'Tall' }),
            minWidthMm: 700,
            maxWidthMm: 1200,
            minHeightMm: 2151,
            maxHeightMm: 2400,
            price: money('1320.00'),
          }),
        ],
        modifiers: [],
      }),
    },
    {
      tariff: tariff({ id: TARIFF_CI_300_V1, seriesId: ci300.id, strategy: 'fixed' }),
      priceTable: PriceTable.create({
        tariffVersionId: TARIFF_CI_300_V1,
        strategy: 'fixed',
        perSquareMetre: null,
        fixedPrice: money('1450.00'),
        bands: [],
        modifiers: [],
      }),
    },
  ]

  return { series, finishes: [lacado, madera], colors, accessories, pricing }
}

export function createDemoCatalogStore(): InMemoryCatalogStore {
  return new InMemoryCatalogStore(buildDemoCatalog())
}
