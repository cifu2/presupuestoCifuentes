# ADR-0009 — Base de datos gestionada (Neon) con ramas, PITR y monitorización

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** DevOps (CIF-11), dentro de las restricciones fijadas por ADR-0007
- **Ámbito:** datos, entornos, backups y operación

## Contexto

ADR-0007 fija PostgreSQL gestionado sin Docker ni servidores propios y deja a DevOps la elección del
proveedor y de la estrategia de entornos. El MVP necesita: producción fiable, un entorno de preview
por PR que no toque datos reales, backups restaurables y monitorización barata. El presupuesto de la
empresa exige empezar en planes gratuitos y no contratar sin aprobación.

## Decisión

1. **Neon como PostgreSQL gestionado**, a través de la integración de Vercel. Razones: es el motor
   PostgreSQL nativo (compatible con Prisma y con `@prisma/adapter-pg`), la integración con Vercel
   inyecta `DATABASE_URL` por entorno sin gestión manual, y su modelo de ramas encaja con un preview
   por PR.
2. **Una rama por entorno**: `production` para producción y una rama por PR creada desde `preview`
   (copy-on-write, se borra al cerrar el PR). Ningún preview usa datos de producción.
3. **Migraciones hacia adelante y explícitas**: `prisma migrate deploy` como paso de release
   documentado, nunca desde un PR y nunca automático en el build de Vercel; con regla
   _expand/contract_ para que un rollback de aplicación sea siempre posible.
4. **Backups**: PITR continuo de la rama `production` (≥ 7 días) más una rama de snapshot antes de
   cada migración destructiva. Se prueba una restauración **cada trimestre**.
5. **Monitorización básica**: notificaciones de despliegue de Vercel, alertas de recursos y
   disponibilidad de Neon, y un monitor externo de uptime sobre `/api/health` cada 5 minutos.
6. **Privilegio mínimo**: la aplicación usa un rol con DML sobre su esquema; el rol de administración
   solo se usa para migraciones y restauración y no se inyecta en Vercel.

## Consecuencias

- La puesta en marcha inicial (CIF-11) necesita una cuenta de Neon: la aporta el propietario junto al
  resto de accesos (CIF-14).
- El coste es 0 en planes gratuitos mientras el MVP no tenga tráfico real; cambiar de plan requiere
  aprobación del CTO.
- Da continuidad a una futura separación por entorno y a datos de prueba por PR sin esfuerzo extra.
- El equipo se compromete a la disciplina _expand/contract_: cada PR con migración debe anotar su
  plan de reversión (ya exigido por la Definition of Done).

## Alternativas consideradas

- **Vercel Postgres:** su oferta actual se apoya en Neon; usar Neon directamente evita una capa
  intermedia y da control de ramas y restauración.
- **Supabase:** válido como PostgreSQL gestionado, pero su foco (auth, storage, realtime) añade
  superficie que el MVP no usa.
- **PostgreSQL en un VPS:** descartado por ADR-0007 (sin servidores propios, backups y
  actualizaciones a nuestro cargo).
- **Base de datos única para todos los entornos:** descartado; los previews escribirían en datos
  reales y las migraciones de un PR podrían afectar a producción.
