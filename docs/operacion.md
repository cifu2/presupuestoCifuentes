# Base de datos, backups y monitorización

Operación del MVP: dónde vive la base de datos, cómo se protegen los datos, qué se vigila y cómo se
aprueban los PRs. Decisiones asociadas: [ADR-0007](adr/0007-despliegue-vercel-github.md),
[ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md) y
[ADR-0015](adr/0015-identidad-de-aprobacion-de-prs.md).

## 1. Base de datos gestionada

- **Neon (PostgreSQL gestionado)** a través de la integración de Vercel, sin contenedores ni
  servidores propios. Motivo y alternativas: [ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md).
- **Ramas de base de datos** en lugar de un único entorno compartido:
  - `production`: rama principal, la que consume producción.
  - `preview`: rama base de la que cada PR crea su copia _copy-on-write_ (la integración de Vercel
    crea la rama por PR y la borra al cerrarse).
  - `dev`: opcional, para desarrollo local contra datos no reales.
- La aplicación se conecta con un rol de base de datos de **privilegio mínimo** (solo DML sobre su
  esquema). El rol de administración se usa únicamente para migraciones y restauración.
- Las migraciones se aplican con el procedimiento explícito de
  [despliegue.md](despliegue.md), apartado 3.

## 2. Backups

| Mecanismo                                       | Cobertura          | Frecuencia / retención           | Responsable |
| ----------------------------------------------- | ------------------ | -------------------------------- | ----------- |
| Point-in-time recovery (PITR) de Neon           | rama `production`  | continua, ≥ 7 días               | DevOps      |
| Rama de snapshot antes de migración destructiva | rama `production`  | a demanda, se borra tras validar | DevOps      |
| `pg_dump` local puntual (opcional)              | catálogo y tarifas | antes de releases de datos       | DevOps      |

- **Antes de cada migración destructiva o de un cambio masivo de catálogo:** `CREATE BRANCH` en Neon
  (snapshot instantáneo) con nombre `pre-<release>-<fecha>`. Se documenta en la tarea y se borra al
  confirmar que el release es estable.
- **Prueba de restauración cada trimestre:** restaurar la rama `production` en un punto reciente a
  una rama de prueba, comprobar que el panel y el configurador leen datos, y anotarlo en la tarea de
  operación. Un backup sin restauración probada no se considera un backup.
- La restauración de PITR la decide el CTO (es irreversible respecto a los datos escritos desde el
  punto elegido) y se ejecuta desde la consola de Neon.

## 3. Monitorización

- **Salud de la aplicación:** `GET /api/health` devuelve `status`, `environment` y
  `database: "configured" | "unconfigured"`. `environment` sale de `VERCEL_ENV` (`production` o
  `preview`; `NODE_ENV` fuera de Vercel), así que el monitor distingue producción de preview. Se usa
  como comprobación manual tras cada release y como sonda del monitor externo.
- **Monitorización básica sin coste añadido:**
  - _Deployment notifications_ de Vercel al correo del propietario/CTO en cada despliegue de
    producción (éxito y fallo).
  - Alertas de Neon por uso de recursos y por fallo de disponibilidad.
  - Monitor externo de uptime sobre `/api/health` cada 5 minutos (por ejemplo el propio chequeo de
    Vercel o un servicio gratuito de uptime), con aviso por email.
- **Coste:** plan gratuito de Vercel y de Neon es suficiente para el MVP; si se supera, se revisa con
  el CTO antes de subir de plan. No se contrata nada de pago sin aprobación.
- **Lo que no se monitoriza (todavía):** métricas de negocio y trazas distribuidas. Se añadirán
  cuando existan flujos reales (configurador y presupuestos) y tráfico que lo justifique.

## 4. Incidentes: runbook mínimo

1. **Detectar.** Aviso de Vercel/Neon, monitor de uptime o queja del propietario.
2. **Contener.** ¿Afecta a producción? Aplicar el rollback de
   [despliegue.md](despliegue.md), apartado 5 (aplicación primero, datos después).
3. **Comunicar.** Comentar en la tarea de Paperclip con hora de inicio, alcance visible, qué se ha
   hecho y qué falta. Sin datos de clientes ni credenciales en el comentario.
4. **Corregir la causa raíz** con test que la cubra y PR revisado por otro agente.
5. **Aprender.** Si el incidente revela una decisión de arquitectura, stack o datos, se escribe un
   ADR. Si revela un hueco de la puerta de calidad, se abre tarea hija en QA o DevOps.

### 4.1 Fuga de credenciales (log, captura, comentario o transcript)

1. **Contener sin ampliar el daño.** No reproducir el valor en ningún sitio: ni en comentarios, ni
   en documentos, ni "para comprobar que es el mismo". Si el valor aparece en un log de run, se
   asume comprometido.
2. **Rotar** la credencial en su origen siguiendo el apartado 5.5 de
   [variables-entorno.md](variables-entorno.md) y [ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md),
   con la verificación de que el valor viejo ya no sirve. Las credenciales de larga duración solo se
   emiten desde la interfaz del proveedor, así que la rotación necesita al operador: el agente deja
   el trabajo preparado (emisión por API si es posible, propuesta de secreto y comprobaciones) y la
   tarea queda con responsable y acción nombrados.
3. **Comprobar el alcance** con el barrido canónico, que nunca imprime valores:

   ```bash
   scripts/secret-scan.sh                       # patrones de alta confianza
   printf '%s\n' "$VALOR" | scripts/secret-scan.sh --no-patterns --values-stdin --history
   ```

4. **Anotar** el incidente en la tarea de Paperclip: qué se filtró (por nombre), dónde, cuándo, qué
   se ha rotado y qué queda. Sin valores.
5. **Aprender.** Si el proceso falló, se corrige con test que lo cubra (como
   `scripts/secret-scan.test.sh`, que verifica que la salida no contiene ni el valor ni el patrón) y
   con la revisión de otro agente.

## 5. Logs y privacidad

- Los logs no contienen datos personales identificables ni `DATABASE_URL`.
- Los presupuestos guardan el mínimo imprescindible para el negocio (ADR-0004) y su acceso queda
  restringido al panel de administración.
- Los datos de la base de datos de preview son desechables y nunca son una copia de producción
  (cualquier depuración se hace anonimizando, no copiando datos reales).

## 6. Identidad de aprobación de PRs (revisión independiente)

La revisión aprobatoria la registra una identidad **no autora**: la machine user
`cifucorp-review-bot`, colaboradora con permiso de escritura del repositorio. Decisión y
alternativas: [ADR-0015](adr/0015-identidad-de-aprobacion-de-prs.md). El token vive solo en el
secreto `github/review-bot-token` (binding `env.GITHUB_REVIEW_BOT_TOKEN`, tabla 5.1 de
[variables-entorno.md](variables-entorno.md)); **no** se copia a Vercel ni a GitHub Actions.

### 6.1 Comprobar que la puerta sigue cerrada

```bash
scripts/approval-guard.sh --require-api   # ajustes del repositorio + workflows (necesita token)
scripts/approval-guard.sh --static-only   # solo workflows; es lo que corre el CI
scripts/approval-guard.test.sh            # test de la guardia
```

- Debe decir `can_approve_pull_request_reviews=false` y `default_workflow_permissions=read`.
- Si aparece `VIOLACION` por `ajuste-aprobacion-bot`, alguien ha vuelto a habilitar la aprobación
  desde Actions: se desactiva de inmediato (`PATCH /repos/:owner/:repo/actions/permissions/workflow`
  con `can_approve_pull_request_reviews=false`) y se anota el incidente sin valores.

### 6.2 Aprobar un PR de verdad

Un agente distinto del autor revisa el diff, el CI en verde y los E2E del flujo, y solo entonces
publica la aprobación. La aprobación no la firma el autor del PR ni un bot de automatización:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $GITHUB_REVIEW_BOT_TOKEN" \
  -H 'Accept: application/vnd.github+json' -H 'Content-Type: application/json' \
  -d '{"event":"APPROVE","body":"Revisión independiente de <agente>: CI en verde y E2E del flujo OK."}' \
  "https://api.github.com/repos/cifu2/presupuestoCifuentes/pulls/<n>/reviews"
```

El token **nunca** se imprime ni se pasa como argumento en claro (ADR-0014). Si la respuesta es
`422 Can not approve your own pull request`, se está usando el token del autor: es el fallo que
motivó este procedimiento.

### 6.3 Alta y rotación de la identidad

- **Alta (una vez, la ejecuta el board):** crear la cuenta con un correo de la empresa y 2FA,
  invitarla como colaboradora con permiso de escritura, comprobar `GET /collaborators`, emitir el
  PAT clásico `public_repo` y registrarlo en Paperclip con el binding del apartado 5.1 de
  [variables-entorno.md](variables-entorno.md). Después, prueba de extremo a extremo: aprobar un PR
  de prueba y enlazarlo en la tarea.
- **Rotación:** cada ≤ 90 días o ante filtración, en el orden del apartado 5.5 de
  [variables-entorno.md](variables-entorno.md) y de [ADR-0014](adr/0014-manejo-y-rotacion-de-secretos.md):
  emitir → registrar → verificar → revocar → comprobar que la vieja ya no sirve.
- **Pérdida de la cuenta:** retirar la colaboración
  (`DELETE /repos/:owner/:repo/collaborators/cifucorp-review-bot`) y repetir el alta.
- **Emergencia:** sin la identidad disponible **no** se habilita
  `can_approve_pull_request_reviews`; el PR queda bloqueado hasta que el CTO autorice por escrito en
  la tarea.
