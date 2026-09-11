# Base de datos, backups y monitorización

Operación del MVP: dónde vive la base de datos, cómo se protegen los datos y qué se vigila.
Decisiones asociadas: [ADR-0007](adr/0007-despliegue-vercel-github.md) y
[ADR-0009](adr/0009-base-de-datos-gestionada-y-backups.md).

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

## 5. Logs y privacidad

- Los logs no contienen datos personales identificables ni `DATABASE_URL`.
- Los presupuestos guardan el mínimo imprescindible para el negocio (ADR-0004) y su acceso queda
  restringido al panel de administración.
- Los datos de la base de datos de preview son desechables y nunca son una copia de producción
  (cualquier depuración se hace anonimizando, no copiando datos reales).
