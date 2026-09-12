import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { SUPPORTED_LOCALES, type Locale } from '@/domain/catalog/locale'

import { CatalogLanguages } from './catalog-languages'
import { createFixtureAdminCatalogReader } from './fixtures/admin-catalog.fixtures'
import { SeriesDetailView } from './series-detail'
import { SeriesList } from './series-list'
import { TariffVersions } from './tariff-versions'

/**
 * Render del shell por secciones: comprueba en los dos idiomas los textos, los nombres accesibles
 * (M2 de CIF-101), las etiquetas de celda del modo tarjeta y los estados del DoD §6. Se renderiza
 * en servidor, sin navegador, para que la suite siga corriendo en el entorno `node` del repositorio.
 */

vi.mock('@/i18n/navigation', async () => {
  const react = await import('react')

  return {
    Link: ({ children, ...rest }: { children?: unknown }) =>
      react.createElement('a', rest, children as ReactElement),
    usePathname: () => '/admin',
  }
})

const messagesDirectory = fileURLToPath(new URL('../../../messages/', import.meta.url))

function messages(locale: Locale): AbstractIntlMessages {
  return JSON.parse(
    readFileSync(join(messagesDirectory, `${locale}.json`), 'utf8'),
  ) as AbstractIntlMessages
}

function render(locale: Locale, node: ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages(locale)}>
      {node}
    </NextIntlClientProvider>,
  )
}

const reader = createFixtureAdminCatalogReader('es')

describe('shell del panel: lista de series', () => {
  it('pinta la tabla con estados, medidas máximas y etiqueta en cada celda', async () => {
    const markup = render('es', <SeriesList state="ready" series={await reader.listSeries()} />)

    expect(markup).toContain('Serie A')
    expect(markup).toContain('Publicada')
    expect(markup).toContain('Borrador')
    expect(markup).toContain('Archivada')
    expect(markup).toContain('2400 × 2100 mm')
    expect(markup).toContain('Falta traducción')
    expect(markup).toContain('data-label="Nombre"')
    expect(markup).toContain('data-label="Medidas máx."')
    expect(markup).toContain('<caption')
  })

  it('ordena por nombre ascendente de serie, como el prototipo', async () => {
    const markup = render('es', <SeriesList state="ready" series={await reader.listSeries()} />)

    expect(markup.indexOf('Serie A')).toBeLessThan(markup.indexOf('Serie B'))
    expect(markup).toContain('aria-sort="ascending"')
  })

  it('traduce la pantalla entera en inglés, incluido el nombre accesible de ordenar', async () => {
    const markup = render(
      'en',
      <SeriesList
        state="ready"
        series={await createFixtureAdminCatalogReader('en').listSeries()}
      />,
    )

    expect(markup).toContain('Series A')
    expect(markup).toContain('Published')
    expect(markup).toContain('Max. size')
    expect(markup).toContain('Sort by Name')
    expect(markup).not.toContain('Publicada')
  })

  it('cubre los estados vacío, carga, error y sin permiso', async () => {
    const empty = render('es', <SeriesList state="empty" series={[]} />)
    const englishEmpty = render('en', <SeriesList state="empty" series={[]} />)
    const loading = render('es', <SeriesList state="loading" series={[]} />)
    const error = render('es', <SeriesList state="error" series={[]} />)
    const forbidden = render('es', <SeriesList state="forbidden" series={[]} />)

    expect(empty).toContain('Todavía no hay series.')
    expect(englishEmpty).toContain('There are no series yet.')
    expect(loading).toContain('role="status"')
    expect(error).toContain('No hemos podido cargar los datos.')
    expect(error).toContain('Reintentar')
    expect(forbidden).toContain('No tienes acceso a esta sección.')
    expect(forbidden).toContain('Pide acceso al propietario de la cuenta.')
  })
})

describe('shell del panel: detalle de serie', () => {
  it('nombra el tablist por clave traducida (M2 de CIF-101)', async () => {
    const detail = await reader.getSeries('serie-a')

    expect(detail).not.toBeNull()

    const spanish = render(
      'es',
      <SeriesDetailView detail={detail!} tab="measures" tariffVersions={[]} />,
    )
    const english = render(
      'en',
      <SeriesDetailView detail={detail!} tab="measures" tariffVersions={[]} />,
    )

    expect(spanish).toContain('aria-label="Secciones de la serie"')
    expect(spanish).toContain('Medidas')
    expect(spanish).toContain('400 mm')
    expect(english).toContain('aria-label="Series sections"')
    expect(english).toContain('Sizes')
  })

  it('muestra el aviso de precio congelado y el identificador web en General', async () => {
    const detail = await reader.getSeries('serie-b')

    const markup = render(
      'es',
      <SeriesDetailView detail={detail!} tab="general" tariffVersions={[]} />,
    )

    expect(markup).toContain('Los cambios se guardan como borrador hasta que publiques')
    expect(markup).toContain('serie-b')
    expect(markup).toContain('Falta traducción')
    expect(markup).toContain('disabled')
  })
})

describe('shell del panel: tarifas e idiomas', () => {
  it('pinta las versiones de tarifa con la vigente marcada y su diálogo de detalle', async () => {
    const versions = await reader.listTariffVersions()

    const spanish = render(
      'es',
      <TariffVersions state="ready" versions={versions} captionKey="tariffs.allCaption" />,
    )
    const english = render(
      'en',
      <TariffVersions state="ready" versions={versions} captionKey="tariffs.allCaption" />,
    )

    expect(spanish).toContain('v3')
    expect(spanish).toContain('Vigente')
    expect(spanish).toContain('El precio queda congelado al emitir el presupuesto')
    expect(spanish).toContain('class="admin-dialog"')
    expect(spanish).toContain('aria-labelledby="tariff-dialog-title"')
    expect(spanish).toContain('aria-labelledby="tariff-dialog-title"')
    expect(english).toContain('Current')
    expect(english).toContain('Effective from')
  })

  it('cubre los estados vacío, carga, error y sin permiso de tarifas', async () => {
    const versions = await reader.listTariffVersions()

    const empty = render(
      'es',
      <TariffVersions state="empty" versions={versions} captionKey="tariffs.allCaption" />,
    )
    const englishEmpty = render(
      'en',
      <TariffVersions state="empty" versions={versions} captionKey="tariffs.allCaption" />,
    )
    const loading = render('es', <TariffVersions state="loading" versions={versions} />)
    const error = render('es', <TariffVersions state="error" versions={versions} />)
    const forbidden = render('es', <TariffVersions state="forbidden" versions={versions} />)

    // El estado manda sobre el contenido: `empty` no pinta la tabla aunque el lector devuelva versiones.
    expect(empty).toContain('Sin tarifas para esta serie.')
    expect(empty).not.toContain('admin-table')
    expect(englishEmpty).toContain('No price lists for this series.')
    expect(loading).toContain('role="status"')
    expect(loading).not.toContain('admin-table')
    expect(error).toContain('No hemos podido cargar los datos.')
    expect(error).toContain('Reintentar')
    expect(error).not.toContain('admin-table')
    expect(forbidden).toContain('No tienes acceso a esta sección.')
    expect(forbidden).toContain('Pide acceso al propietario de la cuenta.')
  })

  it('resume los idiomas del catálogo y lo que falta por traducir', async () => {
    const languages = await reader.listLanguages()

    const spanish = render('es', <CatalogLanguages state="ready" languages={languages} />)
    const english = render('en', <CatalogLanguages state="ready" languages={languages} />)

    expect(spanish).toContain('Español (ES)')
    expect(spanish).toContain('Completo')
    expect(spanish).toContain('Falta traducción')
    expect(english).toContain('Spanish (ES)')
    expect(english).toContain('Complete')
    expect(SUPPORTED_LOCALES).toHaveLength(2)
  })
})
