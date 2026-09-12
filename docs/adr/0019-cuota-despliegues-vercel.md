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
