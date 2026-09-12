/**
 * Formato de importes, números y fechas para la interfaz del configurador.
 *
 * Los importes llegan de la API como **cadena decimal exacta** (`"1234.50"`). Aquí no se convierten
 * a coma flotante: se agrupa la parte entera con `Intl` sobre un `BigInt` y se colocan separadores
 * y símbolo de moneda con el patrón del idioma. El redondeo es del motor de precios, nunca de la
 * vista (ADR-0003 y convenciones de código).
 */

function decimalSeparatorOf(locale: string): string {
  return (
    new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal')
      ?.value ?? ','
  )
}

function splitAmount(amount: string): { sign: string; integer: string; fraction: string } {
  const negative = amount.startsWith('-')
  const unsigned = negative ? amount.slice(1) : amount
  const [integer = '0', fraction = ''] = unsigned.split('.')

  return { sign: negative ? '-' : '', integer: integer === '' ? '0' : integer, fraction }
}

/** Importe con la moneda del presupuesto: `1234.5` + `EUR` + `es` → `1.234,50 €`. */
export function formatMoney(amount: string, currency: string, locale: string): string {
  const { sign, integer, fraction } = splitAmount(amount)
  const digits = fraction.padEnd(2, '0').slice(0, 2)

  try {
    const grouped = `${sign}${new Intl.NumberFormat(locale).format(BigInt(integer))}`
    const pattern = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(1234.56)

    return pattern
      .map((part) => {
        if (part.type === 'integer') {
          return grouped
        }

        if (part.type === 'group') {
          return ''
        }

        if (part.type === 'decimal') {
          return decimalSeparatorOf(locale)
        }

        if (part.type === 'fraction') {
          return digits
        }

        return part.value
      })
      .join('')
  } catch {
    return `${sign}${integer},${digits} ${currency}`
  }
}

/** Número con el idioma activo, para tasas de IVA y unidades (nunca para importes). */
export function formatNumber(value: number | string, locale: string): string {
  const numeric = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numeric)) {
    return String(value)
  }

  try {
    return new Intl.NumberFormat(locale).format(numeric)
  } catch {
    return String(value)
  }
}

/** Fecha corta en el idioma activo; `null` si el valor no es una fecha válida. */
export function formatDate(iso: string, locale: string): string | null {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
  } catch {
    return null
  }
}
