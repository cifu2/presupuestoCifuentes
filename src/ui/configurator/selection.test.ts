import { describe, expect, it } from 'vitest'

import type { CatalogSeriesSummary } from '@/application/use-cases/get-published-series'
import type { CatalogSeriesDetail } from '@/application/use-cases/get-series-detail'
import { MAX_DIMENSION_MM, MIN_DIMENSION_MM } from '@/domain/catalog/measurement'
import { TIPOS_2D_MVP } from '@/ui/preview-2d/model'

import {
  DEFAULT_HEIGHT_MM,
  DEFAULT_WIDTH_MM,
  DRAFT_VERSION,
  HINGE_MESSAGE_KEYS,
  HINGE_SIDES,
  PLANKINGS,
  PLANKING_MESSAGE_KEYS,
  TYPE_MESSAGE_KEYS,
  assessSelectionSize,
  belowMinimumAxes,
  buildConfigurationRequestBody,
  buildManualQuoteRequestBody,
  clearDraft,
  colorsForFinish,
  defaultSelection,
  draftStorageKey,
  finishKindForCode,
  isMvpDoorType,
  isPlanking,
  isWithinSeriesRange,
  parseDraft,
  parseMeasurementInput,
  readDraft,
  reconcileSelection,
  saveDraft,
  serializeDraft,
  validateContact,
  type ConfiguratorSelection,
  type DraftStorage,
} from './selection'

const SERIES: CatalogSeriesSummary = {
  id: 'series-ci-100',
  code: 'CI-100',
  slug: 'ci-100',
  name: 'Serie CI-100',
  description: null,
  sizeRange: { minWidthMm: 600, maxWidthMm: 1000, minHeightMm: 1800, maxHeightMm: 2200 },
  allowedFinishIds: ['finish-lacado', 'finish-madera'],
  allowedAccessoryIds: ['accessory-manilla', 'accessory-vidrio'],
}

const DETAIL: CatalogSeriesDetail = {
  series: SERIES,
  finishes: [
    {
      id: 'finish-lacado',
      code: 'LACADO',
      name: 'Lacado',
      description: null,
      colors: [
        { id: 'color-ral-9010', code: 'RAL-9010', name: 'Blanco puro', hex: '#F1EDE1' },
        { id: 'color-ral-7016', code: 'RAL-7016', name: 'Gris antracita', hex: '#383E42' },
      ],
    },
    {
      id: 'finish-madera',
      code: 'MADERA',
      name: 'Chapa natural',
      description: null,
      colors: [{ id: 'color-roble', code: 'ROBLE', name: 'Roble', hex: '#B98A54' }],
    },
  ],
  accessories: [
    {
      id: 'accessory-manilla',
      code: 'MANILLA-A',
      name: 'Manilla de acero',
      description: null,
      category: 'hardware',
    },
    {
      id: 'accessory-vidrio',
      code: 'VIDRIO-TRASERO',
      name: 'Vidrio trasero',
      description: null,
      category: 'glass',
    },
  ],
}

function storage(
  initial: Record<string, string> = {},
): DraftStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))

  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}

describe('validación de medidas', () => {
  it('acepta enteros dentro del rango del dominio', () => {
    expect(parseMeasurementInput('900')).toEqual({ ok: true, value: 900 })
    expect(parseMeasurementInput(' 2030 ')).toEqual({ ok: true, value: 2030 })
    expect(parseMeasurementInput(String(MAX_DIMENSION_MM))).toEqual({
      ok: true,
      value: MAX_DIMENSION_MM,
    })
  })

  it('rechaza lo que no es un entero positivo', () => {
    expect(parseMeasurementInput('')).toEqual({ ok: false, error: 'not_integer' })
    expect(parseMeasurementInput('90,5')).toEqual({ ok: false, error: 'not_integer' })
    expect(parseMeasurementInput('-5')).toEqual({ ok: false, error: 'not_integer' })
    expect(parseMeasurementInput('9e2')).toEqual({ ok: false, error: 'not_integer' })
  })

  it('distingue por debajo del mínimo y por encima del máximo del dominio', () => {
    expect(parseMeasurementInput('0')).toEqual({ ok: false, error: 'below_minimum' })
    expect(parseMeasurementInput('10001')).toEqual({ ok: false, error: 'above_maximum' })
    expect(MIN_DIMENSION_MM).toBe(1)
  })

  it('evalúa la medida contra el rango de la serie con las invariantes del dominio', () => {
    expect(assessSelectionSize({ widthMm: 900, heightMm: 2030 }, SERIES.sizeRange)?.status).toBe(
      'within_range',
    )

    const above = assessSelectionSize({ widthMm: 1300, heightMm: 2030 }, SERIES.sizeRange)

    expect(above?.status).toBe('out_of_range')
    expect(above?.status === 'out_of_range' ? above.requiresManualQuote : false).toBe(true)

    const below = assessSelectionSize({ widthMm: 900, heightMm: 1700 }, SERIES.sizeRange)

    expect(below?.status).toBe('out_of_range')
    expect(below?.status === 'out_of_range' ? below.requiresManualQuote : true).toBe(false)

    // Una medida imposible para el dominio no se evalúa: la valida el borde antes.
    expect(assessSelectionSize({ widthMm: 0, heightMm: 2030 }, SERIES.sizeRange)).toBeNull()
    expect(isWithinSeriesRange({ widthMm: 900, heightMm: 2030 }, SERIES.sizeRange)).toBe(true)
  })

  it('separa los ejes por debajo del mínimo para el error inline (D1)', () => {
    expect(
      belowMinimumAxes(assessSelectionSize({ widthMm: 900, heightMm: 2030 }, SERIES.sizeRange)),
    ).toEqual({ width: false, height: false })
    expect(
      belowMinimumAxes(assessSelectionSize({ widthMm: 500, heightMm: 2030 }, SERIES.sizeRange)),
    ).toEqual({ width: true, height: false })
    expect(
      belowMinimumAxes(assessSelectionSize({ widthMm: 900, heightMm: 1700 }, SERIES.sizeRange)),
    ).toEqual({ width: false, height: true })
    // Solo el máximo es presupuesto manual: no se marca como error inline.
    expect(
      belowMinimumAxes(assessSelectionSize({ widthMm: 1300, heightMm: 2030 }, SERIES.sizeRange)),
    ).toEqual({ width: false, height: false })
    expect(belowMinimumAxes(null)).toEqual({ width: false, height: false })
  })
})

describe('selección por defecto y reconciliación con el catálogo', () => {
  it('usa el primer acabado publicado y su primer color', () => {
    const selection = defaultSelection(SERIES, DETAIL)

    expect(selection).toMatchObject({
      seriesSlug: 'ci-100',
      doorType: 'abatible-1-hoja',
      finishId: 'finish-lacado',
      colorId: 'color-ral-9010',
      accessoryIds: [],
      extras: [],
      planking: null,
    })
  })

  it('acota las medidas por defecto al rango de la serie (sin salirse por arriba ni por abajo)', () => {
    const narrow: CatalogSeriesSummary = {
      ...SERIES,
      sizeRange: { minWidthMm: 1000, maxWidthMm: 1100, minHeightMm: 2400, maxHeightMm: 2600 },
    }
    const wide: CatalogSeriesSummary = {
      ...SERIES,
      sizeRange: { minWidthMm: 400, maxWidthMm: 800, minHeightMm: 1500, maxHeightMm: 1900 },
    }

    expect(defaultSelection(narrow, DETAIL)).toMatchObject({ widthMm: 1000, heightMm: 2400 })
    expect(defaultSelection(wide, DETAIL)).toMatchObject({ widthMm: 800, heightMm: 1900 })
    expect(DEFAULT_WIDTH_MM).toBe(900)
    expect(DEFAULT_HEIGHT_MM).toBe(2030)
  })

  it('descarta acabados, colores y accesorios que ya no están publicados', () => {
    const candidate: ConfiguratorSelection = {
      ...defaultSelection(SERIES, DETAIL),
      finishId: 'finish-retirado',
      colorId: 'color-retirado',
      accessoryIds: ['accessory-manilla', 'accessory-retirado', 'accessory-manilla'],
      discountCode: 'X'.repeat(40),
    }
    const reconciled = reconcileSelection(candidate, SERIES, DETAIL)

    expect(reconciled.finishId).toBe('finish-lacado')
    expect(reconciled.colorId).toBe('color-ral-9010')
    expect(reconciled.accessoryIds).toEqual(['accessory-manilla'])
    expect(reconciled.discountCode).toHaveLength(32)
  })

  it('respeta el color cuando sigue perteneciendo al acabado elegido', () => {
    const reconciled = reconcileSelection(
      { ...defaultSelection(SERIES, DETAIL), colorId: 'color-ral-7016' },
      SERIES,
      DETAIL,
    )

    expect(reconciled.colorId).toBe('color-ral-7016')
  })

  it('cambia de color al primero del acabado nuevo, porque un color pertenece a un acabado', () => {
    const reconciled = reconcileSelection(
      { ...defaultSelection(SERIES, DETAIL), finishId: 'finish-madera' },
      SERIES,
      DETAIL,
    )

    expect(reconciled.finishId).toBe('finish-madera')
    expect(reconciled.colorId).toBe('color-roble')
  })

  it('nunca acota al máximo de la serie: pasarse es un caso legítimo de presupuesto manual', () => {
    const selection: ConfiguratorSelection = {
      ...defaultSelection(SERIES, DETAIL),
      widthMm: 1900,
      heightMm: 2030,
    }

    expect(reconcileSelection(selection, SERIES, DETAIL).widthMm).toBe(1900)
  })

  it('ante una medida imposible para el dominio vuelve al valor por defecto', () => {
    const selection: ConfiguratorSelection = {
      ...defaultSelection(SERIES, DETAIL),
      widthMm: 0,
      heightMm: 99_999,
    }
    const reconciled = reconcileSelection(selection, SERIES, DETAIL)

    expect(reconciled.widthMm).toBe(DEFAULT_WIDTH_MM)
    expect(reconciled.heightMm).toBe(DEFAULT_HEIGHT_MM)
  })

  it('al cambiar de serie parte de la configuración por defecto de la nueva', () => {
    const other: CatalogSeriesSummary = {
      ...SERIES,
      id: 'series-ci-300',
      slug: 'ci-300',
      code: 'CI-300',
      allowedFinishIds: ['finish-madera'],
      allowedAccessoryIds: [],
    }
    const reconciled = reconcileSelection(
      { ...defaultSelection(SERIES, DETAIL), accessoryIds: ['accessory-manilla'] },
      other,
      null,
    )

    expect(reconciled.seriesSlug).toBe('ci-300')
    expect(reconciled.accessoryIds).toEqual([])
  })

  it('sin la ficha cargada conserva lo elegido y solo deduplica', () => {
    const candidate: ConfiguratorSelection = {
      ...defaultSelection(SERIES, DETAIL),
      accessoryIds: ['accessory-manilla', 'accessory-manilla'],
      extras: ['installation', 'installation'],
    }
    const reconciled = reconcileSelection(candidate, SERIES, null)

    expect(reconciled.finishId).toBe(candidate.finishId)
    expect(reconciled.accessoryIds).toEqual(['accessory-manilla'])
    expect(reconciled.extras).toEqual(['installation'])
  })

  it('solo ofrece los colores del acabado elegido', () => {
    expect(colorsForFinish(DETAIL, 'finish-madera').map((color) => color.id)).toEqual([
      'color-roble',
    ])
    expect(colorsForFinish(DETAIL, null)).toEqual([])
    expect(colorsForFinish(null, 'finish-lacado')).toEqual([])
  })
})

describe('cuerpos de la API pública', () => {
  it('construye el cuerpo de precio con la forma exacta del contrato', () => {
    const body = buildConfigurationRequestBody(
      {
        ...defaultSelection(SERIES, DETAIL),
        colorId: 'color-ral-7016',
        accessoryIds: ['accessory-manilla', 'accessory-manilla'],
        extras: ['installation', 'installation'],
        discountCode: '  PROMO10  ',
      },
      'es',
    )

    expect(body).toEqual({
      seriesSlug: 'ci-100',
      widthMm: DEFAULT_WIDTH_MM,
      heightMm: DEFAULT_HEIGHT_MM,
      finishId: 'finish-lacado',
      colorId: 'color-ral-7016',
      accessoryIds: ['accessory-manilla'],
      extras: ['installation'],
      discountCode: 'PROMO10',
      locale: 'es',
    })
  })

  it('elimina el color cuando no hay acabado y normaliza el descuento vacío', () => {
    const body = buildConfigurationRequestBody(
      { ...defaultSelection(SERIES, DETAIL), finishId: null, discountCode: '   ' },
      'en',
    )

    expect(body.finishId).toBeNull()
    expect(body.colorId).toBeNull()
    expect(body.discountCode).toBeNull()
    expect(body.locale).toBe('en')
  })

  it('construye la solicitud manual con el contacto normalizado', () => {
    const body = buildManualQuoteRequestBody(
      defaultSelection(SERIES, DETAIL),
      {
        name: '  Ana Ruiz  ',
        email: ' ana@example.com ',
        phone: '   ',
        message: '  ',
      },
      'es',
    )

    expect(body.customerRequested).toBe(false)
    expect(body.contact).toEqual({
      name: 'Ana Ruiz',
      email: 'ana@example.com',
      phone: null,
      message: null,
    })
    expect(body.seriesSlug).toBe('ci-100')
  })
})

describe('validación del contacto', () => {
  const valid = { name: 'Ana Ruiz', email: 'ana@example.com', phone: '600000000', message: null }

  it('acepta un contacto completo', () => {
    expect(validateContact(valid)).toEqual({})
  })

  it('exige nombre y correo', () => {
    expect(validateContact({ ...valid, name: ' ', email: '' })).toEqual({
      name: 'required',
      email: 'required',
    })
  })

  it('acota longitudes y formato', () => {
    expect(validateContact({ ...valid, name: 'A' }).name).toBe('too_short')
    expect(validateContact({ ...valid, name: 'A'.repeat(121) }).name).toBe('too_long')
    expect(validateContact({ ...valid, email: 'ana@' }).email).toBe('invalid_email')
    expect(validateContact({ ...valid, phone: '123' }).phone).toBe('too_short')
    expect(validateContact({ ...valid, phone: '1'.repeat(41) }).phone).toBe('too_long')
    expect(validateContact({ ...valid, message: 'x'.repeat(2001) }).message).toBe('too_long')
  })

  it('el teléfono y el mensaje son opcionales', () => {
    expect(validateContact({ ...valid, phone: null, message: null })).toEqual({})
  })
})

describe('acabado del catálogo → acabado visual del 2D', () => {
  it('reconoce los acabados del catálogo por palabra clave', () => {
    expect(finishKindForCode('LACADO')).toBe('lacado')
    expect(finishKindForCode('RAL-9010')).toBe('sin-acabado')
    expect(finishKindForCode('MADERA-ROBLE')).toBe('chapa-natural')
    expect(finishKindForCode('DECORADO-ROBLE')).toBe('decorado-madera')
    expect(finishKindForCode('ANODIZADO-PLATA')).toBe('anodizado')
    expect(finishKindForCode('ALUMINIO')).toBe('aluminio')
    expect(finishKindForCode('ACERO-INOX')).toBe('acero')
    expect(finishKindForCode('CORTEN')).toBe('corten')
  })

  it('un código desconocido cae a relleno neutro en vez de romper el dibujo', () => {
    expect(finishKindForCode('SIN-CLASIFICAR')).toBe('sin-acabado')
  })
})

describe('claves de mensajes del modelo', () => {
  it('cubre todos los tipos de puerta del MVP', () => {
    for (const type of TIPOS_2D_MVP) {
      expect(TYPE_MESSAGE_KEYS[type]).toBeTruthy()
    }
  })

  it('cubre las manos y todas las superficies, incluida «ninguna»', () => {
    for (const side of HINGE_SIDES) {
      expect(HINGE_MESSAGE_KEYS[side]).toBeTruthy()
    }

    for (const planking of PLANKINGS) {
      expect(PLANKING_MESSAGE_KEYS[planking]).toBeTruthy()
    }

    expect(PLANKING_MESSAGE_KEYS.ninguna).toBeTruthy()
  })
})

describe('guardas de tipo de los selectores', () => {
  it('reconoce los valores válidos y rechaza el resto', () => {
    expect(isMvpDoorType('pivotante-2-hojas')).toBe(true)
    expect(isMvpDoorType('corredera')).toBe(false)
    expect(isPlanking('tablones-36')).toBe(true)
    expect(isPlanking('ninguna')).toBe(false)
  })
})

describe('borrador recuperable', () => {
  const selection = {
    ...defaultSelection(SERIES, DETAIL),
    doorType: 'pivotante-1-hoja',
    hingeSide: 'izquierda',
    glazing: true,
  } as const

  it('va y vuelve sin pérdida', () => {
    expect(parseDraft(serializeDraft(selection))).toEqual(selection)
  })

  it('se guarda por idioma y con la versión del formato', () => {
    expect(draftStorageKey('es')).toContain(':es:')
    expect(draftStorageKey('en')).toContain(':en:')
    expect(draftStorageKey('es')).toContain(`v${DRAFT_VERSION}`)
  })

  it('descarta borradores corruptos, de otra versión o con datos fuera de rango', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('')).toBeNull()
    expect(parseDraft('{no-json')).toBeNull()
    expect(parseDraft(JSON.stringify({ version: 99, selection }))).toBeNull()
    expect(
      parseDraft(
        JSON.stringify({ version: DRAFT_VERSION, selection: { ...selection, widthMm: 0 } }),
      ),
    ).toBeNull()
    expect(
      parseDraft(
        JSON.stringify({ version: DRAFT_VERSION, selection: { ...selection, doorType: 'garaje' } }),
      ),
    ).toBeNull()
  })

  it('lee, guarda y borra en el almacenamiento del navegador', () => {
    const fake = storage()
    const key = draftStorageKey('es')

    saveDraft(fake, 'es', selection)

    expect(fake.values.has(key)).toBe(true)
    expect(readDraft(fake, 'es')).toEqual(selection)
    // El borrador de un idioma no se sirve en el otro.
    expect(readDraft(fake, 'en')).toBeNull()

    clearDraft(fake, 'es')

    expect(readDraft(fake, 'es')).toBeNull()
  })

  it('no revienta si el navegador no deja usar el almacenamiento', () => {
    const broken: DraftStorage = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }

    expect(readDraft(broken, 'es')).toBeNull()
    expect(() => saveDraft(broken, 'es', selection)).not.toThrow()
    expect(() => clearDraft(broken, 'es')).not.toThrow()
  })
})
