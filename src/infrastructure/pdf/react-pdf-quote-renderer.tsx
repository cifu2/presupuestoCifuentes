/**
 * Adaptador de PDF con `@react-pdf/renderer` (ADR-0004 §3).
 *
 * JavaScript puro en el servidor: sin Chromium, sin binarios y sin servicios externos, apto para el
 * entorno serverless de Vercel. La plantilla consume el tipo del dominio `QuoteDocument`; los
 * rótulos salen de `src/i18n/quote-document-texts` en el idioma del presupuesto (ADR-0005).
 *
 * Si al documento le falta algún valor del propietario (CIF-14), el PDF lo muestra con el marcador
 * explícito y un aviso en la cabecera: nadie puede confundirlo con el documento definitivo.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'

import type { QuoteDocument, QuoteDocumentLine } from '@/domain/quote/quote-document'
import {
  formatDate,
  formatMoney,
  pendingFieldLabels,
  quoteDocumentTexts,
} from '@/i18n/quote-document-texts'

import type { QuotePdfRenderer } from '@/application/ports/quote-pdf-renderer'

const COLORS = {
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#d1d5db',
  brand: '#7c2d12',
  warning: '#92400e',
  warningBackground: '#fef3c7',
} as const

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: 'Helvetica',
    color: COLORS.ink,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: COLORS.brand },
  issuerName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  muted: { color: COLORS.muted },
  warning: {
    marginTop: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: COLORS.warning,
    backgroundColor: COLORS.warningBackground,
    color: COLORS.warning,
    fontSize: 8.5,
  },
  meta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  metaBlock: { width: '48%' },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 6,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    color: COLORS.brand,
  },
  row: { flexDirection: 'row' },
  key: { width: '38%', color: COLORS.muted },
  value: { width: '62%' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingBottom: 4,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.line,
    paddingVertical: 4,
  },
  concept: { width: '52%' },
  numeric: { width: '16%', textAlign: 'right' },
  totals: { marginTop: 10, alignSelf: 'flex-end', width: '48%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.ink,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  condition: { marginBottom: 3, color: COLORS.muted },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.line,
    paddingTop: 6,
    fontSize: 8,
    color: COLORS.muted,
  },
})

export class ReactPdfQuoteRenderer implements QuotePdfRenderer {
  async render(document: QuoteDocument): Promise<Uint8Array> {
    return renderToBuffer(<QuoteDocumentPdf document={document} />)
  }
}

export function QuoteDocumentPdf({ document }: { readonly document: QuoteDocument }) {
  const texts = quoteDocumentTexts(document.locale)
  const money = (cents: bigint): string =>
    formatMoney(cents, document.totals.currency, document.locale)

  return (
    <Document title={document.reference} author={document.issuer.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{texts.documentTitle}</Text>
            <Text style={styles.muted}>{document.reference}</Text>
          </View>
          <View>
            <Text style={styles.issuerName}>{document.issuer.name}</Text>
            <Text style={styles.muted}>{document.issuer.taxId}</Text>
            <Text style={styles.muted}>{document.issuer.address}</Text>
            <Text style={styles.muted}>{document.issuer.email}</Text>
            <Text style={styles.muted}>{document.issuer.phone}</Text>
            <Text style={styles.muted}>{document.issuer.website}</Text>
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
            <Text style={styles.muted}>
              {texts.issuedOn}: {formatDate(document.issuedOn, document.locale)}
            </Text>
            {document.validUntil === null ? null : (
              <Text style={styles.muted}>
                {texts.validUntil}: {formatDate(document.validUntil, document.locale)}
              </Text>
            )}
          </View>
          {document.customer === null ? null : (
            <View style={styles.metaBlock}>
              <Text style={styles.sectionTitle}>{texts.customer}</Text>
              <Text>{document.customer.name}</Text>
              <Text style={styles.muted}>{document.customer.email}</Text>
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

        <Text style={styles.sectionTitle}>{texts.documentTitle}</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.concept}>{texts.concept}</Text>
          <Text style={styles.numeric}>{texts.unitPrice}</Text>
          <Text style={styles.numeric}>{texts.amount}</Text>
        </View>
        {document.lines.map((line: QuoteDocumentLine) => (
          <View key={line.code} style={styles.tableRow}>
            <Text style={styles.concept}>{line.label}</Text>
            <Text style={styles.numeric}>{money(line.unitAmountCents)}</Text>
            <Text style={styles.numeric}>{money(line.amountCents)}</Text>
          </View>
        ))}

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
        <Text style={[styles.muted, styles.condition]}>{texts.frozenPriceNotice}</Text>

        <View style={styles.footer} fixed>
          <Text>{texts.pdfFooter}</Text>
          <Text>{document.issuer.website}</Text>
        </View>
      </Page>
    </Document>
  )
}
