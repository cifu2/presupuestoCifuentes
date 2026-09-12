/**
 * Test del orden a prueba de fallos y de la idempotencia de la entrega (ADR-0004 §5-6).
 *
 * Los puertos se sustituyen por dobles de frontera instrumentados: se comprueba **en qué orden** se
 * llama a cada uno, que un fallo de PDF o de email no pierde el presupuesto y que reintentar no
 * duplica correos.
 */

import { describe, expect, it } from 'vitest'

import {
  makeAccessory,
  makeColor,
  makeFinish,
  makeSeries,
} from '@/domain/catalog/testing/factories'
import { makeBreakdown, makeConfiguration } from '@/domain/pricing/testing/factories'
import { Quote } from '@/domain/quote/quote'
import {
  MAX_QUOTE_DELIVERY_ATTEMPTS,
  QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED_REASON,
  QuoteDelivery,
  quoteDeliveryKey,
  type QuoteDeliveryAudience,
} from '@/domain/quote/quote-delivery'
import type { QuoteDocument } from '@/domain/quote/quote-document'
import { ResourceNotFoundError, InvalidQuoteDeliveryError } from '@/domain/shared/errors'

import type { EmailMessage, EmailSender } from '@/application/ports/email-sender'
import type { QuoteDeliveryRepository } from '@/application/ports/quote-delivery-repository'
import type { QuoteDocumentSettings } from '@/application/ports/quote-document-settings'
import type { QuotePdfRenderer } from '@/application/ports/quote-pdf-renderer'
import type { QuoteRepository } from '@/application/ports/quote-repository'
import type { SeriesRepository } from '@/application/ports/series-repository'
import type {
  FinishRepository,
  ColorRepository,
  AccessoryRepository,
} from '@/application/ports/catalog-item-repositories'
import {
  deliverQuote,
  retryQuoteDeliveries,
  type DeliverQuoteDeps,
} from '@/application/use-cases/deliver-quote'
import { InMemoryQuoteDeliveryRepository } from '@/infrastructure/persistence/in-memory/quote-delivery-store'

const NOW = new Date('2026-09-12T09:00:00.000Z')
const CUSTOMER = { name: 'Ana', email: 'ana@example.com' }
const SALES_MAILBOX = 'comercial@example.com'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

function makeQuote(locale: 'es' | 'en' = 'es'): Quote {
  return Quote.issue({
    id: 'quote-1',
    reference: 'PC-2026-000001',
    configuration: makeConfiguration({ finishId: 'finish-lacado' }),
    tariffVersionId: 'tariff-ci-100-v1',
    locale,
    breakdown: makeBreakdown(),
    validUntil: new Date('2026-10-12T09:00:00.000Z'),
    createdAt: NOW,
  })
}

function makeSettings(
  internalRecipients: readonly string[] = [SALES_MAILBOX],
): QuoteDocumentSettings {
  return {
    issuer: {
      name: 'Puertas Cifuentes S.L.',
      taxId: 'B12345678',
      address: 'Calle Mayor 1',
      email: 'presupuestos@example.com',
      phone: '+34 900 000 000',
      website: 'https://example.com',
      isPending: false,
    },
    conditions: { es: ['Validez 30 días'], en: ['Valid for 30 days'] },
    internalRecipients,
    pendingFields: [],
  }
}

interface HarnessOptions {
  readonly quote?: Quote
  readonly internalRecipients?: readonly string[]
  readonly failPdf?: boolean
  readonly failEmailsTo?: readonly string[]
}

function makeHarness(options: HarnessOptions = {}) {
  const quote = options.quote ?? makeQuote()
  const events: string[] = []
  const sent: EmailMessage[] = []
  const sendCalls: string[] = []
  const store = new InMemoryQuoteDeliveryRepository()
  /** Documentos que ha recibido el renderizador; permite comprobar qué se imprime. */
  const documents: QuoteDocument[] = []
  /** Fallos de proveedor programados por el test; mutable para simular la recuperación. */
  const failEmails = new Set(options.failEmailsTo ?? [])
  let renderCount = 0
  let idCounter = 0

  const deliveries: QuoteDeliveryRepository = {
    findByKey: async (key) => {
      events.push('delivery.findByKey')

      return store.findByKey(key)
    },
    save: async (delivery) => {
      events.push(`delivery.save:${delivery.status}`)

      return store.save(delivery)
    },
    claim: async (delivery) => {
      events.push(`delivery.claim:${delivery.status}`)

      return store.claim(delivery)
    },
    listByQuoteId: async (quoteId) => {
      events.push('delivery.listByQuoteId')

      return store.listByQuoteId(quoteId)
    },
  }

  const quoteRepository: QuoteRepository = {
    save: async () => {},
    findById: async (id) => (id === quote.id ? quote : null),
    findByReference: async (reference) => {
      events.push('quote.findByReference')

      return reference === quote.reference ? quote : null
    },
    listRecent: async () => [quote],
  }

  const seriesRepository: SeriesRepository = {
    findPublishedBySlug: async () => null,
    findById: async (id) => makeSeries({ id }),
    listPublished: async () => [],
  }
  const finishRepository: FinishRepository = {
    findById: async (id) => makeFinish({ id }),
    listPublished: async () => [],
    listPublishedByIds: async () => [],
  }
  const colorRepository: ColorRepository = {
    findById: async (id) => makeColor({ id }),
    listPublishedByFinishId: async () => [],
  }
  const accessoryRepository: AccessoryRepository = {
    findById: async (id) => makeAccessory({ id }),
    listPublished: async () => [],
    listPublishedByIds: async () => [],
  }

  const quotePdfRenderer: QuotePdfRenderer = {
    render: async (document) => {
      events.push('pdf.render')
      documents.push(document)
      renderCount += 1

      if (options.failPdf === true) {
        throw new Error('plantilla rota')
      }

      return PDF_BYTES
    },
  }

  const emailSender: EmailSender = {
    send: async (message) => {
      events.push(`email.send:${message.to}`)
      sendCalls.push(message.to)

      if (failEmails.has(message.to)) {
        throw new Error('proveedor caído')
      }

      sent.push(message)

      return { providerMessageId: `msg-${sent.length}` }
    },
  }

  const deps: DeliverQuoteDeps = {
    quoteRepository,
    seriesRepository,
    finishRepository,
    colorRepository,
    accessoryRepository,
    quoteDeliveryRepository: deliveries,
    quotePdfRenderer,
    emailSender,
    idGenerator: { nextId: () => `delivery-${(idCounter += 1)}` },
    clock: { now: () => NOW },
    settings: makeSettings(options.internalRecipients ?? [SALES_MAILBOX]),
  }

  return {
    deps,
    events,
    sent,
    sendCalls,
    store,
    quote,
    failEmails,
    documents,
    renders: () => renderCount,
  }
}

describe('deliverQuote', () => {
  it('persiste la entrega pendiente antes de renderizar el PDF y de enviar el email', async () => {
    const harness = makeHarness()

    const result = await deliverQuote(harness.deps, {
      reference: 'PC-2026-000001',
      customer: CUSTOMER,
    })

    expect(result.status).toBe('delivered')
    expect(result.pdfBytes).toBe(PDF_BYTES.byteLength)
    expect(harness.renders()).toBe(1)
    expect(harness.sendCalls).toEqual(['ana@example.com', 'comercial@example.com'])
    expect(result.deliveries.map((delivery) => delivery.status)).toEqual(['sent', 'sent'])

    const order = harness.events

    expect(order.indexOf('quote.findByReference')).toBeLessThan(
      order.indexOf('delivery.claim:pending'),
    )
    expect(order.indexOf('delivery.claim:pending')).toBeLessThan(order.indexOf('pdf.render'))
    expect(order.indexOf('pdf.render')).toBeLessThan(order.indexOf('email.send:ana@example.com'))
  })

  it('adjunta el PDF con el nombre del idioma del presupuesto', async () => {
    const harness = makeHarness({ quote: makeQuote('en'), internalRecipients: [] })

    await deliverQuote(harness.deps, { reference: 'PC-2026-000001', customer: CUSTOMER })

    expect(harness.sent).toHaveLength(1)
    expect(harness.sent[0]?.attachments[0]?.filename).toBe('quote-PC-2026-000001.pdf')
    expect(harness.sent[0]?.attachments[0]?.contentType).toBe('application/pdf')
    expect(harness.sent[0]?.attachments[0]?.content).toEqual(PDF_BYTES)
    expect(harness.sent[0]?.subject).toBe('Your Puertas Cifuentes quote (PC-2026-000001)')
  })

  it('avisa al buzón interno en el idioma del presupuesto', async () => {
    const harness = makeHarness({ quote: makeQuote('en') })

    await deliverQuote(harness.deps, { reference: 'PC-2026-000001', customer: null })

    expect(harness.sendCalls).toEqual([SALES_MAILBOX])
    expect(harness.sent[0]?.subject).toBe('New quote issued (PC-2026-000001)')
  })

  it('no vuelve a enviar al mismo destinatario: la segunda entrega queda ya enviada', async () => {
    const harness = makeHarness()
    const input = { reference: 'PC-2026-000001', customer: CUSTOMER }

    await deliverQuote(harness.deps, input)
    const second = await deliverQuote(harness.deps, input)

    expect(second.status).toBe('already_delivered')
    expect(second.pdfBytes).toBe(0)
    expect(harness.renders()).toBe(1)
    expect(harness.sendCalls).toHaveLength(2)
    expect(harness.store.size()).toBe(2)
  })

  it('trata cada versión del documento como una entrega distinta', async () => {
    const harness = makeHarness({ internalRecipients: [] })

    await deliverQuote(harness.deps, {
      reference: 'PC-2026-000001',
      customer: CUSTOMER,
      version: 1,
    })
    await deliverQuote(harness.deps, {
      reference: 'PC-2026-000001',
      customer: CUSTOMER,
      version: 2,
    })

    expect(harness.sendCalls).toHaveLength(2)
    expect(harness.store.size()).toBe(2)
  })

  it('si falla el PDF, el presupuesto sigue emitido y la entrega queda pendiente de envío', async () => {
    const harness = makeHarness({ failPdf: true })

    const result = await deliverQuote(harness.deps, {
      reference: 'PC-2026-000001',
      customer: CUSTOMER,
    })

    expect(result.status).toBe('incomplete')
    expect(result.reason).toBe('pdf_render_failed')
    expect(result.pdfBytes).toBe(0)
    expect(result.deliveries.map((delivery) => delivery.status)).toEqual(['failed', 'failed'])
    expect(result.deliveries[0]?.attempts).toBe(1)
    expect(result.deliveries[0]?.lastError).toContain('pdf: plantilla rota')
    expect(harness.sendCalls).toEqual([])
    expect(await harness.deps.quoteRepository.findByReference('PC-2026-000001')).not.toBeNull()
  })

  it('reintenta las entregas fallidas por el PDF sin duplicar correos', async () => {
    const failing = makeHarness({ failPdf: true })

    await deliverQuote(failing.deps, { reference: 'PC-2026-000001', customer: CUSTOMER })

    const working = { ...failing.deps, quotePdfRenderer: { render: async () => PDF_BYTES } }
    const retried = await retryQuoteDeliveries(working, { reference: 'PC-2026-000001' })

    expect(retried.status).toBe('delivered')
    expect(retried.deliveries.map((delivery) => delivery.status)).toEqual(['sent', 'sent'])
    expect(retried.deliveries.map((delivery) => delivery.attempts)).toEqual([2, 2])
    expect(failing.sendCalls).toEqual(['ana@example.com', 'comercial@example.com'])
  })

  it('si falla el email de un destinatario, envía el resto y deja el fallo registrado', async () => {
    const harness = makeHarness({ failEmailsTo: [SALES_MAILBOX] })

    const result = await deliverQuote(harness.deps, {
      reference: 'PC-2026-000001',
      customer: CUSTOMER,
    })

    expect(result.status).toBe('incomplete')
    expect(result.reason).toBe('email_send_failed')
    expect(result.deliveries.map((delivery) => delivery.status)).toEqual(['sent', 'failed'])
    expect(result.deliveries[1]?.lastError).toContain('email: proveedor caído')
  })

  it('el reintento solo reenvía lo que falló y no repite el correo ya entregado', async () => {
    const harness = makeHarness({ failEmailsTo: [SALES_MAILBOX] })

    await deliverQuote(harness.deps, { reference: 'PC-2026-000001', customer: CUSTOMER })

    // El proveedor se recupera: el reintento debe salir bien y no repetir el correo ya entregado.
    harness.failEmails.clear()
    const retried = await retryQuoteDeliveries(harness.deps, { reference: 'PC-2026-000001' })

    expect(retried.status).toBe('delivered')
    expect(harness.sendCalls).toEqual(['ana@example.com', SALES_MAILBOX, SALES_MAILBOX])
    expect(harness.sent).toHaveLength(2)
  })

  it('el reintento sin entregas pendientes no renderiza ni envía nada', async () => {
    const harness = makeHarness()

    await deliverQuote(harness.deps, { reference: 'PC-2026-000001', customer: CUSTOMER })
    const retried = await retryQuoteDeliveries(harness.deps, { reference: 'PC-2026-000001' })

    expect(retried.status).toBe('nothing_to_retry')
    expect(harness.renders()).toBe(1)
    expect(harness.sendCalls).toHaveLength(2)
  })

  it('exige al menos un destinatario entre cliente y buzón interno', async () => {
    const harness = makeHarness({ internalRecipients: [] })

    await expect(
      deliverQuote(harness.deps, { reference: 'PC-2026-000001', customer: null }),
    ).rejects.toBeInstanceOf(InvalidQuoteDeliveryError)
  })

  it('rechaza un presupuesto que no existe', async () => {
    const harness = makeHarness()

    await expect(
      deliverQuote(harness.deps, { reference: 'PC-2026-999999', customer: CUSTOMER }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError)
  })

  it('dos entregas simultáneas del mismo presupuesto envían un solo correo (F1 de CIF-175)', async () => {
    const harness = makeHarness()
    const input = { reference: 'PC-2026-000001', customer: CUSTOMER }

    const results = await Promise.all([
      deliverQuote(harness.deps, input),
      deliverQuote(harness.deps, input),
    ])

    const statuses = results.map((result) => result.status).sort()

    expect(statuses).toEqual(['delivered', 'in_progress'])
    // Un envío por destinatario, no dos: la clave única evita filas duplicadas, el reclamo atómico
    // evita correos duplicados.
    expect(harness.sendCalls).toEqual([CUSTOMER.email, SALES_MAILBOX])
    expect(harness.store.size()).toBe(2)
    // La petición que pierde el reclamo no renderiza el PDF.
    expect(harness.renders()).toBe(1)
  })

  it('la petición que pierde el reclamo informa del estado real de la entrega', async () => {
    const harness = makeHarness()
    const input = { reference: 'PC-2026-000001', customer: CUSTOMER }

    const results = await Promise.all([
      deliverQuote(harness.deps, input),
      deliverQuote(harness.deps, input),
    ])

    const waiting = results.find((result) => result.status === 'in_progress')

    expect(waiting?.reason).toBe('none')
    expect(waiting?.pdfBytes).toBe(0)
    // La entrega está en curso o ya salió, pero nunca se informa de un envío que no ha hecho.
    expect(
      waiting?.deliveries.every(
        (delivery) => delivery.status === 'pending' || delivery.status === 'sent',
      ),
    ).toBe(true)
  })

  it('conserva los datos del cliente en el PDF del reintento (F3 de CIF-175)', async () => {
    const harness = makeHarness({ failEmailsTo: [SALES_MAILBOX] })

    await deliverQuote(harness.deps, { reference: 'PC-2026-000001', customer: CUSTOMER })

    // El correo al cliente ya salió; solo falló el aviso interno.
    harness.failEmails.clear()
    const retried = await retryQuoteDeliveries(harness.deps, { reference: 'PC-2026-000001' })

    expect(retried.status).toBe('delivered')
    expect(harness.documents.at(-1)?.customer).toEqual({
      name: CUSTOMER.name,
      email: CUSTOMER.email,
    })
  })

  it('no repite el email al cliente cuando su dirección coincide con el buzón interno', async () => {
    const harness = makeHarness({ internalRecipients: [CUSTOMER.email.toUpperCase()] })

    await deliverQuote(harness.deps, { reference: 'PC-2026-000001', customer: CUSTOMER })

    expect(harness.sendCalls).toEqual([CUSTOMER.email])
    expect(harness.store.size()).toBe(1)
  })
})

/**
 * Semilla de una entrega ya persistida con los intentos gastados: es el estado al que se llega tras
 * 100 fallos seguidos (CIF-186).
 */
function seedAttempts(
  harness: { readonly quote: Quote },
  attempts: number,
  options: {
    readonly audience?: QuoteDeliveryAudience
    readonly recipient?: string
    readonly lastError?: string
  } = {},
): QuoteDelivery {
  const audience = options.audience ?? 'customer'
  const recipient = options.recipient ?? CUSTOMER.email

  return QuoteDelivery.create({
    id: `delivery-${audience}-seed`,
    quoteId: harness.quote.id,
    quoteReference: harness.quote.reference,
    version: 1,
    audience,
    recipient,
    customerName: audience === 'customer' ? CUSTOMER.name : null,
    status: 'failed',
    attempts,
    providerMessageId: null,
    lastError: options.lastError ?? 'email: proveedor caído',
    createdAt: NOW,
    updatedAt: NOW,
    sentAt: null,
    claimedAt: null,
  })
}

describe('tope de intentos de entrega (CIF-186)', () => {
  it('reintentar una entrega agotada responde con el estado terminal y su motivo, sin enviar nada', async () => {
    const harness = makeHarness({ internalRecipients: [] })

    await harness.store.save(seedAttempts(harness, MAX_QUOTE_DELIVERY_ATTEMPTS))

    const retried = await retryQuoteDeliveries(harness.deps, { reference: 'PC-2026-000001' })

    expect(retried.status).toBe('attempts_exhausted')
    expect(retried.reason).toBe('attempts_exhausted')
    expect(retried.pdfBytes).toBe(0)
    expect(harness.renders()).toBe(0)
    expect(harness.sendCalls).toEqual([])
    expect(retried.deliveries[0]?.attempts).toBe(MAX_QUOTE_DELIVERY_ATTEMPTS)
    expect(retried.deliveries[0]?.lastError).toBe(QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED_REASON)

    // El motivo queda persistido: el panel lo lee de la fila, no solo de esta respuesta.
    const stored = await harness.deps.quoteDeliveryRepository.findByKey(
      quoteDeliveryKey(harness.quote.id, 1, CUSTOMER.email),
    )

    expect(stored?.lastError).toBe(QUOTE_DELIVERY_ATTEMPTS_EXHAUSTED_REASON)
    expect(stored?.status).toBe('failed')
  })

  it('la entrega por email de un presupuesto agotado tampoco lanza: informa del estado terminal', async () => {
    const harness = makeHarness({ internalRecipients: [] })

    await harness.store.save(seedAttempts(harness, MAX_QUOTE_DELIVERY_ATTEMPTS))

    const result = await deliverQuote(harness.deps, {
      reference: 'PC-2026-000001',
      customer: CUSTOMER,
    })

    expect(result.status).toBe('attempts_exhausted')
    expect(result.reason).toBe('attempts_exhausted')
    expect(harness.renders()).toBe(0)
    expect(harness.sendCalls).toEqual([])
  })

  it('permite el último intento disponible y lo registra como enviado', async () => {
    const harness = makeHarness({ internalRecipients: [] })

    await harness.store.save(seedAttempts(harness, MAX_QUOTE_DELIVERY_ATTEMPTS - 1))

    const retried = await retryQuoteDeliveries(harness.deps, { reference: 'PC-2026-000001' })

    expect(retried.status).toBe('delivered')
    expect(retried.deliveries[0]?.attempts).toBe(MAX_QUOTE_DELIVERY_ATTEMPTS)
    expect(retried.deliveries[0]?.status).toBe('sent')
    expect(harness.sendCalls).toEqual([CUSTOMER.email])
  })

  it('reintenta al destinatario que no agotó sus intentos y cierra el que sí', async () => {
    const harness = makeHarness({ failEmailsTo: [SALES_MAILBOX] })

    // El cliente agotó sus intentos; el aviso interno conserva intentos disponibles.
    await harness.store.save(seedAttempts(harness, MAX_QUOTE_DELIVERY_ATTEMPTS))
    await harness.store.save(
      seedAttempts(harness, 1, { audience: 'internal', recipient: SALES_MAILBOX }),
    )

    harness.failEmails.clear()
    const retried = await retryQuoteDeliveries(harness.deps, { reference: 'PC-2026-000001' })

    expect(retried.status).toBe('attempts_exhausted')
    expect(harness.sendCalls).toEqual([SALES_MAILBOX])
    expect(retried.deliveries.map((delivery) => delivery.status)).toEqual(['failed', 'sent'])
  })
})
