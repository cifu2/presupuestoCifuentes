/**
 * Adaptador Prisma de las entregas de presupuesto (ADR-0004 §5-6).
 *
 * `save` hace UPSERT por la clave de idempotencia: reintentar la misma entrega actualiza su estado
 * en lugar de insertar otra fila, y la clave única de la tabla cierra la ventana de carrera entre
 * dos intentos simultáneos del mismo envío.
 */

import type { Prisma, PrismaClient } from '@prisma/client'

import type { QuoteDelivery } from '@/domain/quote/quote-delivery'

import type { QuoteDeliveryRepository } from '@/application/ports/quote-delivery-repository'

import { quoteDeliveryAudienceToDb, quoteDeliveryStatusToDb, toQuoteDelivery } from './mappers'

/** La referencia pública vive en `quote`; se trae con la entrega para no hacer una lectura extra. */
const quoteReference = {
  quote: { select: { reference: true } },
} satisfies Prisma.QuoteDeliveryInclude

export class PrismaQuoteDeliveryRepository implements QuoteDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByKey(idempotencyKey: string): Promise<QuoteDelivery | null> {
    const row = await this.prisma.quoteDelivery.findUnique({
      where: { idempotencyKey },
      include: quoteReference,
    })

    return row === null ? null : toQuoteDelivery(row)
  }

  async save(delivery: QuoteDelivery): Promise<void> {
    const data: Omit<Prisma.QuoteDeliveryUncheckedCreateInput, 'id' | 'idempotencyKey'> = {
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
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
    }

    await this.prisma.quoteDelivery.upsert({
      where: { idempotencyKey: delivery.idempotencyKey },
      create: { id: delivery.id, idempotencyKey: delivery.idempotencyKey, ...data },
      update: data,
    })
  }

  async listByQuoteId(quoteId: string): Promise<readonly QuoteDelivery[]> {
    const rows = await this.prisma.quoteDelivery.findMany({
      where: { quoteId },
      include: quoteReference,
      orderBy: { createdAt: 'asc' },
    })

    return rows.map(toQuoteDelivery)
  }
}
