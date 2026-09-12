'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { DoorPreview } from './door-preview'
import {
  TIPOS_2D_MVP,
  buildPreviewGeometry,
  type FinishKind,
  type HingeSide,
  type MvpDoorType,
  type Planking,
} from './model'

/**
 * Panel del configurador que alimenta la vista previa 2D en vivo (CIF-6).
 *
 * Une las opciones que afectan al dibujo con el modelo visual. Mientras CIF-7 no conecte el catálogo
 * publicado y el motor de precios, la paleta y el rango de medidas son de demostración y viven aquí,
 * nunca dentro del modelo ni del componente de pintura.
 */

interface ColorOption {
  readonly id: string
  /** Código del catálogo: alimenta el veteado determinista del modelo. */
  readonly code: string
  readonly hex: string | null
}

const COLOR_OPTIONS: readonly ColorOption[] = [
  { id: 'ninguno', code: 'sin-color', hex: null },
  { id: 'ral-9010', code: 'RAL 9010', hex: '#F1EDE1' },
  { id: 'ral-7016', code: 'RAL 7016', hex: '#383E42' },
  { id: 'roble', code: 'Roble rústico', hex: '#B98A54' },
]

const FINISH_OPTIONS = [
  'lacado',
  'decorado-madera',
  'anodizado',
  'acero',
  'corten',
  'sin-acabado',
] as const satisfies readonly FinishKind[]

const PLANKING_OPTIONS = [
  'tablones-36',
  'tablones-54',
  'tablones-curvos-36',
  'tablones-curvos-54',
  'duelas-verticales',
  'duelas-horizontales',
] as const satisfies readonly Planking[]

const HINGE_SIDES = ['izquierda', 'derecha'] as const satisfies readonly HingeSide[]

const FINISH_LABEL_KEYS: Record<FinishKind, string> = {
  lacado: 'lacado',
  'chapa-natural': 'chapaNatural',
  'decorado-madera': 'decoradoMadera',
  aluminio: 'aluminio',
  anodizado: 'anodizado',
  acero: 'acero',
  corten: 'corten',
  'sin-acabado': 'sinAcabado',
}

const TYPE_LABEL_KEYS: Record<MvpDoorType, string> = {
  'abatible-1-hoja': 'abatible1Hoja',
  'abatible-2-hojas': 'abatible2Hojas',
  'entrada-acorazada': 'entradaAcorazada',
  'pivotante-1-hoja': 'pivotante1Hoja',
  'pivotante-2-hojas': 'pivotante2Hoja',
}

const PLANKING_LABEL_KEYS: Record<Planking | 'ninguna', string> = {
  ninguna: 'ninguna',
  'tablones-36': 'tablones36',
  'tablones-54': 'tablones54',
  'tablones-curvos-36': 'tablonesCurvos36',
  'tablones-curvos-54': 'tablonesCurvos54',
  'duelas-verticales': 'duelasVerticales',
  'duelas-horizontales': 'duelasHorizontales',
}

/** Rango de la serie de demostración: dispara el aviso de paso a presupuesto manual del MVP. */
const DEMO_SIZE_RANGE = {
  minWidthMm: 700,
  maxWidthMm: 1200,
  minHeightMm: 1900,
  maxHeightMm: 2400,
} as const

const DEFAULT_WIDTH_MM = 900
const DEFAULT_HEIGHT_MM = 2030

function isMvpDoorType(value: string): value is MvpDoorType {
  return (TIPOS_2D_MVP as readonly string[]).includes(value)
}

function isFinishKind(value: string): value is FinishKind {
  return (FINISH_OPTIONS as readonly string[]).includes(value)
}

function isPlanking(value: string): value is Planking {
  return (PLANKING_OPTIONS as readonly string[]).includes(value)
}

export function Preview2DConfigurator(): React.JSX.Element {
  const t = useTranslations('Preview2D')

  const [type, setType] = useState<MvpDoorType>('abatible-1-hoja')
  const [widthMm, setWidthMm] = useState(DEFAULT_WIDTH_MM)
  const [heightMm, setHeightMm] = useState(DEFAULT_HEIGHT_MM)
  const [hingeSide, setHingeSide] = useState<HingeSide>('derecha')
  const [finishKind, setFinishKind] = useState<FinishKind>('lacado')
  const [colorId, setColorId] = useState('ral-7016')
  const [planking, setPlanking] = useState<Planking | 'ninguna'>('ninguna')
  const [moulding, setMoulding] = useState(false)
  const [twoToneFrame, setTwoToneFrame] = useState(false)
  const [glazing, setGlazing] = useState(false)

  const color = COLOR_OPTIONS.find((option) => option.id === colorId) ?? COLOR_OPTIONS[0]
  const colorHex = color?.hex ?? null
  const withinSeriesRange =
    widthMm >= DEMO_SIZE_RANGE.minWidthMm &&
    widthMm <= DEMO_SIZE_RANGE.maxWidthMm &&
    heightMm >= DEMO_SIZE_RANGE.minHeightMm &&
    heightMm <= DEMO_SIZE_RANGE.maxHeightMm

  const geometry = buildPreviewGeometry({
    type,
    widthMm,
    heightMm,
    hingeSide,
    glazing: 'ninguno',
    ventilation: 'ninguno',
    finishKind,
    colorCode: color?.code ?? '',
    colorHex,
    withinSeriesRange,
    planking: planking === 'ninguna' ? null : planking,
    aperturas: glazing
      ? [
          { x: 0.4, y: 0.08, w: 0.2, h: 0.18, forma: 'rect' },
          { x: 0.4, y: 0.42, w: 0.2, h: 0.18, forma: 'rect' },
        ]
      : [],
    moulding,
    twoToneFrame,
    secondColorHex: twoToneFrame ? '#9AA2A9' : null,
  })

  const number = (value: string, fallback: number): number => {
    const parsed = Number.parseInt(value, 10)

    return Number.isFinite(parsed) ? parsed : fallback
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
      <section
        aria-labelledby="vista-previa"
        className="lg:order-2 lg:sticky lg:top-6 lg:self-start"
      >
        <h2 id="vista-previa" className="text-xl font-semibold text-brand-900">
          {t('previewTitle')}
        </h2>
        {/*
          `w-full`: la tarjeta llena la columna y el SVG letterboxea dentro (`preserveAspectRatio`
          `xMidYMid meet`), en vez de encogerse al 60 % del ancho cuando el alto lo recorta el
          presupuesto de móvil (nota N3 de CIF-167).
        */}
        <div
          data-testid="preview-card"
          className="mt-2 flex aspect-[3/4] max-h-[34vh] w-full items-center justify-center overflow-hidden rounded-lg bg-[#f7f7f5] lg:mt-3 lg:max-h-none"
        >
          <DoorPreview
            geometry={geometry}
            className="h-full w-full"
            labels={{
              region: t('regionDetail', {
                type: t(`types.${TYPE_LABEL_KEYS[type]}`),
                width: widthMm,
                height: heightMm,
                finish: t(`finishes.${FINISH_LABEL_KEYS[finishKind]}`),
                color: t(`colors.${color?.id ?? 'ninguno'}`),
              }),
              colorUndefined: t('colorUndefined'),
            }}
          />
        </div>
        <p
          className="mt-2 text-sm font-medium text-brand-700 lg:mt-3"
          role="status"
          aria-live="polite"
          data-testid="preview-measurement"
        >
          {t('summary.measurement', { width: widthMm, height: heightMm })}
        </p>
        {withinSeriesRange ? null : (
          <p
            className="mt-2 rounded-md bg-accent-100 px-3 py-2 text-sm font-medium text-accent-700"
            role="alert"
            data-testid="preview-out-of-range"
          >
            {t('summary.outOfRange')}
          </p>
        )}
      </section>

      <form className="lg:order-1" aria-labelledby="opciones-configurador">
        <h2 id="opciones-configurador" className="text-xl font-semibold text-brand-900">
          {t('panelTitle')}
        </h2>
        <p className="mt-2 text-sm text-brand-700">{t('summary.live')}</p>

        <div className="mt-4 flex flex-col gap-6 lg:mt-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-brand-900" htmlFor="tipo">
              {t('form.type')}
            </label>
            <select
              id="tipo"
              name="tipo"
              data-testid="preview-type"
              className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
              value={type}
              onChange={(event) => {
                if (isMvpDoorType(event.target.value)) {
                  setType(event.target.value)
                }
              }}
            >
              {TIPOS_2D_MVP.map((option) => (
                <option key={option} value={option}>
                  {t(`types.${TYPE_LABEL_KEYS[option]}`)}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-brand-900">
              {t('form.measurements')}
            </legend>
            <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="ancho">
              {t('form.width')}
              <input
                id="ancho"
                name="ancho"
                data-testid="preview-width"
                aria-describedby="preview-range"
                className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                type="number"
                inputMode="numeric"
                min={1}
                max={10_000}
                step={10}
                value={widthMm}
                onChange={(event) => setWidthMm(number(event.target.value, widthMm))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="alto">
              {t('form.height')}
              <input
                id="alto"
                name="alto"
                data-testid="preview-height"
                aria-describedby="preview-range"
                className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                type="number"
                inputMode="numeric"
                min={1}
                max={10_000}
                step={10}
                value={heightMm}
                onChange={(event) => setHeightMm(number(event.target.value, heightMm))}
              />
            </label>
            {/*
              El rango de la serie describe a los dos campos de medida: vive con ellos y no entre la
              tarjeta y el primer control, donde empujaba el formulario bajo el pliegue en móvil.
            */}
            <p id="preview-range" className="text-sm text-brand-500" data-testid="preview-range">
              {t('summary.range', {
                minWidth: DEMO_SIZE_RANGE.minWidthMm,
                maxWidth: DEMO_SIZE_RANGE.maxWidthMm,
                minHeight: DEMO_SIZE_RANGE.minHeightMm,
                maxHeight: DEMO_SIZE_RANGE.maxHeightMm,
              })}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-brand-900">{t('form.finish')}</legend>
            <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="acabado">
              {t('form.finishKind')}
              <select
                id="acabado"
                name="acabado"
                data-testid="preview-finish"
                className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                value={finishKind}
                onChange={(event) => {
                  if (isFinishKind(event.target.value)) {
                    setFinishKind(event.target.value)
                  }
                }}
              >
                {FINISH_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`finishes.${FINISH_LABEL_KEYS[option]}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="color">
              {t('form.color')}
              <select
                id="color"
                name="color"
                data-testid="preview-color"
                className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                value={colorId}
                onChange={(event) => setColorId(event.target.value)}
              >
                {COLOR_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t(`colors.${option.id}`)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-brand-900">{t('form.hingeSide')}</legend>
            <div className="flex gap-4">
              {HINGE_SIDES.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-brand-700">
                  <input
                    type="radio"
                    name="mano"
                    data-testid={`preview-hinge-side-${option}`}
                    value={option}
                    checked={hingeSide === option}
                    onChange={() => setHingeSide(option)}
                  />
                  {t(`hingeSides.${option}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-brand-900">{t('form.surface')}</legend>
            <label className="flex flex-col gap-1 text-sm text-brand-700" htmlFor="superficie">
              {t('form.planking')}
              <select
                id="superficie"
                name="superficie"
                data-testid="preview-planking"
                className="rounded-md border border-brand-500/40 bg-white px-3 py-2"
                value={planking}
                onChange={(event) => {
                  if (event.target.value === 'ninguna' || isPlanking(event.target.value)) {
                    setPlanking(event.target.value)
                  }
                }}
              >
                {(['ninguna', ...PLANKING_OPTIONS] as const).map((option) => (
                  <option key={option} value={option}>
                    {t(`plankings.${PLANKING_LABEL_KEYS[option]}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-700">
              <input
                type="checkbox"
                name="enmarcado"
                data-testid="preview-moulding"
                checked={moulding}
                onChange={(event) => setMoulding(event.target.checked)}
              />
              {t('form.moulding')}
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-700">
              <input
                type="checkbox"
                name="bicolor"
                data-testid="preview-two-tone-frame"
                checked={twoToneFrame}
                onChange={(event) => setTwoToneFrame(event.target.checked)}
              />
              {t('form.twoToneFrame')}
            </label>
            <label className="flex items-center gap-2 text-sm text-brand-700">
              <input
                type="checkbox"
                name="huecos"
                data-testid="preview-glazing"
                checked={glazing}
                onChange={(event) => setGlazing(event.target.checked)}
              />
              {t('form.glazing')}
            </label>
          </fieldset>
        </div>
      </form>
    </div>
  )
}
