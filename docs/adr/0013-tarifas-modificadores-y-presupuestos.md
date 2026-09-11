# ADR-0013 — Desglose de tarifas, modificadores y presupuestos con precio congelado

- **Fecha:** 2026-09-11
- **Estado:** Aceptado (CTO, revisión de CIF-4 — veredicto CIF-76)
- **Decide:** Backend (CIF-4), revisa el CTO
- **Ámbito:** motor de precios, esquema de datos y contrato de la API de catálogo

## Contexto

El ADR-0003 decidió el modelo de tarifas versionadas y dejó explícito que el desglose de precios
(bandas y modificadores) llegaría con CIF-4 como migración propia. CIF-3 solo creó
`tariff_version` (estrategia, vigencia e IVA). Faltaba:

- dónde viven el precio base, las bandas de medida y los modificadores de una tarifa;
- cómo se representa y se calcula cada estrategia (`per_square_metre`, `size_bands`, `fixed`);
- dónde se guarda un presupuesto emitido con su precio congelado y sus líneas traducibles;
- qué pasa con los casos sin precio automático (tamaño máximo, tarifa ausente, combinación no
  cubierta).

Restricciones: dominio puro testeable sin base de datos, dinero en `Money` (`bigint`), migraciones
reversibles y una API estable para el configurador (CIF-7) y el panel (CIF-9).

## Decisión

1. **El desglose cuelga de la tabla de precios de la versión de tarifa.** `tariff_price_table`
   (1:1 con `tariff_version`) guarda el precio base; `tariff_size_band` las bandas de medida y
   `tariff_modifier` los modificadores. Así una versión de tarifa puede publicarse sin precios
   cargados y el motor devuelve presupuesto manual (`no_tariff_in_force`) en lugar de un precio
   inventado.
2. **El dominio modela la tabla como objeto de valor validado** (`PriceTable`, `SizeBand`,
   `PriceModifier` en `src/domain/pricing`): coherencia estrategia↔precio, bandas sin solapes,
   modificadores con importe o porcentaje (nunca los dos) y `targetId` obligatorio solo para
   acabado, color y accesorios. En un modificador `discount`, `targetId` es el **código de
   descuento** y `null` significa **descuento automático**; el esquema lo representa con la columna
   `tariff_modifier.discount_code` (`NULL` = automático), de modo que el round-trip dominio↔base de
   datos es simétrico y un descuento automático no se confunde con uno por código (CIF-74,
   hallazgo B2).
3. **Orden de cálculo determinista y documentado** (`calculateQuotePrice`): precio base → adiciones
   (acabado, color, accesorios, instalación, portes, urgencia) → descuentos en orden, sin dejar el
   subtotal por debajo de cero → IVA sobre el subtotal. Los porcentuales se aplican sobre el precio
   base salvo los descuentos, que se aplican sobre el acumulado.
4. **Redondeo:** superficie en m² redondeada al alza a tres decimales (`Dimensions`), importes en
   céntimos con redondeo _half-up_ (`Money`). Sin coma flotante en ningún paso.
5. **Presupuesto con precio congelado:** `quote` guarda `tariff_version_id`, la configuración de
   entrada, los totales y un `price_snapshot` JSONB con el desglose exacto; `quote_line` guarda las
   líneas con su etiqueta multi-idioma (`{ es, en }`). Un cambio posterior de tarifas no altera
   ningún presupuesto emitido. La referencia pública es `PC-AAAA-NNNNNN`, con contador por año
   (`quote_reference_counter`) incrementado con un UPSERT atómico.
6. **La etiqueta se resuelve en el idioma guardado en el presupuesto**, no en el del que consulta:
   el documento se emitió en un idioma y se renderiza igual siempre (ADR-0005).
7. **Migración propia y reversible**
   (`20260911130000_tarifas_precios_y_presupuestos` y
   `20260911140000_descuento_automatico_en_modificadores`), con `down.sql` y con las restricciones
   `CHECK` como última red (importes no negativos, IVA 0-100, coherencia tipo/porcentaje de
   modificador, coherencia objetivo ↔ referencia, `total = subtotal + IVA`).
8. **Modo demostración:** sin `DATABASE_URL` (o con `CATALOG_DEMO_MODE=true`) el contenedor usa
   adaptadores en memoria con un catálogo inventado, para que el configurador, la API y el E2E
   funcionen sin PostgreSQL. En producción `DATABASE_URL` es obligatoria.

## Consecuencias

- El propietario podrá cargar precios y modificadores desde el panel (CIF-9) sin tocar código.
- El motor se prueba con tabla de casos sin base de datos; los adaptadores Prisma se prueban contra
  PostgreSQL real cuando existe `TEST_DATABASE_URL`.
- El modo demostración puede enmascarar una configuración de producción incompleta: el endpoint
  `/api/health` y `meta.mode` de la API lo hacen visible.
- El contador de referencias es por año y sin huecos; si se superan 999 999 presupuestos en un año,
  hay que ampliar el formato (documentado y con test).
- **El paso a presupuesto manual no devuelve texto de dominio.** `calculateQuotePrice` declara el
  hecho tipado (`ManualQuoteDetail`) y el borde HTTP compone el `detail` traducido con el namespace
  `ManualQuoteReasons` de `messages/<locale>.json` (ADR-0005). El motivo estable de la API sigue
  siendo `reason`.
- **El no solapamiento de tarifas publicadas se defiende en el dominio y en la base de datos (CIF-89).**
  El flujo de publicación del panel (`publishTariffVersion`,
  `POST /api/admin/tariff-versions/:id/publish`) carga las versiones de la serie y llama a
  `assertNoOverlappingPublishedTariffs` antes del `INSERT`/`UPDATE`: si hay solape lanza
  `AmbiguousTariffError` y la API responde 409 sin tocar la fila. Esa comprobación previa, sin
  embargo, no es atómica: dos publicaciones concurrentes de versiones solapadas de la misma serie
  pueden superarla ambas antes de que ninguna escriba. Por eso la garantía vive además en
  PostgreSQL, en la migración `20260911150000_constraint_solape_tarifas_publicadas`: una
  restricción de exclusión parcial (`EXCLUDE USING gist (series_id WITH =,
daterange(valid_from, valid_until, '[)') WITH &&) WHERE (status = 'PUBLISHED')`, con
  `btree_gist`) rechaza en la escritura cualquier solape de vigencia entre versiones publicadas de
  la misma serie, con independencia de lo que viera la comprobación previa. El adaptador
  (`isPublishedTariffOverlapViolation` en `PrismaTariffVersionRepository`) traduce esa violación
  (SQLSTATE `23P01`) a `AmbiguousTariffError`, de modo que la carrera concurrente también responde
  409 y nunca 500. `selectTariffInForce` se mantiene como última red de lectura
  (`AmbiguousTariffError` si aun así coexistieran dos vigentes). La reversión está documentada en
  `prisma/migrations/20260911150000_constraint_solape_tarifas_publicadas/down.sql`: al retirar la
  restricción vuelve a abrirse la ventana de carrera, así que solo es aceptable con un motivo
  explícito y volviendo a la comprobación previa como única defensa.
- Se necesitan tests de integración con PostgreSQL real en CI: los añaden QA/DevOps (CIF-10/CIF-11).

## Alternativas consideradas

- **Un único JSON de precios por tarifa:** menos tablas, pero sin integridad referencial ni consultas
  por banda; el panel tendría que validar todo el JSON. Descartado.
- **Precio de accesorios en la tabla `accessory`:** el precio depende de la serie y de la vigencia,
  así que vive en la tarifa (ADR-0003). Descartado.
- **Referencia con secuencia global de PostgreSQL:** más simple, pero mezcla años y agota los seis
  dígitos antes; el contador por año es explícito y testeable. Descartado.
- **Dejar el descuento automático fuera del MVP** (opción b de la revisión de CIF-71): habría
  exigido eliminar la rama `targetId === null` del dominio y del motor, que el panel (CIF-9)
  necesita. Descartado.
- **Recalcular el precio del presupuesto al consultarlo:** rompe la promesa de precio congelado.
  Descartado.
