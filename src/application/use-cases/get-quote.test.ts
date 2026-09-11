import { describe, expect, it } from 'vitest'

import { ResourceNotFoundError } from '@/domain/shared/errors'

import { makePriceInput, makeTestWorld } from '@/application/testing/fixtures'
import { getQuote } from './get-quote'
import { issueQuote } from './issue-quote'

describe('getQuote', () => {
  it('devuelve el presupuesto emitido por su referencia', async () => {
    const world = makeTestWorld()

    await issueQuote(
      {
        seriesRepository: world.seriesRepository,
        tariffPricingRepository: world.tariffPricingRepository,
        colorRepository: world.colorRepository,
        quoteRepository: world.quoteRepository,
        quoteNumberSequence: world.quoteNumberSequence,
        idGenerator: world.idGenerator,
        clock: world.clock,
      },
      { slug: 'ci-100', ...makePriceInput(), locale: 'en' },
    )

    const quote = await getQuote(
      { quoteRepository: world.quoteRepository },
      { reference: 'PC-2026-000001', locale: 'en' },
    )

    expect(quote.reference).toBe('PC-2026-000001')
    expect(quote.locale).toBe('en')
    expect(quote.totals.total.amount).toBe('914.76')
  })

  it('lanza NOT_FOUND si la referencia no existe', async () => {
    const world = makeTestWorld()

    await expect(
      getQuote(
        { quoteRepository: world.quoteRepository },
        { reference: 'PC-2026-000404', locale: 'es' },
      ),
    ).rejects.toThrow(ResourceNotFoundError)
  })
})
