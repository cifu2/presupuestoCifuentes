import { describe, expect, it } from 'vitest'

import { makePriceInput, makeTestWorld } from '@/application/testing/fixtures'
import { issueQuote } from './issue-quote'

function deps(world: ReturnType<typeof makeTestWorld>) {
  return {
    seriesRepository: world.seriesRepository,
    tariffPricingRepository: world.tariffPricingRepository,
    colorRepository: world.colorRepository,
    quoteRepository: world.quoteRepository,
    quoteNumberSequence: world.quoteNumberSequence,
    idGenerator: world.idGenerator,
    clock: world.clock,
    validityDays: 30,
  }
}

describe('issueQuote', () => {
  it('emite un presupuesto con referencia correlativa y precio congelado', async () => {
    const world = makeTestWorld()

    const result = await issueQuote(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      locale: 'es',
    })

    expect(result.status).toBe('issued')

    if (result.status !== 'issued') return

    expect(result.quote.reference).toBe('PC-2026-000001')
    expect(result.quote.status).toBe('issued')
    expect(result.quote.tariffVersionId).toBe('tariff-ci-100-v1')
    expect(result.quote.totals.total.amount).toBe('914.76')
    expect(result.quote.validUntil).toBe('2026-10-11T10:00:00.000Z')

    const stored = await world.quoteRepository.findByReference('PC-2026-000001')

    expect(stored?.totalCents).toBe(91_476n)
    expect(stored?.lines).toHaveLength(1)
  })

  it('incrementa la secuencia en cada emisión', async () => {
    const world = makeTestWorld()

    await issueQuote(deps(world), { slug: 'ci-100', ...makePriceInput(), locale: 'es' })
    const second = await issueQuote(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      locale: 'es',
    })

    expect(second.status).toBe('issued')

    if (second.status !== 'issued') return

    expect(second.quote.reference).toBe('PC-2026-000002')
  })

  it('no emite presupuesto y devuelve el motivo si hay que pasar a manual', async () => {
    const world = makeTestWorld()

    const result = await issueQuote(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      heightMm: 3000,
      locale: 'es',
    })

    expect(result).toMatchObject({
      status: 'manual_quote_required',
      reason: 'size_exceeds_series_max',
    })
    expect(await world.quoteRepository.listRecent(10)).toHaveLength(0)
  })

  it('mantiene intacto el presupuesto emitido aunque después cambie la tarifa', async () => {
    const world = makeTestWorld()

    const result = await issueQuote(deps(world), {
      slug: 'ci-100',
      ...makePriceInput(),
      locale: 'es',
    })

    expect(result.status).toBe('issued')

    if (result.status !== 'issued') return

    const reference = result.quote.reference
    const stored = await world.quoteRepository.findByReference(reference)

    expect(stored?.breakdown.total.toString()).toBe('914.76')
    expect(stored?.tariffVersionId).toBe('tariff-ci-100-v1')
    // El desglose congelado no depende de la tabla de precios viva.
    expect(stored?.breakdown.lines[0]?.code).toBe('base')
  })
})
