/**
 * Ajustes del documento de presupuesto que el propietario confirma (CIF-14).
 *
 * El caso de uso no lee el entorno: pide estos ajustes como dependencia, y la raíz de composición
 * los resuelve desde `src/config` (`resolveQuoteDocumentSettings`). Así el mismo caso de uso sirve
 * con los valores provisionales de hoy y con los definitivos de mañana sin cambiar una línea.
 */

import type { Locale } from '@/domain/catalog/locale'

export interface QuoteDocumentIssuerSettings {
  readonly name: string
  readonly taxId: string
  readonly address: string
  readonly email: string
  readonly phone: string
  readonly website: string
  /** `true` si los datos fiscales siguen siendo el marcador de pendiente. */
  readonly isPending: boolean
}

export interface QuoteDocumentSettings {
  /** Condiciones legales por idioma; si un idioma no las tiene, se usa el idioma por defecto. */
  readonly conditions: Readonly<Record<Locale, readonly string[]>>
  readonly issuer: QuoteDocumentIssuerSettings
  /** Buzón del comercial y copias: los destinatarios internos del aviso. */
  readonly internalRecipients: readonly string[]
  /** Valores pendientes de confirmar (`issuer.*` y `conditions.<locale>`). */
  readonly pendingFields: readonly string[]
}
