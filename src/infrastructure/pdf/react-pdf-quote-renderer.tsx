/**
 * Adaptador de PDF con `@react-pdf/renderer` (ADR-0004 §3).
 *
 * JavaScript puro en el servidor: sin Chromium, sin binarios y sin servicios externos, apto para el
 * entorno serverless de Vercel. La plantilla consume el tipo del dominio `QuoteDocument`; los
 * rótulos salen de `src/i18n/quote-document-texts` en el idioma del presupuesto (ADR-0005) y la
 * paleta de `quote-document-palette` (un solo módulo, derivado 1:1 de §2).
 *
 * Si al documento le falta algún valor del propietario (CIF-14), el PDF lo muestra con el marcador
 * explícito y un aviso en la cabecera: nadie puede confundirlo con el documento definitivo.
 *
 * Paginación (`plantilla-presupuesto` §6.3): las páginas de continuación llevan cabecera corrida
 * `{título} · {referencia}` y cliente; la cabecera de la tabla se repite en todas; ninguna fila se
 * parte y los bloques de totales, condiciones y aviso de precio congelado son indivisibles. El pie
 * usa la numeración real que da `render` (`Página X de Y`).
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'

import type { QuoteDocument, QuoteDocumentLine } from '@/domain/quote/quote-document'
import {
  DOCUMENT_LANGUAGES,
  formatDate,
  formatMoney,
  pendingFieldLabels,
  quoteDocumentTexts,
} from '@/i18n/quote-document-texts'

import type { QuotePdfRenderer } from '@/application/ports/quote-pdf-renderer'

import { QUOTE_DOCUMENT_PALETTE } from './quote-document-palette'

/** Alto mínimo de fila de §3.3 (6 mm) en puntos PostScript. */
const MIN_ROW_HEIGHT_PT = 17

/**
 * §6.3: al menos dos filas por página. `minPresenceAhead` hace que la fila baje a la página
 * siguiente cuando no queda hueco para ella y su compañera; si solo cabría una, la tabla pasa
 * entera.
 */
const MIN_PRESENCE_AHEAD_PT = MIN_ROW_HEIGHT_PT * 2

/**
 * Propiedades que `@react-pdf/renderer@4.9` entrega a un nodo con `render` al paginar. La librería
 * solo declara `totalPages` en `Text`, pero lo pasa también a `View` (de ahí sale la numeración
 * real del pie); se deja **opcional** para no mentir sobre el tipo declarado y el test de paginación
 * exige que el número sea el real («Página 2 de 2»), no el de la página en curso.
 */
interface PagedNodeProps {
  readonly pageNumber: number
  readonly subPageNumber: number
  readonly totalPages?: number
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    lineHeight: 1.35,
    color: QUOTE_DOCUMENT_PALETTE.ink,
    backgroundColor: QUOTE_DOCUMENT_PALETTE.surface,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  title: {
    fontSize: 18,
    lineHeight: 1.15,
    fontFamily: 'Helvetica-Bold',
    color: QUOTE_DOCUMENT_PALETTE.brand,
  },
  issuerName: {
    fontSize: 10,
    lineHeight: 1.25,
    fontFamily: 'Helvetica-Bold',
    color: QUOTE_DOCUMENT_PALETTE.ink,
  },
  secondary: {
    fontSize: 8.5,
    lineHeight: 1.35,
    color: QUOTE_DOCUMENT_PALETTE.inkMuted,
  },
  warning: {
    marginTop: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: QUOTE_DOCUMENT_PALETTE.warningInk,
    backgroundColor: QUOTE_DOCUMENT_PALETTE.warningBackground,
    color: QUOTE_DOCUMENT_PALETTE.warningInk,
    fontSize: 8.5,
    lineHeight: 1.35,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  metaBlock: { width: '48%' },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    lineHeight: 1.2,
    color: QUOTE_DOCUMENT_PALETTE.brand,
  },
  row: { flexDirection: 'row' },
  key: {
    width: '38%',
    fontSize: 8.5,
    lineHeight: 1.35,
    color: QUOTE_DOCUMENT_PALETTE.inkMuted,
  },
  value: { width: '62%' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: QUOTE_DOCUMENT_PALETTE.rule,
    paddingBottom: 4,
    fontFamily: 'Helvetica-Bold',
    lineHeight: 1.2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: QUOTE_DOCUMENT_PALETTE.rule,
    paddingVertical: 4,
    minHeight: MIN_ROW_HEIGHT_PT,
  },
  concept: { width: '51%' },
  quantity: { width: '10%', textAlign: 'right' },
  numeric: { width: '19.5%', textAlign: 'right' },
  totals: { marginTop: 10, alignSelf: 'flex-end', width: '48%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.75,
    borderTopColor: QUOTE_DOCUMENT_PALETTE.brand,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    lineHeight: 1.2,
  },
  condition: {
    marginBottom: 3,
    fontSize: 8.5,
    lineHeight: 1.35,
    color: QUOTE_DOCUMENT_PALETTE.inkMuted,
  },
  runningHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: QUOTE_DOCUMENT_PALETTE.rule,
  },
  runningHeaderTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    lineHeight: 1.2,
    color: QUOTE_DOCUMENT_PALETTE.brand,
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: QUOTE_DOCUMENT_PALETTE.rule,
    paddingTop: 6,
    fontSize: 7.5,
    lineHeight: 1.2,
    color: QUOTE_DOCUMENT_PALETTE.inkMuted,
  },
  /**
   * Ancla del pie: `fixed` repite el nodo en cada página, pero el `bottom: 28` del pie se mide
   * contra **su bloque contenedor**. Sin este ancla, el contenedor es el envoltorio del flujo
   * (altura 0 al final del contenido) y el pie se imprime encima de lo que haya (M1 de CIF-396).
   * Con el envoltorio anclado al borde inferior de la página, el pie vuelve a la banda inferior.
   */
  footerAnchor: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 0 },
})

export class ReactPdfQuoteRenderer implements QuotePdfRenderer {
  async render(document: QuoteDocument): Promise<Uint8Array> {
    return renderToBuffer(<QuoteDocumentPdf document={document} />)
  }
}

/**
 * §3.3: el espacio antes del símbolo de moneda es **duro**, para que «400,00 €» no parta de línea.
 * Se exporta para poder comprobar la regla sin depender de cómo normalice el extractor de texto.
 */
export function hardCurrencySpace(amount: string): string {
  return amount.replaceAll(' ', '\u00A0')
}

export function QuoteDocumentPdf({ document }: { readonly document: QuoteDocument }) {
  const texts = quoteDocumentTexts(document.locale)
  const money = (cents: bigint): string =>
    hardCurrencySpace(formatMoney(cents, document.totals.currency, document.locale))

  return (
    <Document
      title={`${texts.documentTitle} ${document.reference}`}
      author={document.issuer.name}
      subject={texts.documentTitle}
      language={DOCUMENT_LANGUAGES[document.locale]}
    >
      <Page size="A4" style={styles.page} wrap>
        {/* §6.3: páginas de continuación con cabecera corrida; la página 1 lleva el bloque completo. */}
        <View
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={styles.runningHeader}>
                <Text style={styles.runningHeaderTitle}>
                  {`${texts.documentTitle} · ${document.reference}`}
                </Text>
                {document.customer === null ? null : (
                  <Text style={styles.secondary}>{document.customer.name}</Text>
                )}
              </View>
            ) : null
          }
        />

        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{texts.documentTitle}</Text>
            <Text style={styles.secondary}>{document.reference}</Text>
          </View>
          <View>
            <Text style={styles.issuerName}>{document.issuer.name}</Text>
            <Text style={styles.secondary}>{document.issuer.taxId}</Text>
            <Text style={styles.secondary}>{document.issuer.address}</Text>
            <Text style={styles.secondary}>{document.issuer.email}</Text>
            <Text style={styles.secondary}>{document.issuer.phone}</Text>
            <Text style={styles.secondary}>{document.issuer.website}</Text>
          </View>
        </View>

        {document.pendingFields.length > 0 ? (
          <Text style={styles.warning}>
            {texts.pendingConfigurationNotice(
              pendingFieldLabels(document.locale, document.pendingFields),
            )}
          </Text>
        ) : null}

        <View style={styles.meta}>
          <View style={styles.metaBlock}>
            <Text style={styles.sectionTitle}>{texts.reference}</Text>
            <Text>{document.reference}</Text>
            <Text style={styles.secondary}>
              {texts.issuedOn}: {formatDate(document.issuedOn, document.locale)}
            </Text>
            {document.validUntil === null ? null : (
              <Text style={styles.secondary}>
                {texts.validUntil}: {formatDate(document.validUntil, document.locale)}
              </Text>
            )}
          </View>
          {document.customer === null ? null : (
            <View style={styles.metaBlock}>
              <Text style={styles.sectionTitle}>{texts.customer}</Text>
              <Text>{document.customer.name}</Text>
              <Text style={styles.secondary}>{document.customer.email}</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>{texts.configuration}</Text>
        <View style={styles.row}>
          <Text style={styles.key}>{texts.series}</Text>
          <Text style={styles.value}>{document.configuration.seriesName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.key}>{texts.measurements}</Text>
          <Text style={styles.value}>
            {texts.measurement(document.configuration.widthMm, document.configuration.heightMm)}
          </Text>
        </View>
        {document.configuration.finishName === null ? null : (
          <View style={styles.row}>
            <Text style={styles.key}>{texts.finish}</Text>
            <Text style={styles.value}>{document.configuration.finishName}</Text>
          </View>
        )}
        {document.configuration.colorName === null ? null : (
          <View style={styles.row}>
            <Text style={styles.key}>{texts.color}</Text>
            <Text style={styles.value}>{document.configuration.colorName}</Text>
          </View>
        )}
        <View style={styles.row}>
          <Text style={styles.key}>{texts.accessories}</Text>
          <Text style={styles.value}>
            {document.configuration.accessoryNames.length === 0
              ? texts.noAccessories
              : document.configuration.accessoryNames.join(', ')}
          </Text>
        </View>
        {document.configuration.extras.length === 0 ? null : (
          <View style={styles.row}>
            <Text style={styles.key}>{texts.extrasTitle}</Text>
            <Text style={styles.value}>
              {document.configuration.extras.map((extra) => texts.extras[extra]).join(', ')}
            </Text>
          </View>
        )}

        {/* §3.2: la sección de la tabla tiene rótulo propio, no repite el título del documento. */}
        <Text style={styles.sectionTitle}>{texts.breakdown}</Text>
        {/* §6.3: la cabecera de la tabla se repite en todas las páginas. */}
        <View style={styles.tableHeader} fixed>
          <Text style={styles.concept}>{texts.concept}</Text>
          <Text style={styles.quantity}>{texts.quantity}</Text>
          <Text style={styles.numeric}>{texts.unitPrice}</Text>
          <Text style={styles.numeric}>{texts.amount}</Text>
        </View>
        {document.lines.map((line: QuoteDocumentLine) => (
          <View
            key={line.code}
            style={styles.tableRow}
            wrap={false}
            minPresenceAhead={MIN_PRESENCE_AHEAD_PT}
          >
            <Text style={styles.concept}>{line.label}</Text>
            <Text style={styles.quantity}>{String(line.units)}</Text>
            <Text style={styles.numeric}>{money(line.unitAmountCents)}</Text>
            <Text style={styles.numeric}>{money(line.amountCents)}</Text>
          </View>
        ))}

        {/* §6.3: totales, condiciones y aviso de precio congelado son indivisibles. */}
        <View wrap={false}>
          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text>{texts.subtotal}</Text>
              <Text>{money(document.totals.subtotalCents)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>{texts.taxLine(document.totals.taxRatePercent)}</Text>
              <Text>{money(document.totals.taxCents)}</Text>
            </View>
            <View style={styles.grandTotal}>
              <Text>{texts.total}</Text>
              <Text>{money(document.totals.totalCents)}</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>{texts.conditions}</Text>
          {document.conditions.map((condition) => (
            <Text key={condition} style={styles.condition}>
              {condition}
            </Text>
          ))}
          <Text style={styles.condition}>{texts.frozenPriceNotice}</Text>
        </View>

        {/*
         * §3.6: pie en todas las páginas, con numeración real y sin repetir la web del emisor.
         *
         * El `render` va en el `View` y no en el `Text` a propósito: con `lineHeight` heredado de la
         * página, un `Text` dinámico se mide mal y desaparece del PDF (comprobado con
         * `@react-pdf/renderer@4.9.0`). Misma razón en la cabecera corrida.
         *
         * El estilo va en el ancla y **no** en el nodo con `render`: un nodo dinámico cuyo estilo
         * lleve `lineHeight` también desaparece.
         */}
        <View
          fixed
          style={styles.footerAnchor}
          render={({ pageNumber, totalPages }: PagedNodeProps) => (
            <View style={styles.footer}>
              <Text>{texts.pdfFooter}</Text>
              {/* Sin `totalPages` el pie no puede mentir: cae al número de página en curso. */}
              <Text>{texts.pageNumber(pageNumber, totalPages ?? pageNumber)}</Text>
            </View>
          )}
        />
      </Page>
    </Document>
  )
}
