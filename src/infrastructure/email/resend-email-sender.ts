/**
 * Adaptador de Resend del puerto `EmailSender` (ADR-0004 §4).
 *
 * Solo se construye cuando el entorno tiene remitente verificado (`RESEND_FROM`) y clave
 * (`RESEND_API_KEY`); sin ellos la raíz de composición usa el adaptador de consola, de modo que un
 * despliegue sin las respuestas del propietario (CIF-14) no intenta enviar correo real.
 *
 * Al proveedor solo viajan el destinatario, el asunto, el cuerpo y el PDF: nada más del cliente.
 */

import { Resend } from 'resend'

import type { EmailMessage, EmailSendResult, EmailSender } from '@/application/ports/email-sender'

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey)
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      attachments: message.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.content),
        contentType: attachment.contentType,
      })),
    })

    if (error !== null || data === null) {
      throw new Error(`Resend rechazó el envío: ${error?.message ?? 'sin identificador'}`)
    }

    return { providerMessageId: data.id }
  }
}
