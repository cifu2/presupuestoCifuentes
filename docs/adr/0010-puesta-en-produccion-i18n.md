# ADR-0010 — Puesta en producción de la i18n mediante el PR #6 (rebase sobre `main`)

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO (desbloquea CIF-28; ejecuta DevOps)
- **Ámbito:** entrega y despliegue del multi-idioma (ADR-0005): ramas, PR, puertas y verificación en producción

## Contexto

El multi-idioma de interfaz (CIF-8), canónicas y `hreflang` (CIF-18), persistencia del idioma (CIF-20)
y el 404 global traducido (CIF-17) existían solo en ramas locales antiguas: `main` en GitHub no los
tenía y producción tampoco. CIF-28 abrió tres vías —fusionar con rebase, esperar o re-entregar desde
las ramas originales— y pidió al CTO decidir cuál y con qué prioridad.

El mecanismo ya está montado y verificado:

- PR #6 (`feat/cif28-reconciliar-i18n` → `main`, 26 ficheros, +1220/−62), con los 4 commits rebasados
  sobre `3ed18e7` **sin reescribir la rama protegida**.
- Puerta de calidad en verde (`calidad` y `e2e`, run `34629173023`).
- Vista previa de Vercel comprobada: `/` → `/es` con cookie `NEXT_LOCALE`, `/en` traducido, 404 global
  con estado 404 y `lang` correcto, `/api/health` en 200.
- **Sin migraciones de esquema**: el diff no toca `prisma/`, así que no hay paso de release ni riesgo
  de incompatibilidad hacia atrás.

## Decisión

1. **El multi-idioma entra en producción ahora**: se fusiona el PR #6 en cuanto QA apruebe la revisión
   de otro agente (CIF-30) y el CI siga en verde sobre el mismo commit. **No se espera** a una fecha
   posterior y **no se re-entrega** desde `feat/cif8-i18n` / `fix/cif17-404`.
2. **El rebase es el mecanismo válido de reconciliación.** Las ramas originales se conservan como
   histórico, pero no se vuelven a abrir PRs desde ellas: ya están contenidas, commit a commit, en la
   rama del PR.
3. **Puertas obligatorias antes del merge** (Definition of Done):
   - `calidad` y `e2e` en verde sobre el commit que se fusiona (si DevOps añade commits, se repiten).
   - Revisión de otro agente registrada en la incidencia: QA en CIF-30 (ni Frontend, autor de CIF-8,
     ni CTO, autor de CIF-17/18/20).
   - Conversación del PR resuelta y sin conflictos con `main`.
4. **Ejecuta DevOps**: hace el merge, comprueba el despliegue de producción y, si algo no cuadra,
   aplica el rollback.
5. **Verificación en producción tras el despliegue** (mínimo): `/` → 307 a `/es` con `NEXT_LOCALE`,
   `/es` y `/en` con `<html lang>` correcto y texto traducido, ruta inexistente → 404 traducido,
   `/api/health` en 200 con `environment: production`.
6. **El registro de la decisión vive aquí**: el ADR-0010 se versiona en el repositorio, en un PR de
   documentación, sin tocar el commit ya revisado por QA.

## Consecuencias

- Se cierra la divergencia entre el trabajo local y `main`; el MVP recupera un requisito del alcance
  (multi-idioma) y deja de acumular deuda de reconciliación.
- El despliegue es un cambio **visible para el cliente**: producción pasa a servir `/es` (por defecto)
  y `/en` con redirección desde la raíz. Es el comportamiento aprobado en ADR-0005.
- Marcha atrás barata: revertir el merge en `main` o promover el deployment anterior en Vercel
  (procedimiento ya probado en CIF-25). No hay migración de datos que deshacer.
- Queda pendiente de negocio (CIF-13) la lista definitiva de idiomas y la revisión humana de los
  textos legales por idioma; no bloquea la entrega técnica del MVP.
- Añadir un idioma nuevo sigue siendo un fichero de mensajes: el diseño de ADR-0005 no cambia.

## Alternativas consideradas

- **B. Esperar** con el PR abierto: descartada. El coste de esperar (divergencia creciente,
  re-rebases y un requisito del MVP sin desplegar) es mayor que el riesgo, ya cubierto por la puerta
  de calidad, la revisión de QA y el rollback.
- **C. Re-entrega desde las ramas originales**: descartada. Tira trabajo ya verificado, obliga a
  repetir revisión y CI, y no aporta ninguna garantía adicional frente al PR rebasado.
