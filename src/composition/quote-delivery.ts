/**
 * Dependencias de los casos de uso de entrega del presupuesto.
 *
 * La raíz de composición es el único sitio donde se unen puertos y adaptadores (ADR-0001): aquí se
 * elige el renderizador de PDF, el remitente de email y los ajustes del documento, para que ni los
 * casos de uso ni los route handlers conozcan la tecnología.
 */

import type { ComposeQuoteDocumentDeps } from '@/application/use-cases/compose-quote-document'
import type { DeliverQuoteDeps } from '@/application/use-cases/deliver-quote'

import { createContainer, type Container } from './container'

export function quoteDocumentDependencies(
  container: Container = createContainer(),
): ComposeQuoteDocumentDeps {
  return {
    seriesRepository: container.seriesRepository,
    finishRepository: container.finishRepository,
    colorRepository: container.colorRepository,
    accessoryRepository: container.accessoryRepository,
  }
}

export function quoteDeliveryDependencies(
  container: Container = createContainer(),
): DeliverQuoteDeps {
  return {
    ...quoteDocumentDependencies(container),
    quoteRepository: container.quoteRepository,
    quoteDeliveryRepository: container.quoteDeliveryRepository,
    quotePdfRenderer: container.quotePdfRenderer,
    emailSender: container.emailSender,
    idGenerator: container.idGenerator,
    clock: container.clock,
    settings: container.quoteDocumentSettings,
  }
}
