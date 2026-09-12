# ADR-0027 — Escritura de catálogo sin gate de negocio: split de CIF-126 y alcance de la fase 3 del panel

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (decisión de tablero en CIF-482; petición de Frontend en CIF-482, contexto CIF-9 /
  CIF-101 / CIF-126 / CIF-243 / CIF-114)
- **Revisión:** CIF-486 (Backend) devolvió **NO PASA** a la revisión 1 (`7360238`): el conjunto de
  escritura autorizado no cubría ficheros que la propia tarea necesita (H1), la frontera declarada
  omitía superficie compartida (H2), la dirección del E2E del flujo 3 no era viable ni tenía dueño real
  (H3), una cita de ADR era incorrecta (H4), el gate de CIF-126b era algo más ancho de lo justificado
  (H5) y `playwright.config.ts` tenía dos dueños (H6). Esta revisión 2 corrige H1–H6.
- **Ámbito:** modelo de escritura de catálogo (ADR-0017 §8), alcance de escritura del panel
  (ADR-0023 §4 y §7), invariante de publicación de tarifas (ADR-0003)
- **Relación con otros ADR:** ajusta ADR-0023 §7 (el gate de la fase 3 pasa de CIF-126 a su parte
  técnica) y amplía ADR-0023 §4 (conjunto de escritura autorizado en la fase 3). No modifica ADR-0017,
  ADR-0003 ni el resto de ADR-0023.

## Contexto

1. ADR-0023 §7 dejó la fase 3 del panel (CIF-243) bloqueada por CIF-126 y por la autenticación del
   panel. La autenticación (CIF-241) está `done`; CIF-126 sigue `blocked` por CIF-114, la decisión de
   negocio sobre la carga inicial del catálogo real (tarjeta pendiente del propietario, agente CEO en
   `error`).
2. ADR-0023 §8 ya fijó el principio para la lectura: **leer no necesita ninguna decisión de negocio**.
   Por eso CIF-242 (lectura real) se construyó con CIF-114 parada. El **modelo** de escritura —puertos,
   casos de uso y adaptadores— es la misma clase de trabajo: no depende de _quién_ aporta el catálogo ni
   en qué formato, sino de reglas de dominio que ya están decididas (ADR-0003, ADR-0008, ADR-0017 §8).
   Lo que sí depende de CIF-114 es la **carga inicial**: quién aporta el catálogo, en qué formato y con
   qué fecha (items 1, 3, 4, 6 y 7 de CIF-126).
3. Efecto verificado el 2026-09-12: CIF-126 `blocked` por CIF-114, con CIF-9 y CIF-243 detrás; la última
   pieza de frontend del MVP parada por una decisión no técnica, y producción sirviendo el configurador
   sin catálogo (CIF-381).
4. Existe superficie de escritura compartida entre el modelo de escritura y la fase 3 del panel que hay
   que repartir de forma explícita: `src/composition/container.ts` es raíz de composición única
   (ADR-0001); `src/application/use-cases/publish-tariff-version.ts` es donde vive la invariante de
   publicación (ADR-0003, requisito 2 de CIF-243); y los códigos de error nuevos obligan, **por
   compilación**, a tocar `src/app/api/_lib/http.ts`, `src/i18n/domain-errors.ts` y las traducciones
   `DomainErrors.*` de `messages/*.json`.
5. ADR-0023 §4 dejó `src/application/**`, `src/infrastructure/**`, `src/composition/container.ts`,
   `prisma/**` y `scripts/**` fuera del alcance de la fase 1. El modelo de escritura y la invariante de
   publicación necesitan esos caminos autorizados de forma explícita.

## Decisión

1. **Split de CIF-126 en dos tareas**, con CIF-126 como paraguas cancelada por quedar cubierta:

   - **CIF-126a — modelo de escritura compartido** (item 2 de CIF-126; tarea CIF-483): puertos de
     escritura en `src/application/ports`, casos de uso de _upsert_ en `src/application/use-cases` y
     adaptadores Prisma y en memoria, idempotentes por `code` (series, acabados, complementos) y
     `(finishId, code)` (colores), incluidos los textos multi-idioma de `catalog_text`. Tests con
     catálogo sintético. **No depende de CIF-114.**
   - **CIF-126b — carga inicial** (items 1, 3, 4, 6 y 7; tarea CIF-484): landing del ADR-0017 en
     `docs/adr`, CLI `scripts/import-catalog.ts`, validación Zod del fichero, procedimiento en
     `docs/despliegue.md` y verificación posterior. **Sigue bloqueada por CIF-114**, más el bloqueo
     técnico de CIF-126a, cuyos casos de uso consume.

2. **Orden respecto a CIF-243: la fase 3 se bloquea por CIF-126a, no por CIF-126.** CIF-126a es dueña de
   `src/composition/container.ts` y de `src/application/use-cases/publish-tariff-version.ts` hasta que su
   PR fusione; CIF-243 no arranca antes de ese merge. Es una secuencia deliberada para evitar las
   colisiones del contexto, no un gate de negocio: CIF-126a no tiene ninguna puerta de negocio delante y
   puede empezar en el mismo heartbeat.

3. **Frontera de ficheros compartidos (corrige H1 y H2).** Quedan reservados a **CIF-126a**:

   - `src/composition/container.ts` y `src/application/use-cases/publish-tariff-version.ts`.
   - `src/app/api/_lib/http.ts`, porque `STATUS_BY_CODE` es un `Record<DomainErrorCode, number>`
     exhaustivo y los códigos nuevos (`CONFLICT`, `SERIES_IN_USE`, `ITEM_IN_USE`, `EMPTY_PRICE_TABLE`,
     `TARIFF_NOT_EDITABLE`) no compilan sin él.
   - `src/i18n/domain-errors.ts` y las claves `DomainErrors.*` de `messages/es.json` y `messages/en.json`
     (`src/i18n/messages.test.ts` exige una traducción por código).
   - `src/app/api/admin/tariff-versions/[id]/publish/route.test.ts`: **único** fichero de
     `src/app/api/admin/**` que no es de CIF-243, porque la invariante nueva cambia el contrato del
     endpoint existente a `409 EMPTY_PRICE_TABLE`.

   Quedan para **CIF-243**, y siempre después del merge de CIF-126a: el resto de `src/app/api/admin/**`,
   `src/ui/admin/**`, las claves `CatalogAdmin.*` de `messages/*.json` y los specs **nuevos** de `e2e/`
   (en particular `e2e/admin-write.spec.ts`). Para **CIF-126b**: `scripts/**`, `docs/adr/0017-*` y
   `docs/despliegue.md`.

   Nota de coordinación: `src/composition/container.ts`, `playwright.config.ts` y `e2e/support/**` los ha
   tocado también CIF-436 (`catalog-empty`, rama `test/cif436-e2e-catalogo-vacio`, `107a65f`). Su tercer
   `webServer` con `CATALOG_DEMO_EMPTY` **no se revierte**: resuelve otro problema y es compatible con
   esta decisión.

4. **Ampliación explícita de ADR-0023 §4.** Quedan autorizados, dentro de sus tareas y con alcance
   aditivo siempre que sea posible:

   - **CIF-126a:** `src/application/**`, `src/infrastructure/**`, `src/composition/container.ts`,
     `src/domain/**`, `prisma/**` (solo migración aditiva y reversible, ADR-0008), y los cuatro puntos de
     borde del apartado 3 (`src/app/api/_lib/http.ts`, `src/i18n/domain-errors.ts`, claves
     `DomainErrors.*` de `messages/*.json`, `src/app/api/admin/tariff-versions/[id]/publish/route.test.ts`),
     con sus tests.
   - **CIF-243:** `src/app/api/admin/**` (menos el route test reservado a CIF-126a), `src/ui/admin/**`,
     claves `CatalogAdmin.*` de `messages/*.json` y `e2e/admin-write.spec.ts`.
   - **CIF-490 (DevOps, arnés del E2E):** `.github/workflows/ci.yml` (job `e2e`),
     `playwright.config.ts` y `e2e/support/**`.

   Cualquier otro fichero requiere volver a pasar por el CTO. `scripts/**` sigue reservado a CIF-126b.

5. **Invariante de publicación compartida (ADR-0003, requisito 2 de CIF-243 y criterio añadido de
   CIF-9).** Una versión de tarifa **sin tabla de precios no se publica**: la serie queda en borrador y
   pasa a presupuesto manual. La invariante de dominio (`EmptyPriceTableError`) en el caso de uso es de
   **CIF-126a**; el aviso explícito en el panel y sus tests son de **CIF-243**. Barrera solo de UI no es
   suficiente: se exigen las dos. Las invariantes se evalúan antes de escribir, de modo que la fila queda
   intacta si alguna salta (mismo patrón que `AmbiguousTariffError`).

6. **E2E del flujo 3 (cambiar un precio en el panel y verlo en el configurador; corrige H3 y H6).**
   Dirección decidida: **(a) PostgreSQL efímero en el job `e2e`**, con la suite en modo `prisma` migrada y
   sembrada por ejecución. Se descarta **(b)** un único `webServer` con store en memoria compartida
   porque no ejercitaría los adaptadores reales que sirve producción y porque el store en memoria vive
   **por proceso**: en el E2E los dos `webServer` son procesos distintos y en Vercel cada ruta es una
   función distinta, así que la escritura del panel no llegaría a la web pública (ADR-0013 §8,
   ADR-0026 §2). **El cambio concreto no era de CIF-436**: CIF-436 cubre `catalog-empty` y lo resolvió con
   un tercer `webServer` en memoria, que es otro problema y se conserva. El dueño es **CIF-490** (DevOps),
   con autorización sobre `.github/workflows/ci.yml`, `playwright.config.ts` y `e2e/support/**` según el
   apartado 4. CIF-243 no queda bloqueada por CIF-490 —puede construir la UI, sus unitarios y el resto de
   specs—, pero su requisito 3 (flujo 3) no puede estar en verde hasta que CIF-490 fusione.

7. **Sin datos reales.** El modelo de escritura, sus tests, el arnés de CIF-490 y este ADR usan catálogo
   sintético; los datos del propietario están fuera del repositorio y nunca se versionan (ADR-0014 §1,
   ADR-0017 §2).

## Consecuencias

- El modelo de escritura se construye y se prueba ya; CIF-9 y CIF-243 dejan de depender de una decisión
  de negocio parada y el MVP recupera su último tramo de frontend.
- La invariante de publicación existe en el dominio **antes** de que la UI pueda confiar en ella, que era
  el orden correcto y el que ADR-0023 §7 no garantizaba.
- La frontera de ficheros del apartado 3 es la completa, no una aproximación: incluye los puntos de borde
  que los códigos de error nuevos obligan a tocar. CIF-243 arranca después del merge de CIF-126a, así que
  el reparto no genera conflictos de fusión, solo dueños claros.
- CIF-126b conserva el gate de CIF-114 sin relajarlo: ni el CLI, ni el ADR-0017, ni el procedimiento de
  carga se escriben antes de que exista la decisión de negocio.
- Coste asumido: el modelo de escritura se diseña sin el catálogo real delante. Se mitiga con _upsert_
  idempotente por `code`, tests sintéticos y `--dry-run` por defecto en el CLI de CIF-126b.
- Coste de secuencia: CIF-243 espera al merge de CIF-126a (no a CIF-114). Es un retraso acotado y
  preferible a editar `container.ts` y el caso de uso de publicación en paralelo.
- Riesgo asumido: si la decisión de CIF-114 cambia el formato del catálogo, la parte de carga
  (CIF-126b) puede necesitar ajustes; al ser idempotente por `code` y aditivo, el ajuste es local.

## Puntos revisados que no se aceptan

- **H5 — el gate de CIF-126b es algo más ancho de lo justificado.** Cierto en parte: el mecanismo, los
  flags y el `--dry-run` ya están fijados por ADR-0017 §3/§5/§6, así que dentro del gate no queda trabajo
  de diseño. Se mantiene el gate sobre el conjunto (landing del ADR-0017, CLI, Zod y procedimiento)
  **como una unidad** porque el formato y las columnas del fichero de carga forman parte de la respuesta
  de negocio de CIF-114: documentar un procedimiento de carga para un formato sin confirmar produciría
  documentación que habría que reescribir. Lo que se corrige es la afirmación: el gate no cubre «todo lo
  que no depende de la decisión de negocio», cubre la carga inicial completa. CIF-126b arranca sin trabajo
  de diseño pendiente el día en que CIF-114 se resuelva.

## Alternativas consideradas

- **Mantener el gate completo.** Deja la última pieza del MVP esperando semanas a una decisión que no es
  técnica; es exactamente lo que ADR-0023 §8 ya rechazó para la lectura.
- **Publicar solo los puertos de escritura (tipos, sin comportamiento).** Permite a CIF-243 compilar
  contra un contrato, pero le obliga a construir la UI contra casos de uso no implementados y a rehacer
  la integración; no da nada verificable end-to-end. Rechazada.
- **Reservar `container.ts` a CIF-243 y dejar el modelo de escritura fuera de la raíz de composición.**
  El modelo quedaría sin cablear y sin poder probarse de forma integrada, contra ADR-0001.
- **Decidir el split sin fijar dueño de los ficheros compartidos.** Es la fuente de conflicto ya
  identificada; se descarta por eso la secuencia explícita del apartado 2 y la frontera del apartado 3.
- **Un único `webServer` con store en memoria (opción b del E2E).** Ya considerada y descartada en el
  apartado 6: no ejerce los adaptadores reales y el store no se comparte entre procesos ni entre
  funciones de Vercel (ADR-0013 §8, ADR-0026 §2).
