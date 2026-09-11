# ADR-0001 — Repositorio único con arquitectura hexagonal y SOLID

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO
- **Ámbito:** estructura del código y límites entre capas

## Contexto

El MVP es un único producto desplegado como una sola aplicación en Vercel: configurador público,
panel de administración, API y generación de presupuestos. Trabajan en él cinco agentes en paralelo
(backend, frontend, diseño, QA, DevOps) y el propietario no es técnico.

Necesitamos que las reglas de negocio (precios, tamaños máximos, compatibilidades) sean testeables
sin arrancar Next.js ni una base de datos, y que sustituir PostgreSQL, el proveedor de email o el
renderizador de PDF no obligue a tocar el dominio.

## Decisión

1. **Un solo repositorio con una sola aplicación Next.js** (no monorepo de paquetes). Descartamos
   separar `packages/domain` en este momento: añade configuración de workspaces, resolución de
   tipos cruzada y pipelines distintos sin aportar nada con un único entregable y un único
   despliegue. La separación lógica se consigue con capas, no con carpetas de paquete.
2. **Arquitectura hexagonal** con regla de dependencia unidireccional:

   ```text
   src/domain          → reglas y tipos del negocio. Sin dependencias externas.
   src/application     → casos de uso y puertos. Depende solo de domain.
   src/infrastructure  → adaptadores (Postgres/Prisma, email, PDF, reloj). Implementa puertos.
   src/app, src/ui     → entrega (Next.js, React). Consume casos de uso.
   src/composition     → raíz de composición: une puertos con adaptadores.
   ```

3. **Los puertos se declaran en `src/application/ports`** como interfaces TypeScript; los
   adaptadores viven en `src/infrastructure` y se construyen **solo** en `src/composition`.
4. **Los límites se hacen cumplir con lint**, no solo con revisión: reglas
   `no-restricted-imports` por capa en `eslint.config.mjs`.
5. **SOLID aplicado con criterio**: responsabilidad única por caso de uso, inversión de dependencias
   vía puertos, interfaces pequeñas y específicas (nada de un `Repository` genérico), composición
   en lugar de herencia. No se persiguen patrones ceremoniales sin problema real que resolver.

## Consecuencias

- **Positivo:** un solo CI, un solo despliegue, tests de dominio instantáneos, y extraer el dominio a
  un paquete o servicio en el futuro es mecánico porque no depende de Next ni de Prisma.
- **Negativo:** el árbol de carpetas no impide por sí solo una violación de capas; hay que mantener
  las reglas de lint y la revisión. Un `import` prohibido se puede saltar con un comentario de
  lint; la revisión debe rechazarlo.
- **Neutro:** la UI no importa Prisma ni adaptadores; si un componente necesita datos, pasa por un
  caso de uso o por una _server action_ que lo invoca.

## Cómo verificarlo

- `pnpm lint` falla si una capa importa algo prohibido.
- Un `import` de `@/infrastructure/*` en `src/app` o `src/ui` es un error de lint.
- Los tests de `src/domain` y `src/application` no arrancan Next.js ni base de datos.

## Alternativas consideradas

- **Monorepo pnpm con `packages/domain` + `apps/web`:** rechazado por coste de configuración y de CI
  sin beneficio en el MVP. Se puede adoptar más adelante; el dominio ya está aislado.
- **Backend separado (servicio propio) desde el día 1:** rechazado por el propietario y por el CTO:
  duplica despliegue y observabilidad sin necesidad.
