# ADR-0019 — Mitigación de la cuota diaria de despliegues del plan gratuito de Vercel

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (CIF-151), con la medición y la propuesta de DevOps en CIF-149
- **Ámbito:** despliegue, operación y coste

## Contexto

El plan gratuito de Vercel limita a **100 despliegues cada 24 h y por cuenta**
(`api-deployments-free-per-day`). El proyecto `presupuesto-cifuentes` la agotó el 2026-09-12: DevOps
midió con la API **111 despliegues en 24 h** (82 de _preview_ y 29 de producción), la API devolvía
`remaining: 0` y `reset: 2026-09-13T01:02:56Z`. La ventana es **rodante**, no de día natural: a las
00:56Z el límite bloqueaba y a las 01:01Z ya había un hueco libre.

Consecuencias observadas, no hipotéticas:

1. `main@15b477a` (merge del ADR-0018, CIF-140) se quedó **sin despliegue de producción**: el check
   `Vercel` del commit quedó en `failure` con `Deployment rate limited — retry in 24 hours`. Producción
   siguió sirviendo el deployment anterior hasta que DevOps lo relanzó a mano (`READY`,
   `GET /api/health` 200).
2. El PR #34 (`ca599a3`, CIF-144) se quedó **sin preview**.

El consumo lo generan las dos vías normales de ADR-0007 y `docs/despliegue.md`: **un preview por push
a una rama con PR** y **un despliegue de producción por merge a `main`**. En las 24 h de la medición
`main` avanzó 31 veces (todos _squash_ de PR) y hubo 6 ramas remotas activas; a eso se suman los push
repetidos sobre la misma rama (rebase, _amend_, correcciones) y los relanzamientos manuales, que crean
un despliegue nuevo cada uno.

Restricciones de la decisión:

- El plan gratuito es suficiente para el MVP (`docs/operacion.md`) y **no se contrata nada de pago sin
  aprobación explícita**.
- La [Definition of Done](../definition-of-done.md) y el flujo de cambio (`docs/despliegue.md` §2)
  exigen que QA valide el PR en su URL de preview: **no se puede quitar el preview de las ramas con
  código**.

**Hecho verificado sobre el _Ignored Build Step_** (la mitigación que proponía la opción B original):
**no ahorra cuota**. La documentación oficial sitúa la ejecución del comando cuando «your deployment
enters the `BUILDING` state» (`/docs/project-configuration/project-settings#ignored-build-step`), y la
guía oficial del campo muestra el caso de omisión imprimiendo `🛑 - Build cancelled`
(`/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel`): el despliegue **se crea**, entra en
cola y se cancela después. Un `ignoreCommand` que salga con 0 ahorra minutos de build, no
despliegues. La única palanca que evita el consumo es **no crear** el despliegue.

## Decisión

1. **A — Runbook de reintento (aceptada, coste 0).** El fallo por cuota deja de ser silencioso: el
   procedimiento de detección, reintento y verificación queda en `docs/despliegue.md` §4.1. **Un merge
   a `main` no se da por desplegado hasta que su deployment está `READY` y `/api/health` responde
   200**, aunque los checks obligatorios estén verdes.
2. **B — Reducir el consumo por la vía que evita crear el despliegue (aceptada, coste 0).** `vercel.json`
   versionado con `git.deploymentEnabled` apagando el despliegue de las ramas que **nunca** llevan
   código de la aplicación y por tanto **no necesitan preview**: `dependabot/**` (los PR de Dependabot
   los validan `calidad` y `e2e`, `docs/despliegue.md` §7) y `archive/**` (ramas ya archivadas).
   `main` y las ramas de trabajo (`feat/**`, `fix/**`, `docs/**`, `ci/**`, `chore/**`) **siguen
   generando despliegue**: el campo admite globos (minimatch) y toda rama no listada conserva el
   despliegue por defecto.
3. **El `vercel.json` no es un fichero suelto: lo vigila un test.** `src/config/vercel-config.test.ts`
   falla si alguien apaga `main`, si aparece un comodín global (`"*": false`) que dejaría a QA sin
   previews, si se apaga una rama fuera de la lista blanca de ADR-0019 o si se cuela un
   `ignoreCommand` como si ahorrara cuota. Cambiar el reparto de ramas obliga a cambiar el test y, con
   él, a justificarlo.
4. **No se apaga todavía el preview de las ramas `docs/**`.** El ahorro es real (son PR frecuentes),
   pero una rama mal etiquetada ocultaría el preview de un cambio de código. Hasta que exista una
   guarda de contenido en `calidad` — que falle si una rama `docs/**` toca algo fuera de `docs/**` y
   `**/*.md` — la convención no se usa como criterio de despliegue. Se decide en la revisión de 7 días
   (punto 7), con esa guarda como prerrequisito.
5. **Reglas de consumo para todo el equipo.** Un push = un preview: los cambios de una rama se agrupan
   y se empujan cuando están listos para revisión, no en cada iteración. No se relanza un despliegue si
   el del mismo commit ya está en cola, construyendo o listo. Los reintentos por cuota siguen el
   runbook §4.1 y se anotan en la tarea de Paperclip.
6. **C — Plan de pago: aplazada, no descartada.** No se contrata ahora. Se escala al CEO, con el
   consumo medido y esta decisión como contexto, **solo si** tras A + B vuelve a quedarse sin
   despliegue de producción un merge de `main`, o si el consumo sigue por encima de 100 despliegues en
   dos ventanas consecutivas de 24 h.
7. **Revisión con datos a los 7 días.** DevOps vuelve a medir el consumo (despliegues por rama y por
   entorno en 24 h) y contrasta el ahorro real de B antes de dar la mitigación por suficiente, y decide
   con esos números si amplía B a `docs/**` con la guarda del punto 4 (tarea hija de CIF-151).

## Revisión de 7 días (2026-09-12): B se amplía a `docs/**`

La revisión con datos del punto 7 se hizo en **CIF-153** y decidió **ampliar B al preview de
`docs/**`**, con la guarda de contenido del punto 4 como prerrequisito ya satisfecho (**CIF-155**). Este
apartado **actualiza** la decisión sin reescribir los puntos aceptados.

- **Números de la revisión** (ventana = vida del proyecto, `2026-09-11T17:17:31Z` →
  `2026-09-12T01:31:29Z`): **113** despliegues (83 preview + 30 producción). Con B solo: 113 − 8 =
  **105 > 100**. Con B + `docs/**`: 113 − 16 = **97 < 100**. Ahorro neto realista de `docs/**`: **8
  (7,1 %)**, no 10: 2 de los previews «docs» eran de una rama `docs/cif34-...` que sí tocó código y que
  con la guarda habría tenido que llamarse `ci/**`.
- **La guarda existe y muerde**: `scripts/docs-preview-guard.sh` (job `calidad` de
  `.github/workflows/ci.yml`) falla si una rama `docs/**` toca algo fuera de `docs/**` y `**/*.md`.
  `scripts/docs-preview-guard.test.sh` cubre los casos y **mata la mutación** de la comprobación.
- **`vercel.json`** añade `"docs/**": false` y `src/config/vercel-config.test.ts` fija la lista blanca
  nueva (`archive/**`, `dependabot/**`, `docs/**`).
- **C sigue aplazada**: se escala al **CEO** si, tras A + B, vuelve a quedarse sin despliegue de
  producción un merge a `main`, o si el consumo sigue por encima de 100 despliegues en dos ventanas
  consecutivas de 24 h.
- **Medición de contraste pendiente** (CIF-155, punto 6): ≥24 h después del merge y con al menos un
  push a `docs/**`, medir la ventana rodante y comprobar **0 despliegues** de `dependabot/**`,
  `archive/**` y `docs/**`.

## Escalada al mando (2026-09-13): la condición del punto 6 se cumple tras A + B

Con A (runbook §4.1) y B (`vercel.json` con `archive/**`, `dependabot/**` y `docs/**`) en vigor, **un
merge a `main` volvió a quedarse sin despliegue de producción**: es exactamente el supuesto que el
punto 6 manda escalar. La escalada la resolvió el **CTO** en CIF-536 —el CEO está sin heartbeat
(CIF-405)—; la decisión de gasto (C) queda **elevada al board**, que es quien puede aprobarla. La
corrección de DevOps en CIF-536 (00:10Z) reencuadra el incidente: **el paso A del runbook reparó el
hueco cinco minutos después**, así que lo que queda abierto es la política de cuota, no una
producción desactualizada.

### Cronología y medición (DevOps, CIF-530 y CIF-536)

- **23:52Z — merge del PR #94 (`main` = `5c0afcbf…`).** El check `Vercel` de ese commit queda en
  `failure`: «Deployment rate limited — retry in 24 hours» (`api-deployments-free-per-day`). Cuatro
  `POST /v13/deployments` (`gitSource` de `main`, `target=production`) entre 23:52Z y 00:05Z
  devuelven **cuatro `402 payment_required`**. Entre las 23:52Z y las 23:57Z producción sirve el
  commit anterior, `a112a2d`.
- **23:57:33Z — el paso A del runbook repara el hueco.** En cuanto la ventana rodante libera un
  cupo, el relanzamiento por API deja el deployment de `5c0afcb` **`READY` y con el alias de
  producción** (`targets.production`). Producción estuvo **~5 minutos** por detrás de `main`, no
  horas: el hueco no acumuló contenido y el release quedó verificado contra la API de Vercel, no
  contra una sonda de salud (DevOps, CIF-530 y CIF-536).
- **00:06Z — `main` avanza otra vez (`7f92ff7`, PR #87).** Ese release queda pendiente mientras la
  ventana siga agotada; lo cubre el mismo paso A en el siguiente reintento de la rutina **horaria**
  `b3ce0dae…` (CIF-530). El diff de `7f92ff7` es solo `docs/**` y `e2e/**`: no cambia runtime.
- **87 despliegues** del proyecto contados con `GET /v6/deployments` en la ventana rodante; el límite
  informa `{total: 100, remaining: 0, reset: 2026-09-13T23:56:31Z}`. La ventana que agotó el contador
  y la rodante de 24 h **no son la misma**: la comparación 87 vs 100 **no mide una subestimación**,
  mide desalineación de ventana. Lo único cierto por construcción es que el listado directo es una
  **cota inferior**, porque los despliegues borrados desaparecen de `v6/deployments`; su magnitud
  queda como **hipótesis sin cifra** hasta que se publiquen el recuento por ventana candidata y el
  instante de la lectura (pedido en CIF-537).
- `/api/health` respondió **200** (`status: ok`, `database: ok`) durante el hueco (23:52Z–23:57Z):
  era la sonda del commit viejo.

Con las mediciones anteriores (111/24 h en CIF-149; 113 en la vida del proyecto en CIF-153), el
consumo de régimen se mueve **entre 87 y 111 despliegues al día contra un techo de 100**. No es un
pico: es el techo estructural del ritmo de entrega actual (≈30 merges a `main` al día, un preview por
push de rama).

### Decisión (CTO, CIF-536)

1. **(a) se mantiene.** A + B siguen siendo la postura: producción puede ir unas horas por detrás de
   `main`, con el runbook §4.1 y la rutina de reintento horaria (CIF-530) verificando el release. No se
   despliega otra rama ni otro commit para «dar el release por bueno». El retraso **no acumula
   contenido**: cuando la ventana libera, un solo despliegue del `main` vigente pone al día todo lo
   pendiente, así que el coste de (a) es latencia de release, no divergencia.
2. **(b) se amplía con números, no a ojo.** El ahorro de B es real pero moderado: recortar clases de
   rama menores no baja de 100 los 87–111 despliegues/día. Antes de apagar el preview de una clase
   nueva (`ci/**`, `test/**`, `devops/**`, `chore/**`) hacen falta las dos cosas que el punto 4 ya
   exigió para `docs/**`: **medición por clase y por entorno** en la ventana rodante (DevOps,
   CIF-537) y una **guardia de contenido** que falle si la rama toca código de la aplicación. La
   lista de clases la decide el CTO con esos números, en ≤7 días.
3. **(c) se eleva al board**, con la recomendación del CTO de **contratarla** si el board quiere
   quitar el techo. El plan Pro lleva el límite a **6.000 despliegues/día** (_Deployments Created per
   Day_ en la tabla oficial de límites de Vercel: Hobby 100 / Pro 6000) y cuesta una cuota mensual
   por usuario, que hay que confirmar en el panel antes de contratar. No la contrata ningún agente:
   requiere aprobación explícita de coste (punto 6). La tarjeta está abierta en CIF-536.
4. **Lo que no se toca:** no se apaga el preview de `main` ni el de las ramas con código, y siguen
   descartados `ignoreCommand` y los comodines globales (`"*": false`), por las razones de los
   puntos 3 y 4 y de las alternativas de abajo.

### El paso 4 del runbook se endurece: un `200` no prueba que el release aterrizó

El incidente deja una lección que entra en `docs/despliegue.md` §4.1: entre las 23:52Z y las 23:57Z
producción sirvió `a112a2d` con `/api/health` en **200** mientras `main` era `5c0afcb`. **La sonda de
salud no distingue un commit de otro**, así que por sí sola no cierra la verificación del release (en
ese hueco habría dado por bueno el commit viejo). La prueba es el **sha del commit del deployment de
producción** (`meta.githubCommitSha`) igual al de `main`, **y** el `200` de salud sobre esa URL.

### Revisión

- (a) y (b) se revisan en ≤7 días con la medición de CIF-537 (mismo patrón que el punto 7).
- (c) queda a la espera de la respuesta del board en CIF-536. Si el consumo de régimen sigue por
  encima de 100 en dos ventanas consecutivas de 24 h, la recomendación al board pasa a ser contratar
  el plan de pago, con o sin ampliación de B.

## Consecuencias

- Producción puede seguir quedándose unos minutos (u horas) por detrás de `main` cuando la cuota se
  agota, pero deja de quedarse atrás **en silencio**: el runbook lo detecta, lo repara y lo exige.
- Los PR de Dependabot y las ramas archivadas dejan de gastar un despliegue cada uno sin perder
  validación (la puerta requerida sigue siendo `calidad` + `e2e`, y el `vercel.json` no toca el build).
- El ahorro es moderado y **medible**: no elimina el techo. Si el ritmo de merges a `main` se mantiene
  en ~30 al día, el margen seguirá siendo estrecho y la ampliación de B (o C) volverá a la mesa.
- Trabajo generado: `vercel.json`, su test de guarda, la medición de contraste y la publicación de este
  ADR con el runbook.

## Alternativas consideradas

- **`ignoreCommand` / Ignored Build Step (descartada).** No evita el despliegue: se crea y se cancela.
  Ver el hecho verificado del contexto.
- **Apagar el preview de `docs/**` sin guarda de contenido (aplazada).** Es donde está el ahorro
  grande, pero traslada a la convención de nombres un riesgo que hoy no comprueba nadie: se decide con
  la medición de 7 días y con la guarda como prerrequisito (punto 4).
- **Plan Pro de Vercel (aplazada).** Amplía el límite (6000/día) y cuesta dinero; el plan gratuito
  sigue siendo suficiente si A + B funcionan. Requiere aprobación de coste (punto 6).
- **Desplegar desde GitHub Actions o desactivar los previews de todas las ramas.** Descartado: rompe
  el pipeline único de ADR-0007 y deja a QA sin URL de preview (Definition of Done).
- **Bajar la frecuencia de merges a `main` para reducir los despliegues de producción.** Descartado
  como norma: frenaría la entrega y el propio flujo de PR pequeño y revisable; el punto 5 ya ataca el
  consumo que sí es evitable.
