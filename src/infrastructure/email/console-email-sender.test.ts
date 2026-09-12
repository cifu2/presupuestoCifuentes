/**
 * Test del adaptador de consola del email (ADR-0004 §4).
 *
 * Los tests y el desarrollo no envían correo real: el adaptador guarda lo enviado en memoria y
 * nunca viaja a la red. Además, la traza enmascara el destinatario: nada de datos personales en los
 * logs.
 */

import { describe, expect, it } from 'vitest'

import { ConsoleEmailSender, maskEmail } from './console-email-sender'

describe('maskEmail', () => {
  it('deja solo la primera letra del buzón y el dominio', () => {
    expect(maskEmail('ana.perez@example.com')).toBe('a***@example.com')
  })

  it('enmascara del todo un valor que no es un email', () => {
    expect(maskEmail('sin-arroba')).toBe('***')
  })
})

describe('ConsoleEmailSender', () => {
  it('guarda el mensaje y devuelve un identificador del proveedor', async () => {
    const logs: string[] = []
    const sender = new ConsoleEmailSender((message) => logs.push(message))

    const result = await sender.send({
      to: 'ana@example.com',
      subject: 'Tu presupuesto',
      text: 'Adjuntamos tu presupuesto.',
      attachments: [
        {
          filename: 'presupuesto-PC-2026-000001.pdf',
          contentType: 'application/pdf',
          content: new Uint8Array([1]),
        },
      ],
    })

    expect(result.providerMessageId).toBe('console-1')
    expect(sender.sent()).toHaveLength(1)
    expect(logs[0]).toContain('a***@example.com')
    expect(logs[0]).not.toContain('ana@example.com')
  })
})
