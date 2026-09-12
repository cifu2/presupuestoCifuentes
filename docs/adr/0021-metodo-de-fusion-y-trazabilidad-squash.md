# ADR-0021 — Método de fusión y trazabilidad del gate en `main` (squash)

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (CIF-203); transcrito por DevOps en CIF-209
- **Ámbito:** proceso de cambio y release

## Contexto

El repositorio es **squash-only** por `scripts/github-bootstrap.sh` (`allow_squash_merge=true`,
`allow_merge_commit=false`, `allow_rebase_merge=false`) y `main` está protegida (checks `calidad` y
`e2e`, `strict`, `enforce_admins`). CIF-203 pidió fusionar el PR #41 «sin squash ni rebase» para que
el SHA revisado `f4d4e64` siguiera siendo ancestro de `main`; la instrucción era incompatible con la
política versionada (`PUT /pulls/41/merge` con `merge_method=merge` → **HTTP 405**). El merge acabó
como squash `f4a791c`: `f4d4e64` **no** es ancestro de `main`, pero
`tree(f4a791c) == tree(f4d4e64) == 28583f3e17b92d8b570dbd5f28f3b210f5ff3b44` y `calidad` + `e2e`
están en verde sobre ambos SHA.

## Decisión

1. En este repositorio la fusión a `main` es **siempre squash**. Ninguna tarea pide
   `merge_method=merge` ni rebase; si una tarea lo pide, el error es de la tarea, no del ejecutor.
2. **Trazabilidad del gate.** El commit resultante en `main` registra en su mensaje
   `Head revisado: <sha40>` y el run de CI. La fusión se acepta si y solo si:

   a. `tree(main@merge) == tree(head revisado)` (`git rev-parse <sha>^{tree}`);
   b. `calidad` y `e2e` verdes sobre el head revisado; y
   c. la decisión `approved` de la etapa de revisión queda registrada en la tarea de Paperclip.

3. `main` **no se reescribe**: no se añaden merge commits de seguimiento para «restaurar» la
   ancestría de un SHA ya revisado. El SHA revisado es inmutable y queda referenciado en el mensaje
   del squash.
4. Cambiar **temporalmente** un ajuste del repositorio (método de fusión, protección de rama)
   requiere autorización explícita del CTO, deja constancia en la tarea y **se verifica su
   restauración** contra `scripts/github-bootstrap.sh` antes de cerrar.
5. La Definition of Done **no se relaja**: sigue exigiendo tests, E2E y revisión de otro agente. Lo
   que se documenta es el método de fusión, no una rebaja de la revisión.

## Consecuencias

- La política del repositorio deja de ser un detalle del script de arranque y pasa a estar escrita:
  cualquier petición de `merge_method=merge` se rechaza citando este ADR, sin tocar la configuración.
- El rastro del head revisado vive en el **mensaje del commit de squash** (punto 2), porque el SHA
  revisado ya no será ancestro de `main`; la equivalencia de árbol es lo que permiten comprobar
  (punto 2a).
- **Guarda de la causa (CIF-209).** La restauración de los ajustes no depende de la memoria:
  `docs/despliegue.md` §2.1 fija el comando exacto, de solo lectura, que compara el estado vivo del
  repositorio (squash-only; `calidad` + `e2e`, `strict` y `enforce_admins`) con el contrato versionado
  de `scripts/github-bootstrap.sh` y falla con código 1 si divergen. Se elige ese paso de runbook
  —opción (a), la más barata— frente a un script con su test, para que el cambio sea solo de
  documentación y no genere preview de Vercel (ADR-0019).
- El punto 4 obliga a medir contra el script versionado, no contra lo que se recuerde: una
  activación temporal no se da por restaurada hasta que la guarda de §2.1 vuelve a salir en verde.

## Excepción que resuelve (CIF-203)

- **Motivo:** CIF-203 pidió `merge_method=merge`, incompatible con el ajuste versionado; el merge se
  hizo por squash con el árbol idéntico y el gate verde sobre el head revisado.
- **Riesgo asumido:** durante el incidente se activó y se restauró `allow_merge_commit` a mano, y un
  SHA revisado dejó de ser ancestro de `main`. Los dos quedan cubiertos por los puntos 2 (identidad
  de árbol + CI verde + aprobación registrada) y 4/guarda (la restauración se comprueba, no se
  recuerda).
- **Tarea hija que la resuelve:** CIF-209 (este ADR, el apartado de runbook de `docs/despliegue.md`
  §2.1 y la guarda de los ajustes). La excepción no se convierte en norma: la norma es el punto 1.

## Alternativas consideradas

- **Activar `allow_merge_commit` de forma permanente:** rompe la política probada del repositorio y
  un merge commit no aporta verificación adicional.
- **No fusionar:** deja trabajo aprobado y verificado sin entregar.
- **Abrir un PR nuevo con un merge commit de seguimiento:** consume cuota de despliegue y ruido de
  historia sin ganancia de verificación.
