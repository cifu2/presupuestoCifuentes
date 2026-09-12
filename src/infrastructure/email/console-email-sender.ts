/**
 * Adaptador de consola del puerto `EmailSender` (ADR-0004 §4).
 *
 * Es el adaptador por defecto mientras el propietario no confirme el dominio remitente (CIF-14) y
 * el que usan los tests: **nunca** habla con la red. Guarda lo enviado en memoria para poder
 * comprobarlo y en desarrollo deja una traza con el destinatario enmascarado.
 */

import type { EmailMessage, EmailSendResult, EmailSender } from '@/application/ports/email-sender'

/** Enmascara el destinatario: en los logs no viajan datos personales identificables. */
export function maskEmail(recipient: string): string {
  const [localPart = '', domain = ''] = recipient.split('@')

  if (domain.length === 0) {
    return '***'
  }

  return `${localPart.slice(0, 1)}***@${domain}`
}

export class ConsoleEmailSender implements EmailSender {
  private readonly outbox: EmailMessage[] = []
  private counter = 0

  constructor(private readonly log: (message: string) => void = defaultLog) {}

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.outbox.push(message)
    this.counter += 1
    this.log(
      `[email] consola: "${message.subject}" para ${maskEmail(message.to)} (${message.attachments.length} adjunto(s))`,
    )

    return { providerMessageId: `console-${this.counter}` }
  }

  /** Mensajes "enviados" por este adaptador; solo para desarrollo y tests. */
  sent(): readonly EmailMessage[] {
    return [...this.outbox]
  }
}

function defaultLog(message: string): void {
  if (process.env.NODE_ENV !== 'test') {
    console.info(message)
  }
}
