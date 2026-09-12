/**
 * Adaptador Prisma de las entregas de presupuesto (ADR-0004 §5-6).
 *
 * `claim` reserva el intento con un `UPDATE` condicional por la clave de idempotencia: si otro
 * intento tiene la reserva viva (o la entrega ya se envió) no toca ninguna fila y el caso de uso no
 * envía. `save` escribe siempre **por encima** de `PENDING`/`FAILED` pero nunca resucita una entrega
 * `SENT`, para que una escritura rezagada no provoque un reenvío. La clave única de la tabla sigue
 * siendo la última red contra el doble envío concurrente.
 */

import type { Prisma, PrismaClient } from '@prisma/client'

import type { QuoteDelivery } from '@/domain/quote/quote-delivery'

import {
  QUOTE_DELIVERY_CLAIM_LEASE_MS,
  type QuoteDeliveryRepository,
} from '@/application/ports/quote-delivery-repository'

import { quoteDeliveryAudienceToDb, quoteDeliveryStatusToDb, toQuoteDelivery } from './mappers'

/** La referencia pública vive en `quote`; se trae con la entrega para no hacer una lectura extra. */
const quoteReference = {
  quote: { select: { reference: true } },
} satisfies Prisma.QuoteDeliveryInclude

/** Campos que se escriben en cada transición de la entrega. */
function deliveryData(
  delivery: QuoteDelivery,
): Omit<Prisma.QuoteDeliveryUncheckedCreateInput, 'id' | 'idempotencyKey'> {
  return {
    quoteId: delivery.quoteId,
    version: delivery.version,
    audience: quoteDeliveryAudienceToDb(delivery.audience),
    recipient: delivery.recipient,
    customerName: delivery.customerName,
    status: quoteDeliveryStatusToDb(delivery.status),
    attempts: delivery.attempts,
    providerMessageId: delivery.providerMessageId,
    lastError: delivery.lastError,
    sentAt: delivery.sentAt,
    claimedAt: delivery.claimedAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  }
}

/**
 * Violación de la clave única de idempotencia. Prisma la expone como `P2002` y el adaptador de
 * PostgreSQL puede anidarla en `cause`/`meta`; se recorre el grafo igual que con la restricción de
 * solape de tarifas (CIF-89) para no depender de la forma exacta del error.
 */
const UNIQUE_VIOLATION_CODES = new Set(['P2002', '23505'])
const QUOTE_DELIVERY_KEY_CONSTRAINT = 'quote_delivery_idempotency_key_key'
const MAX_ERROR_DEPTH = 8

function isQuoteDeliveryKeyViolation(error: unknown): boolean {
  const visited = new Set<unknown>()

  const inspect = (value: unknown, depth: number): boolean => {
    if (depth > MAX_ERROR_DEPTH || typeof value !== 'object' || value === null) return false
    if (visited.has(value)) return false

    visited.add(value)

    const record = value as Record<string, unknown>

    for (const key of ['code', 'originalCode', 'sqlState']) {
      const code = record[key]

      if (typeof code === 'string' && UNIQUE_VIOLATION_CODES.has(code)) return true
    }

    if (record.constraint === QUOTE_DELIVERY_KEY_CONSTRAINT) return true

    const message = record.message

    if (typeof message === 'string' && message.includes(QUOTE_DELIVERY_KEY_CONSTRAINT)) return true

    return Object.values(record).some((child) => inspect(child, depth + 1))
  }

  return inspect(error, 0)
}

export class PrismaQuoteDeliveryRepository implements QuoteDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByKey(idempotencyKey: string): Promise<QuoteDelivery | null> {
    const row = await this.prisma.quoteDelivery.findUnique({
      where: { idempotencyKey },
      include: quoteReference,
    })

    return row === null ? null : toQuoteDelivery(row)
  }

  async claim(delivery: QuoteDelivery): Promise<QuoteDelivery | null> {
    const now = delivery.claimedAt ?? delivery.updatedAt
    const staleBefore = new Date(now.getTime() - QUOTE_DELIVERY_CLAIM_LEASE_MS)

    const claimed = await this.prisma.quoteDelivery.updateMany({
      where: {
        idempotencyKey: delivery.idempotencyKey,
        status: { not: 'SENT' },
        OR: [{ claimedAt: null }, { claimedAt: { lt: staleBefore } }],
      },
      data: deliveryData(delivery),
    })

    if (claimed.count > 0) return delivery

    const existing = await this.prisma.quoteDelivery.findUnique({
      where: { idempotencyKey: delivery.idempotencyKey },
      select: { id: true },
    })

    // Fila enviada o reservada por otro intento: este no envía.
    if (existing !== null) return null

    try {
      await this.createRow(delivery)

      return delivery
    } catch (error) {
      // Otra ejecución insertó la misma clave entre la lectura y el `create`.
      if (isQuoteDeliveryKeyViolation(error)) return null

      throw error
    }
  }

  async save(delivery: QuoteDelivery): Promise<void> {
    const data = deliveryData(delivery)

    if (delivery.isSent()) {
      await this.prisma.quoteDelivery.upsert({
        where: { idempotencyKey: delivery.idempotencyKey },
        create: { id: delivery.id, idempotencyKey: delivery.idempotencyKey, ...data },
        update: data,
      })

      return
    }

    // Una escritura rezagada de un intento antiguo no puede devolver a `pending` una entrega ya
    // enviada: el `WHERE` excluye `SENT` y, si la fila existe así, no se escribe nada.
    const updated = await this.prisma.quoteDelivery.updateMany({
      where: { idempotencyKey: delivery.idempotencyKey, status: { not: 'SENT' } },
      data,
    })

    if (updated.count > 0) return

    const existing = await this.prisma.quoteDelivery.findUnique({
      where: { idempotencyKey: delivery.idempotencyKey },
      select: { id: true },
    })

    if (existing !== null) return

    try {
      await this.createRow(delivery)
    } catch (error) {
      if (!isQuoteDeliveryKeyViolation(error)) throw error
    }
  }

  async listByQuoteId(quoteId: string): Promise<readonly QuoteDelivery[]> {
    const rows = await this.prisma.quoteDelivery.findMany({
      where: { quoteId },
      include: quoteReference,
      orderBy: [{ version: 'asc' }, { createdAt: 'asc' }],
    })

    return rows.map(toQuoteDelivery)
  }

  private async createRow(delivery: QuoteDelivery): Promise<void> {
    await this.prisma.quoteDelivery.create({
      data: {
        id: delivery.id,
        idempotencyKey: delivery.idempotencyKey,
        ...deliveryData(delivery),
      },
    })
  }
}
