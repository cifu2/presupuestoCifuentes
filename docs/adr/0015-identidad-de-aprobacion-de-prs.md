# ADR-0015 — Identidad de aprobación de PRs (machine user) y rotación de su token

- **Fecha:** 2026-09-12
- **Estado:** Aceptado (la provisión de la cuenta es el bloqueo declarado en CIF-105; dueño: board)
- **Decide:** CTO, a propuesta de DevOps
- **Ámbito:** revisión de PRs, puerta de calidad, permisos de GitHub Actions, secretos de operación

## Contexto

La Definition of Done exige **revisión de otro agente** y [CONTRIBUTING](../../CONTRIBUTING.md) lo
concreta: «el autor no se auto-aprueba». En GitHub eso significa una revisión `APPROVED` de una
identidad distinta de la del autor. Hoy no existe:

- El repositorio es de `cifu2` y `cifu2` es el autor de **todos** los PRs (los agentes operan con su
  PAT, secreto `github/devops-token`). `POST /pulls/:n/reviews {event: "APPROVE"}` devuelve
  `422 Can not approve your own pull request` y `GET /collaborators` solo devuelve `cifu2`.
- En CIF-99/CIF-103 se usó una salida de emergencia: un workflow de un solo uso en una rama temporal
  publicó el veredicto como `github-actions[bot]`, con `can_approve_pull_request_reviews = true`
  habilitado mientras corría. Tiene tres problemas: la autoría es de un **bot de automatización** (no
  es un revisor independiente), el ajuste necesario permite que **cualquier** workflow del
  repositorio apruebe PRs, y hay que repetir el parche en cada PR.
- Una **GitHub App** no sirve: sus tokens de instalación solo pueden crear revisiones de comentario;
  una revisión que aprueba exige un token de **usuario**. La salida durable es una _machine user_.
- La protección de `main` exige los dos checks de CI y `enforce_admins`, pero **no** exige
  revisiones aprobatorias: la aprobación es una regla de proceso de CifuCorp, no un candado de
  GitHub. Por eso la evidencia debe ser un artefacto real y auditable, no un acuerdo informal.

## Decisión

1. **Identidad dedicada.** Se crea la cuenta de usuario `cifucorp-review-bot` (machine user: sin
   acceso al correo del propietario ni a otros repositorios) y se añade como **colaboradora con
   permiso de escritura** en `cifu2/presupuestoCifuentes`. No se le da `admin`.
2. **Token.** PAT **clásico con alcance `public_repo`** (el repositorio es público; si dejara de
   serlo, `repo`), caducidad ≤ 90 días. Un PAT _fine-grained_ tiene restricciones para acceder a
   recursos de otra cuenta, así que no aporta nada aquí y complica el alta.
3. **Dónde vive.** Solo en el gestor de secretos de Paperclip, como secreto
   `github/review-bot-token` con binding `env.GITHUB_REVIEW_BOT_TOKEN` al agente que revisa
   (DevOps, y QA si revisa). **Nunca** en Vercel, en GitHub Actions, en el repositorio ni en
   comentarios o documentos ([ADR-0014](0014-manejo-y-rotacion-de-secretos.md)).
4. **La puerta se queda cerrada.** `can_approve_pull_request_reviews` permanece en `false` y
   `default_workflow_permissions` en `read` de forma permanente. La aprobación se registra con la
   machine user vía API (`POST /repos/:owner/:repo/pulls/:n/reviews`, `event: APPROVE`), nunca con
   `github-actions[bot]`.
5. **Guardia automática.** `scripts/approval-guard.sh` con su test `scripts/approval-guard.test.sh`
   se ejecuta en la puerta `calidad`: ningún workflow puede pedir escritura sobre PRs
   (`pull-requests: write`), ni `permissions: write-all`, ni llamar al API de revisiones con
   `event: APPROVE`, ni usar `gh pr review --approve`; en modo operación (`--require-api`) además
   verifica los dos ajustes del repositorio. El CI lo ejecuta en modo `--static-only`, que no
   necesita token.
6. **Quién aprueba.** Un agente distinto del autor del PR, con esta identidad. Arquitectura,
   contratos públicos, datos o seguridad los aprueba además el CTO
   ([CONTRIBUTING](../../CONTRIBUTING.md)).
7. **Rotación y revocación.** Cada ≤ 90 días o ante cualquier sospecha de filtración, en el orden de
   ADR-0014 (apartado 5.5): emitir la nueva en GitHub → registrarla en Paperclip y actualizar el
   binding → verificar con `scripts/approval-guard.sh --require-api` y una aprobación de prueba →
   revocar la vieja → comprobar que la vieja ya no sirve (401). Si se pierde el control de la
   cuenta, se retira la colaboración (`DELETE /repos/:owner/:repo/collaborators/cifucorp-review-bot`).
   Emitir y revocar el token exige la interfaz de la cuenta: es trabajo del board/operador, y la
   tarea queda con responsable y acción nombrados.
8. **Emergencia.** Sin la machine user disponible **no** se abre
   `can_approve_pull_request_reviews`. La única vía es la autorización explícita del CTO anotada en
   la tarea; el PR queda bloqueado hasta entonces. La excepción del workflow aprobador queda
   prohibida como método permanente.

## Consecuencias

- **Mejora:** la aprobación pasa a ser un artefacto de usuario real (autoría, fecha, commit),
  auditable con `GET /pulls/:n/reviews`, y deja de depender de una puerta abierta en Actions.
- **Mejora:** la puerta peligrosa queda cerrada de forma permanente y con guardia y test propios:
  si alguien vuelve a activarla o añade un workflow que aprueba, la puerta `calidad` falla.
- **Empeora:** hay una credencial de larga duración más que custodiar y rotar, y una cuenta que hay
  que crear y mantener (email + 2FA). Sin ella no hay aprobación válida: el alta es un bloqueo
  declarado con dueño (board), no un «ya se verá».
- **Coste:** ~1 s en el job `calidad`.

## Alternativas consideradas

- **GitHub App con `pull_requests: write`:** no puede enviar `APPROVE`; solo revisiones de
  comentario. Descartada (verificado en CIF-105).
- **`github-actions[bot]` con `can_approve_pull_request_reviews = true`:** la salida de emergencia de
  CIF-103. No es un revisor independiente y deja la puerta abierta a cualquier workflow del
  repositorio. Prohibida como método permanente.
- **Auto-aprobación:** GitHub la rechaza (422) y la regla de la empresa es que el autor no se
  aprueba. No es una opción.
- **Que apruebe el propietario humano (`cifu2`):** no escala (es el autor de todos los PRs), ata la
  puerta a la disponibilidad de una persona y no aporta revisión técnica.
- **PAT fine-grained de la machine user:** restricciones de acceso a repositorios de otra cuenta; el
  clásico `public_repo` cubre el caso con menos fricción y menos piezas que explicar.
- **Aprobar solo en Paperclip, sin artefacto en GitHub:** pierde el rastro auditable que pide la DoD.
  Se mantiene únicamente como camino de emergencia.
