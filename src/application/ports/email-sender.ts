/**
 * Puerto de envío de email (ADR-0004 §2 y §4).
 *
 * Al proveedor solo viajan los datos imprescindibles del envío: destinatario, asunto, cuerpo y el
 * PDF adjunto. El adaptador concreto (Resend, consola) se elige en la raíz de composición; los tests
 * usan un doble de frontera y nunca envían correo real.
 */

export interface EmailAttachment {
  readonly filename: string
  readonly contentType: string
  readonly content: Uint8Array
}

export interface EmailMessage {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly attachments: readonly EmailAttachment[]
}

export interface EmailSendResult {
  /** Identificador del proveedor; permite correlacionar un envío con su acuse. */
  readonly providerMessageId: string
}

export interface EmailSender {
  /** Envía el mensaje; lanza si el proveedor lo rechaza (el caso de uso lo registra y reintenta). */
  send(message: EmailMessage): Promise<EmailSendResult>
}
