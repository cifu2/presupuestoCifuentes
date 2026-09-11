/**
 * Adaptadores en memoria de presupuestos y solicitudes manuales.
 *
 * Pensados para tests y para el modo demostración: el presupuesto emitido se guarda tal cual, con
 * su tarifa y su desglose, exactamente igual que lo haría el adaptador Prisma.
 */

import type { ManualQuoteRequest } from '@/domain/catalog/manual-quote-request'
import type { Quote } from '@/domain/quote/quote'

import type { ManualQuoteRequestRepository } from '@/application/ports/manual-quote-request-repository'
import type { QuoteNumberSequence } from '@/application/ports/quote-number-sequence'
import type { QuoteRepository } from '@/application/ports/quote-repository'

export class InMemoryQuoteStore {
  readonly quotes: Quote[] = []
  readonly manualQuoteRequests: ManualQuoteRequest[] = []
  private readonly counters = new Map<number, number>()

  nextSequence(year: number): number {
    const next = (this.counters.get(year) ?? 0) + 1
    this.counters.set(year, next)

    return next
  }
}

export class InMemoryQuoteRepository implements QuoteRepository {
  constructor(private readonly store: InMemoryQuoteStore) {}

  async save(quote: Quote): Promise<void> {
    const existing = this.store.quotes.findIndex((candidate) => candidate.id === quote.id)

    if (existing >= 0) {
      this.store.quotes[existing] = quote

      return
    }

    this.store.quotes.push(quote)
  }

  async findById(id: string): Promise<Quote | null> {
    return this.store.quotes.find((quote) => quote.id === id) ?? null
  }

  async findByReference(reference: string): Promise<Quote | null> {
    return this.store.quotes.find((quote) => quote.reference === reference) ?? null
  }

  async listRecent(limit: number): Promise<readonly Quote[]> {
    return this.store.quotes
      .slice()
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit)
  }
}

export class InMemoryManualQuoteRequestRepository implements ManualQuoteRequestRepository {
  constructor(private readonly store: InMemoryQuoteStore) {}

  async save(request: ManualQuoteRequest): Promise<void> {
    this.store.manualQuoteRequests.push(request)
  }

  async findById(id: string): Promise<ManualQuoteRequest | null> {
    return this.store.manualQuoteRequests.find((request) => request.id === id) ?? null
  }
}

export class InMemoryQuoteNumberSequence implements QuoteNumberSequence {
  constructor(private readonly store: InMemoryQuoteStore) {}

  async next(year: number): Promise<number> {
    return this.store.nextSequence(year)
  }
}
