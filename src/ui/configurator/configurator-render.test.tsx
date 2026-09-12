/**
 * Estado vacío del configurador (CIF-430, ADR-0026 §3).
 *
 * El catálogo vacío es el estado **esperado** hasta que el propietario carga el catálogo
 * (ADR-0015 §7) y puede durar días o semanas: el visitante no puede leer una promesa de reintento a
 * minutos. Este test renderiza el componente real con `series` vacío en los dos idiomas y fija el
 * texto, de modo que volver a prometer un reintento falle aquí y no en producción.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

import { ConfiguratorApp } from './configurator-app'

type Messages = { [key: string]: string | Messages }

const MESSAGES_DIRECTORY = fileURLToPath(new URL('../../../messages', import.meta.url))

function readMessages(locale: Locale): Messages {
  return JSON.parse(readFileSync(`${MESSAGES_DIRECTORY}/${locale}.json`, 'utf8')) as Messages
}

function resolve(messages: Messages, path: string): string | undefined {
  let current: string | Messages | undefined = messages

  for (const segment of path.split('.')) {
    current = typeof current === 'string' ? undefined : current?.[segment]
  }

  return typeof current === 'string' ? current : undefined
}

function renderConfigurator(locale: Locale): string {
  return renderToStaticMarkup(
    (
      <NextIntlClientProvider
        locale={locale}
        messages={readMessages(locale) as AbstractIntlMessages}
      >
        <ConfiguratorApp locale={locale} series={[]} initialDetail={null} />
      </NextIntlClientProvider>
    ) as ReactElement,
  )
}

/** Copy viejo (hallazgo F3 de CIF-385): una vuelta «en unos minutos» que no existe. */
const PROMESA_DE_REINTENTO = /minut|inténtalo|intentarlo|try again/i

const TEXTO_ESPERADO: Record<Locale, string> = {
  es: 'Todavía no hay ninguna serie publicada.',
  en: 'There are no published series yet.',
}

describe('estado vacío del configurador', () => {
  for (const locale of SUPPORTED_LOCALES) {
    it(`${locale}: describe un estado estable y no promete un reintento`, () => {
      const markup = renderConfigurator(locale)

      expect(markup).toContain('data-testid="catalog-empty"')
      expect(markup).toContain(TEXTO_ESPERADO[locale])
      expect(markup).not.toMatch(PROMESA_DE_REINTENTO)
    })
  }

  it('mantiene el reintento solo donde hay un fallo de carga real', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = readMessages(locale)

      // Semántica distinta y sin tocar: el error de carga sí invita a reintentar (alcance §2).
      expect(resolve(messages, 'Configurator.catalog.error')).toMatch(PROMESA_DE_REINTENTO)
      expect(resolve(messages, 'Configurator.catalog.empty')).not.toMatch(PROMESA_DE_REINTENTO)
    }
  })
})
