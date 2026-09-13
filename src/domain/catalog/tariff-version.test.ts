import { describe, expect, it } from 'vitest'

import {
  AmbiguousTariffError,
  InvalidCatalogTransitionError,
  InvalidTariffVersionError,
  InvalidValidityPeriodError,
  InvalidValueError,
} from '@/domain/shared/errors'

import { makeTariffVersion, TEST_NOW } from './testing/factories'
import {
  TariffVersion,
  assertNoOverlappingPublishedTariffs,
  projectPublishedSet,
  selectTariffInForce,
} from './tariff-version'
import { ValidityPeriod } from './validity-period'

const from = new Date('2026-01-01T00:00:00.000Z')
const until = new Date('2027-01-01T00:00:00.000Z')
const inForce = new Date('2026-06-01T00:00:00.000Z')

describe('TariffVersion', () => {
  it('valida los datos de la versión de tarifa', () => {
    expect(() => makeTariffVersion()).not.toThrow()
    expect(() => makeTariffVersion({ id: '  ' })).toThrow(InvalidValueError)
    expect(() => makeTariffVersion({ seriesId: '' })).toThrow(InvalidValueError)
    expect(() => makeTariffVersion({ versionNumber: 0 })).toThrow(InvalidValueError)
    expect(() => makeTariffVersion({ taxRatePercent: '21,5' })).toThrow(InvalidValueError)
    expect(() => makeTariffVersion({ taxRatePercent: '21.567' })).toThrow(InvalidValueError)
    expect(() => makeTariffVersion({ taxRatePercent: '121' })).toThrow(InvalidValueError)
    expect(() => makeTariffVersion({ currency: '' })).toThrow(InvalidValueError)
  })

  it('rechaza fechas de auditoría inválidas', () => {
    expect(() => makeTariffVersion({ createdAt: new Date('no-es-fecha') })).toThrow(
      InvalidValueError,
    )
    expect(() => makeTariffVersion({ publishedAt: new Date('no-es-fecha') })).toThrow(
      InvalidValueError,
    )
  })

  it('solo da precio si está publicada y vigente', () => {
    const published = makeTariffVersion({ validity: ValidityPeriod.of(from, until) })
    const draft = makeTariffVersion({
      status: 'draft',
      publishedAt: null,
      validity: ValidityPeriod.of(from, until),
    })
    const expired = makeTariffVersion({
      validity: ValidityPeriod.of(new Date('2025-01-01T00:00:00.000Z'), from),
    })

    expect(published.isPublished()).toBe(true)
    expect(published.isInForceAt(inForce)).toBe(true)
    expect(published.isInForceAt(new Date('2027-06-01T00:00:00.000Z'))).toBe(false)
    expect(draft.isInForceAt(inForce)).toBe(false)
    expect(expired.isInForceAt(inForce)).toBe(false)
  })

  it('registra la fecha de publicación al publicar y la conserva al volver a borrador', () => {
    const draft = makeTariffVersion({ status: 'draft', publishedAt: null })
    const published = draft.publish(TEST_NOW)
    const backToDraft = published.restore(TEST_NOW)

    expect(published.status).toBe('published')
    expect(published.publishedAt).toEqual(TEST_NOW)
    expect(backToDraft.status).toBe('draft')
    expect(backToDraft.publishedAt).toEqual(TEST_NOW)
  })

  it('archiva y rechaza transiciones no permitidas', () => {
    const archived = makeTariffVersion().archive(TEST_NOW)

    expect(archived.status).toBe('archived')
    expect(archived.publishedAt).toEqual(TEST_NOW)
    expect(() => archived.publish(TEST_NOW)).toThrow(InvalidCatalogTransitionError)
    expect(() => archived.restore(new Date('no-es-fecha'))).toThrow(InvalidValueError)

    const draft = makeTariffVersion({ status: 'draft', publishedAt: null })
    expect(() => draft.publish(new Date('no-es-fecha'))).toThrow(InvalidValueError)
  })

  it('rechaza estrategias de precio desconocidas en tiempo de ejecución', () => {
    expect(() =>
      TariffVersion.create({
        ...makeTariffVersion(),
        // @ts-expect-error: comprobamos la validación de datos que llegan sin tipar del panel
        strategy: 'por_peso',
      }),
    ).toThrow(InvalidTariffVersionError)
  })

  describe('cierre de la vigencia (ADR-0003 rev. 2, §8)', () => {
    it('cierra una versión publicada sin archivarla y conserva su publicación', () => {
      const closed = makeTariffVersion({ validity: ValidityPeriod.of(from) }).closeValidity(
        until,
        inForce,
      )

      expect(closed.status).toBe('published')
      expect(closed.publishedAt).toEqual(TEST_NOW)
      expect(closed.validity.validUntil).toEqual(until)
      expect(closed.updatedAt).toEqual(inForce)
    })

    it('rechaza cerrar con una fecha igual o anterior al inicio', () => {
      const published = makeTariffVersion({ validity: ValidityPeriod.of(from) })

      expect(() => published.closeValidity(from, inForce)).toThrow(InvalidValidityPeriodError)
      expect(() => published.closeValidity(new Date('2025-12-01T00:00:00.000Z'), inForce)).toThrow(
        InvalidValidityPeriodError,
      )
    })

    it('rechaza cerrar una versión que no está publicada', () => {
      const draft = makeTariffVersion({ status: 'draft', publishedAt: null })
      const archived = makeTariffVersion({ status: 'archived' })

      expect(() => draft.closeValidity(until, inForce)).toThrow(InvalidTariffVersionError)
      expect(() => archived.closeValidity(until, inForce)).toThrow(InvalidTariffVersionError)
    })
  })
})

describe('selectTariffInForce', () => {
  it('devuelve la versión publicada vigente en el instante pedido', () => {
    const version = makeTariffVersion({ validity: ValidityPeriod.of(from, until) })

    expect(selectTariffInForce([version], inForce)).toBe(version)
  })

  it('devuelve undefined si no hay tarifa vigente (paso a presupuesto manual)', () => {
    const future = makeTariffVersion({
      validity: ValidityPeriod.of(new Date('2030-01-01T00:00:00.000Z')),
    })
    const draft = makeTariffVersion({
      status: 'draft',
      publishedAt: null,
      validity: ValidityPeriod.of(from, until),
    })

    expect(selectTariffInForce([future, draft], inForce)).toBeUndefined()
    expect(selectTariffInForce([], inForce)).toBeUndefined()
  })

  it('falla si hay más de una tarifa vigente para la misma serie', () => {
    const first = makeTariffVersion({ validity: ValidityPeriod.of(from) })
    const second = makeTariffVersion({
      id: 'tariff-ci-100-v2',
      versionNumber: 2,
      validity: ValidityPeriod.of(from),
    })

    expect(() => selectTariffInForce([first, second], inForce)).toThrow(AmbiguousTariffError)
  })
})

describe('assertNoOverlappingPublishedTariffs', () => {
  it('acepta versiones publicadas sin solape', () => {
    const first = makeTariffVersion({ validity: ValidityPeriod.of(from, until) })
    const second = makeTariffVersion({
      id: 'tariff-ci-100-v2',
      versionNumber: 2,
      validity: ValidityPeriod.of(until),
    })

    expect(() => assertNoOverlappingPublishedTariffs([first, second])).not.toThrow()
  })

  it('ignora los borradores al comprobar solapes', () => {
    const published = makeTariffVersion({ validity: ValidityPeriod.of(from) })
    const draft = makeTariffVersion({
      id: 'tariff-v2',
      versionNumber: 2,
      status: 'draft',
      publishedAt: null,
      validity: ValidityPeriod.of(from),
    })

    expect(() => assertNoOverlappingPublishedTariffs([published, draft])).not.toThrow()
  })

  it('permite el mismo periodo en series distintas', () => {
    const first = makeTariffVersion({ validity: ValidityPeriod.of(from, until) })
    const other = makeTariffVersion({
      id: 'tariff-otra',
      seriesId: 'series-ci-200',
      validity: ValidityPeriod.of(from, until),
    })

    expect(() => assertNoOverlappingPublishedTariffs([first, other])).not.toThrow()
  })

  it('falla si dos versiones publicadas de la misma serie se solapan', () => {
    const first = makeTariffVersion({ validity: ValidityPeriod.of(from, until) })
    const second = makeTariffVersion({
      id: 'tariff-v2',
      versionNumber: 2,
      validity: ValidityPeriod.of(from),
    })

    expect(() => assertNoOverlappingPublishedTariffs([first, second])).toThrow(AmbiguousTariffError)
  })
})

describe('projectPublishedSet', () => {
  const predecessor = makeTariffVersion({ validity: ValidityPeriod.of(from) })

  function publishCandidate(
    versions: readonly TariffVersion[],
    validFrom: Date,
  ): { candidate: TariffVersion; projection: ReturnType<typeof projectPublishedSet> } {
    const candidate = makeTariffVersion({
      id: 'tariff-ci-100-v2',
      versionNumber: 2,
      status: 'draft',
      publishedAt: null,
      validity: ValidityPeriod.of(validFrom),
    }).publish(TEST_NOW)

    return { candidate, projection: projectPublishedSet(versions, candidate) }
  }

  it('cierra la predecesora abierta en el validFrom de la candidata (ni hueco ni solape)', () => {
    const handover = new Date('2026-06-01T00:00:00.000Z')
    const { candidate, projection } = publishCandidate([predecessor], handover)

    expect(projection.successor.id).toBe(candidate.id)
    expect(projection.predecessor?.id).toBe(predecessor.id)
    expect(projection.predecessor?.status).toBe('published')
    expect(projection.predecessor?.validity.validUntil).toEqual(handover)
    // Semiabierto: la predecesora deja de estar vigente justo cuando entra la sucesora.
    expect(projection.predecessor?.isInForceAt(handover)).toBe(false)
    expect(candidate.isInForceAt(handover)).toBe(true)
  })

  it('no cierra ninguna predecesora si la serie no tiene publicadas de vigencia abierta', () => {
    const closed = makeTariffVersion({
      validity: ValidityPeriod.of(new Date('2025-01-01T00:00:00.000Z'), from),
    })
    const { projection } = publishCandidate([closed], new Date('2026-06-01T00:00:00.000Z'))

    expect(projection.predecessor).toBeNull()
  })

  it('ignora las versiones publicadas de otras series y los borradores', () => {
    const otherSeries = makeTariffVersion({ id: 'tariff-ci-200-v1', seriesId: 'series-ci-200' })
    const draft = makeTariffVersion({ id: 'tariff-ci-100-v3', status: 'draft', publishedAt: null })
    const { projection } = publishCandidate(
      [otherSeries, draft],
      new Date('2026-06-01T00:00:00.000Z'),
    )

    expect(projection.predecessor).toBeNull()
  })

  it('falla si la candidata se solapa con una publicada de vigencia cerrada', () => {
    const closed = makeTariffVersion({
      validity: ValidityPeriod.of(from, new Date('2027-01-01T00:00:00.000Z')),
    })

    expect(() => publishCandidate([closed], new Date('2026-06-01T00:00:00.000Z'))).toThrow(
      AmbiguousTariffError,
    )
  })

  it('falla si la candidata entra en vigor antes o a la vez que la predecesora abierta', () => {
    expect(() => publishCandidate([predecessor], from)).toThrow(AmbiguousTariffError)
    expect(() => publishCandidate([predecessor], new Date('2025-12-01T00:00:00.000Z'))).toThrow(
      AmbiguousTariffError,
    )
  })

  it('falla si la serie tiene más de una publicada de vigencia abierta', () => {
    const second = makeTariffVersion({
      id: 'tariff-ci-100-v2-abierta',
      versionNumber: 2,
      validity: ValidityPeriod.of(new Date('2026-03-01T00:00:00.000Z')),
    })

    expect(() =>
      publishCandidate([predecessor, second], new Date('2026-09-01T00:00:00.000Z')),
    ).toThrow(AmbiguousTariffError)
  })

  it('exige que la candidata esté publicada', () => {
    const draft = makeTariffVersion({ id: 'tariff-ci-100-v2', status: 'draft', publishedAt: null })

    expect(() => projectPublishedSet([predecessor], draft)).toThrow(InvalidTariffVersionError)
  })
})
