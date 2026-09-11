/**
 * Solicitud de presupuesto manual.
 *
 * Cuando el configurador no puede dar precio (la medida supera el tamaño máximo de la serie, no
 * hay tarifa vigente o la combinación no está cubierta) el cliente deja sus datos y el comercial
 * recibe el aviso. La solicitud conserva el motivo y la configuración pedida.
 */

import { assertNonEmptyString, assertValidDate } from '@/domain/shared/assertions'
import {
  InvalidManualQuoteRequestError,
  InvalidManualQuoteTransitionError,
} from '@/domain/shared/errors'

import type { Locale } from './locale'
import type { Dimensions } from './measurement'

import { MANUAL_QUOTE_REASONS, type ManualQuoteReason } from './manual-quote-reason'

export { MANUAL_QUOTE_REASONS }
export type { ManualQuoteReason }

export const MANUAL_QUOTE_STATUSES = ['pending', 'contacted', 'closed'] as const

export type ManualQuoteStatus = (typeof MANUAL_QUOTE_STATUSES)[number]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,19}$/

export interface ManualQuoteContact {
  readonly name: string
  readonly email: string
  readonly phone: string | null
  readonly message: string | null
  readonly locale: Locale
}

export interface ManualQuoteRequestProps {
  readonly id: string
  readonly reason: ManualQuoteReason
  readonly status: ManualQuoteStatus
  readonly seriesId: string | null
  readonly dimensions: Dimensions | null
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly contact: ManualQuoteContact
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly handledAt: Date | null
}

export class ManualQuoteRequest {
  readonly id: string
  readonly reason: ManualQuoteReason
  readonly status: ManualQuoteStatus
  readonly seriesId: string | null
  readonly dimensions: Dimensions | null
  readonly finishId: string | null
  readonly colorId: string | null
  readonly accessoryIds: readonly string[]
  readonly contact: ManualQuoteContact
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly handledAt: Date | null

  private constructor(props: ManualQuoteRequestProps) {
    this.id = props.id
    this.reason = props.reason
    this.status = props.status
    this.seriesId = props.seriesId
    this.dimensions = props.dimensions
    this.finishId = props.finishId
    this.colorId = props.colorId
    this.accessoryIds = props.accessoryIds
    this.contact = props.contact
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
    this.handledAt = props.handledAt
  }

  static create(props: ManualQuoteRequestProps): ManualQuoteRequest {
    assertNonEmptyString(props.id, 'id')
    assertValidDate(props.createdAt, 'createdAt')
    assertValidDate(props.updatedAt, 'updatedAt')

    if (props.handledAt !== null) {
      assertValidDate(props.handledAt, 'handledAt')
    }

    if (props.seriesId !== null) {
      assertNonEmptyString(props.seriesId, 'seriesId')
    }

    if (props.reason === 'size_exceeds_series_max') {
      if (props.seriesId === null) {
        throw new InvalidManualQuoteRequestError(
          'Una solicitud por tamaño máximo necesita la serie a la que se refiere',
        )
      }

      if (props.dimensions === null) {
        throw new InvalidManualQuoteRequestError(
          'Una solicitud por tamaño máximo necesita las medidas pedidas',
        )
      }
    }

    assertValidContact(props.contact)

    for (const accessoryId of props.accessoryIds) {
      assertNonEmptyString(accessoryId, 'accessoryIds')
    }

    return new ManualQuoteRequest({ ...props, accessoryIds: [...props.accessoryIds] })
  }

  isOpen(): boolean {
    return this.status !== 'closed'
  }

  markContacted(at: Date): ManualQuoteRequest {
    if (this.status !== 'pending') {
      throw new InvalidManualQuoteTransitionError(
        `Solo una solicitud pendiente puede marcarse como contactada; estado actual "${this.status}"`,
      )
    }

    assertValidDate(at, 'updatedAt')

    return new ManualQuoteRequest({ ...this, status: 'contacted', updatedAt: at })
  }

  close(at: Date): ManualQuoteRequest {
    if (this.status === 'closed') {
      throw new InvalidManualQuoteTransitionError('La solicitud ya está cerrada')
    }

    assertValidDate(at, 'updatedAt')

    return new ManualQuoteRequest({ ...this, status: 'closed', updatedAt: at, handledAt: at })
  }
}

function assertValidContact(contact: ManualQuoteContact): void {
  if (contact.name.trim().length < 2) {
    throw new InvalidManualQuoteRequestError('contact.name debe tener al menos 2 caracteres')
  }

  if (!EMAIL_PATTERN.test(contact.email.trim())) {
    throw new InvalidManualQuoteRequestError('contact.email no es un correo electrónico válido')
  }

  if (contact.phone !== null && !PHONE_PATTERN.test(contact.phone.trim())) {
    throw new InvalidManualQuoteRequestError('contact.phone no es un teléfono válido')
  }

  if (contact.message !== null) {
    assertNonEmptyString(contact.message, 'contact.message')
  }
}
