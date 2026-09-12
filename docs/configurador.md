# Configurador público (CIF-7)

Ruta: **`/[locale]/configurador`** (`/es/configurador`, `/en/configurador`). Es el flujo por el que un
cliente elige su puerta, ve el precio y obtiene un presupuesto o pasa a presupuesto manual.

## Regla de oro: es data-driven

El catálogo y los precios son **datos**, no código ([ADR-0020](adr/0020-configurador-data-driven-y-gate-de-diseno.md)):

- Las series, medidas máximas, acabados, colores, accesorios y tarifas se leen de la API pública
  (`docs/api.md`): `GET /api/catalog/series`, `GET /api/catalog/series/:slug`,
  `POST /api/quotes/price`, `POST /api/quotes` y `POST /api/manual-quote-requests`.
- La página no se prerenderiza (`dynamic = 'force-dynamic'`): si se generara en el build, el precio
  quedaría congelado hasta el siguiente despliegue. La primera serie llega resuelta desde el caso de
  uso para que la primera pintada sea completa; el resto se piden al cambiar de serie.
- Lo único fijo en el código es el **modelo visual 2D** de CIF-6 (5 tipos, ADR-0016) y la
  correspondencia entre el `code` del acabado y la textura del dibujo.
- El precio lo calcula **siempre el servidor**. La vista solo debounce-a (250 ms) la petición, cancela
  la obsoleta y pinta el desglose; nunca re-deriva importes ni redondeos.

## Flujo

1. **Serie**: define rango de medidas (mínimo y máximo), acabados, colores y accesorios compatibles.
2. **Tipo de puerta** (`abatible-1-hoja`, `abatible-2-hojas`, `entrada-acorazada`, `pivotante-1-hoja`,
   `pivotante-2-hojas`): solo afecta al dibujo. El paso a presupuesto manual lo dispara la medida, no
   el tipo (ADR-0016).
3. **Medidas** en milímetros enteros (1–10.000): se validan al teclear con las mismas invariantes del
   dominio (`Dimensions`, `SizeRange`). Una medida por encima del máximo —o por debajo del mínimo— de la
   serie no recibe precio automático: aviso inmediato y paso a presupuesto manual.
4. **Acabado, color y accesorios** del catálogo publicado; al cambiar de acabado el color se recoloca
   al primero de ese acabado, porque un color pertenece siempre a un acabado.
5. **Extras** (instalación, portes, entrega urgente) y **código de descuento**: entran en el cálculo del
   motor; si la tarifa no tiene ese modificador, no cambian el precio.
6. **Superficie y remates** (tablones, enmarcado, bastidor bicolor, huecos de cristal): **solo afectan
   al dibujo**, nunca al precio, y por eso no viajan en la petición de precio.
7. **Precio en vivo**: desglose con líneas, subtotal, IVA y total, más la versión de tarifa aplicada.
8. **Cierre**: con precio, el cliente deja sus datos y se emite el presupuesto (referencia
   `PC-AAAA-NNNNNN` vigente hasta la fecha de validez); sin precio automático, deja sus datos y se
   registra la solicitud de presupuesto manual.

## Borradores recuperables

- La configuración se guarda en `localStorage` con la clave `cifuentes:configurador:<locale>:v1`, en
  cada cambio y **después** de intentar recuperar la anterior (si se guardara antes, el borrador del
  cliente se perdería al recargar).
- Al volver a la página se recupera, se reconcilia con el catálogo publicado (un acabado, color o
  accesorio retirado desaparece) y se avisa con la opción de empezar de nuevo.
- **Nunca se guardan datos personales** en el borrador: solo la configuración (minimización, RGPD).
- Un borrador corrupto, de otra versión o de otro idioma se descarta sin romper la página.

## Accesibilidad, i18n y rendimiento

- Todo el texto pasa por `messages/<locale>.json` (`Configurator` y `Preview2D`); el test
  `src/ui/configurator/messages.test.ts` comprueba que las claves usadas existen en los dos idiomas
  (un `MISSING_MESSAGE` de next-intl no rompería el test de paridad de diccionarios).
- Formularios con `<label>`, `fieldset`/`legend` y errores anunciados (`role="alert"`); el precio y el
  aviso de presupuesto manual son regiones `status`/`alert` con `aria-live`; los campos de medida
  anuncian el rango admitido con `aria-describedby`.
- La validación del contacto es la nuestra (`noValidate`), traducida y con `aria-invalid`, no la nativa
  del navegador.
- Responsive: en móvil la vista previa se compacta (`max-h-[30vh]`) para que el primer control quede
  dentro del primer viewport; en escritorio la vista previa es fija y el panel se desplaza.
- La vista previa se repinta de forma síncrona con cada cambio (presupuesto de móvil verificado en el
  E2E: < 200 ms de mediana); el precio va por red y no bloquea el dibujo.
- Los importes se formatean sin coma flotante: la parte entera se agrupa con `Intl` sobre un `BigInt`
  (`src/ui/configurator/format.ts`).

## Límite conocido (documentado, no bloqueante)

El catálogo no guarda todavía un campo visual por acabado. La correspondencia entre el `code`
comercial y la textura del 2D es una tabla de palabras clave en `src/ui/configurator/selection.ts`
(acabado desconocido → relleno neutro). Cuando existan los puertos de escritura de catálogo
(CIF-126) y el panel (CIF-9), el sitio natural de ese dato es un campo del acabado que se importa y
se edita como contenido, sin desplegar. Mientras tanto, el dataset `demo`/semilla cubre el flujo.

El presupuesto en PDF y por email es CIF-173; aquí se emite y se muestra la referencia, el total y la
validez.

## Pruebas

- Unitarias: `src/ui/configurator/selection.test.ts` (medidas, reconciliación con el catálogo, cuerpos
  de la API, contacto, borradores), `format.test.ts` (importes sin coma flotante) y `messages.test.ts`
  (cobertura i18n).
- E2E: `e2e/configurator.spec.ts` (flujo completo, presupuesto, presupuesto manual por máximo y por
  falta de tarifa, medidas imposibles, contacto incompleto, borrador y canónica) y
  `e2e/door-preview-2d.spec.ts` (invariantes del dibujo de CIF-6, actualizadas al configurador real).
