# ADR-0027 — Escritura de catálogo sin gate de negocio: split de CIF-126 y alcance de la fase 3 del panel

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (decisión de tablero en CIF-482; petición de Frontend en CIF-482, contexto CIF-9 /
  CIF-101 / CIF-126 / CIF-243 / CIF-114)
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
   casos de uso y adaptadores— es la misma clase de trabajo: no depende de *quién* aporta el catálogo ni
   en qué formato, sino de reglas de dominio que ya están decididas (ADR-0003, ADR-0008, ADR-0017 §8).
   Lo que sí depende de CIF-114 es la **carga inicial**: quién aporta el catálogo, en qué formato y con
   qué fecha (items 1, 3, 4, 6 y 7 de CIF-126).
3. Efecto verificado el 2026-09-12: CIF-126 `blocked` por CIF-114, con CIF-9 y CIF-243 detrás; la última
   pieza de frontend del MVP parada por una decisión no técnica, y producción sirviendo el configurador
   sin catálogo (CIF-381).
4. Existen dos colisiones de escritura verificadas entre CIF-126 y CIF-243: `src/composition/container.ts`
   es raíz de composición única (ADR-0001) y `src/application/use-cases/publish-tariff-version.ts` es
   donde vive la invariante de publicación (ADR-0003, requisito 2 de CIF-243).
5. ADR-0023 §4 dejó `src/application/**`, `src/infrastructure/**`, `src/composition/container.ts`,
   `prisma/**` y `scripts/**` fuera del alcance de la fase 1. El modelo de escritura y la invariante de
   publicación necesitan esos caminos autorizados de forma explícita.

## Decisión

1. **Split de CIF-126 en dos tareas**, con CIF-126 como paraguas cancelada por quedar cubierta:

   - **CIF-126a — modelo de escritura compartido** (item 2 de CIF-126; tarea CIF-483): puertos de
     escritura en `src/application/ports`, casos de uso de *upsert* en `src/application/use-cases` y
     adaptadores Prisma y en memoria, idempotentes por `code` (series, acabados, complementos) y
     `(finishId, code)` (colores), incluidos los textos multi-idioma de `catalog_text`. Tests con
     catálogo sintético. **No depende de CIF-114.**
   - **CIF-126b — carga inicial** (items 1, 3, 4, 6 y 7; tarea CIF-484): landing del ADR-0017 en
     `docs/adr`, CLI `scripts/import-catalog.ts`, validación Zod del fichero, procedimiento en
     `docs/despliegue.md` y verificación posterior. **Sigue bloqueada por CIF-114**, más el bloqueo
     técnico de CIF-126a, cuyos casos de uso consume.

2. **Orden respecto a CIF-243: la fase 3 se bloquea por CIF-126a, no por CIF-126.** CIF-126a es dueña de
   `src/composition/container.ts` y de `src/application/use-cases/publish-tariff-version.ts` hasta que su
   PR fusione; CIF-243 no arranca antes de ese merge. Es una secuencia deliberada para evitar las dos
   colisiones del contexto, no un gate de negocio: CIF-126a no tiene ninguna puerta de negocio delante y
   puede empezar en el mismo heartbeat.

3. **Ampliación explícita de ADR-0023 §4.** Quedan autorizados, dentro de sus tareas y con alcance
   aditivo siempre que sea posible:

   - **CIF-126a:** `src/application/**`, `src/infrastructure/**`, `src/composition/container.ts`,
     `src/domain/**` (solo si la invariante lo exige) y `prisma/**` (solo migración aditiva y reversible,
     ADR-0008), con sus tests.
   - **CIF-243:** `src/app/api/admin/**` (endpoints de escritura), `src/ui/admin/**`, `messages/*.json`,
     `e2e/**` y `playwright.config.ts`.

   Cualquier otro fichero requiere volver a pasar por el CTO. `scripts/**` sigue reservado a CIF-126b.

4. **Invariante de publicación compartida (ADR-0003, requisito 2 de CIF-243 y criterio añadido de
   CIF-9).** Una versión de tarifa **sin tabla de precios no se publica**: la serie queda en borrador y
   pasa a presupuesto manual. La invariante de dominio (`EmptyPriceTableError`) en el caso de uso es de
   **CIF-126a**; el aviso explícito en el panel y sus tests son de **CIF-243**. Barrera solo de UI no es
   suficiente: se exigen las dos. La publicación se realiza antes de escribir, de modo que la fila queda
   intacta si la invariante salta (mismo patrón que `AmbiguousTariffError`).

5. **E2E del flujo 3 (cambiar un precio en el panel y verlo en el configurador).** Dirección decidida:
   (a) PostgreSQL efímero en el job `e2e`, con la suite en modo `prisma` migrada y sembrada por ejecución
   —no (b) un único `webServer` con store en memoria compartida—, porque (b) no ejercitaría los
   adaptadores reales que sirve producción y contradice la dualidad de modos de ADR-0001 §4. El cambio
   concreto ya está identificado y con dueño (CIF-436, QA + DevOps); no se duplica aquí. El requisito 3
   de CIF-243 depende de su resultado.

6. **Sin datos reales.** El modelo de escritura, sus tests y este ADR usan catálogo sintético; los datos
   del propietario están fuera del repositorio y nunca se versionan (ADR-0014 §1, ADR-0017 §2).

## Consecuencias

- El modelo de escritura se construye y se prueba ya; CIF-9 y CIF-243 dejan de depender de una decisión
  de negocio parada y el MVP recupera su último tramo de frontend.
- La invariante de publicación existe en el dominio **antes** de que la UI pueda confiar en ella, que era
  el orden correcto y el que ADR-0023 §7 no garantizaba.
- CIF-126b conserva el gate de CIF-114 sin relajarlo: ni el CLI, ni el ADR-0017, ni el procedimiento de
  carga se escriben antes de que exista la decisión de negocio.
- Coste asumido: el modelo de escritura se diseña sin el catálogo real delante. Se mitiga con *upsert*
  idempotente por `code`, tests sintéticos y `--dry-run` por defecto en el CLI de CIF-126b.
- Coste de secuencia: CIF-243 espera al merge de CIF-126a (no a CIF-114). Es un retraso acotado y
  preferible a editar `container.ts` y el caso de uso de publicación en paralelo.
- Riesgo asumido: si la decisión de CIF-114 cambia el formato del catálogo, el modelo de *upsert* puede
  necesitar ajustes; al ser idempotente por `code` y aditivo, el ajuste es local.

## Alternativas consideradas

- **Mantener el gate completo.** Deja la última pieza del MVP esperando semanas a una decisión que no es
  técnica; es exactamente lo que ADR-0023 §8 ya rechazó para la lectura.
- **Publicar solo los puertos de escritura (tipos, sin comportamiento).** Permite a CIF-243 compilar
  contra un contrato, pero le obliga a construir la UI contra casos de uso no implementados y a rehacer
  la integración; no da nada verificable end-to-end. Rechazada.
- **Reservar `container.ts` a CIF-243 y dejar el modelo de escritura fuera de la raíz de composición.**
  El modelo quedaría sin cablear y sin poder probarse de forma integrada, contra ADR-0001.
- **Decidir el split sin fijar dueño de los ficheros compartidos.** Es la fuente de conflicto ya
  identificada; se descarta por eso la secuencia explícita del punto 2.
