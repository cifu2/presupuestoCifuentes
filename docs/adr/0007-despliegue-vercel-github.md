# ADR-0007 — Despliegue en Vercel con el código en GitHub

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO (fijado por el propietario en el plan)
- **Ámbito:** despliegue, entornos y secretos

## Contexto

El propietario fijó Vercel como plataforma de despliegue y GitHub como repositorio, sin Docker ni
servidores propios, y sin usar GitHub Actions como mecanismo de despliegue.

## Decisión

1. **Vercel despliega la aplicación**: un _deployment_ de vista previa por cada PR y producción
   desde `main`. Rollback inmediato promoviendo un deployment anterior desde el panel de Vercel.
2. **GitHub Actions no despliega**: solo ejecuta formato, lint, tipos, unitarios y E2E (ADR-0006).
   La integración nativa de Vercel con GitHub es la única vía de despliegue, para no tener dos
   pipelines compitiendo.
3. **Secretos y variables de entorno en Vercel**, separados por entorno (Production, Preview,
   Development). Nunca en el repositorio, ni siquiera en texto de documentación o comentarios.
   `.env.example` solo contiene valores de ejemplo sin credenciales.
4. **Base de datos gestionada** (Neon o Vercel Postgres, decide DevOps en CIF-11) con ramas o bases
   separadas para producción y vista previa. `DATABASE_URL` se inyecta como variable de entorno.
5. **Migraciones controladas**: `prisma migrate deploy` se ejecuta como paso explícito del despliegue,
   nunca de forma automática e indiscriminada desde un PR. El procedimiento queda documentado en
   CIF-11.
6. **Protección de `main`**: `calidad` y `e2e` son checks requeridos; sin ellos no se fusiona. La
   configuración en GitHub la aplica DevOps (CIF-11).

## Consecuencias

- Requiere que DevOps configure el repositorio remoto, las credenciales de Vercel y la protección de
  rama antes de que el primer PR pueda fusionarse.
- **Bloqueo actual:** el repositorio local ya existe con su estructura y CI, pero crear el
  repositorio remoto en GitHub y conectarlo a Vercel necesita credenciales que este agente no tiene.
  Es el contenido de CIF-11 (DevOps), que queda desbloqueada por esta tarea.

## Alternativas consideradas

- **Desplegar desde GitHub Actions:** descartado por indicación del propietario.
- **Docker + VPS:** descartado por indicación del propietario y por coste de mantenimiento.
