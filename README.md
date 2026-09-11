# Puertas Cifuentes · Software de presupuestos a medida

MVP del software de presupuestos para [Puertas Cifuentes](https://puertascifuentes.com):
configurador público con vista previa 2D y precio en vivo, tarifas versionadas, presupuesto en PDF
y por email, multi-idioma y panel de administración para el propietario.

## Estado

Kickoff técnico completado (CIF-2): estructura, stack, arquitectura, ADRs, convenciones y CI.
La aplicación todavía es un esqueleto: la home y `/api/health` son lo único implementado, y existen
para probar que la tubería (build, despliegue y puerta de calidad) funciona de punta a punta.

## Stack

Next.js 16 (App Router, full-stack) · React 19 · TypeScript 5.9 `strict` · Tailwind 4 · Zod 4 ·
PostgreSQL + Prisma 7 · next-intl · Vitest 5 · Playwright · Vercel. Justificación y versiones:
[ADR-0002](docs/adr/0002-stack-definitivo.md).

## Puesta en marcha

Requisitos: Node 24 (`.nvmrc`) y pnpm 10 (`packageManager`).

```bash
pnpm install
cp .env.example .env        # rellena DATABASE_URL con tu PostgreSQL local
pnpm dev                    # http://localhost:3000
```

Comandos habituales:

| Comando                              | Qué hace                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| `pnpm dev`                           | Servidor de desarrollo                                         |
| `pnpm verify`                        | Formato + lint + tipos + tests unitarios (lo que exige la DoD) |
| `pnpm test` / `pnpm test:coverage`   | Tests unitarios con Vitest                                     |
| `pnpm e2e`                           | Tests E2E con Playwright (escritorio y móvil)                  |
| `pnpm e2e:install`                   | Instala Chromium para Playwright                               |
| `pnpm db:migrate` / `pnpm db:deploy` | Migraciones Prisma en local / despliegue                       |
| `pnpm build`                         | Build de producción                                            |

> Nota local: si tu entorno inyecta `NODE_ENV=development`, ejecuta el build con
> `NODE_ENV=production pnpm build`.

## Estructura

```text
src/domain          Reglas de negocio puras (dinero, precios, catálogo, presupuestos)
src/application     Casos de uso y puertos
src/infrastructure  Adaptadores: Prisma, email, PDF, reloj
src/composition     Raíz de composición (puertos → adaptadores)
src/app             Rutas, layouts y route handlers de Next.js
src/config          Validación de entorno con Zod
docs/adr            Decisiones de arquitectura
e2e                 Tests Playwright de flujos completos
prisma              Esquema y migraciones
```

Detalle en [docs/architecture.md](docs/architecture.md). Los límites entre capas los verifica
`pnpm lint`.

## Documentación

- [Arquitectura](docs/architecture.md) · [ADR](docs/adr/README.md)
- [Definition of Done](docs/definition-of-done.md) — nadie da algo por terminado sin cumplirla
- [Convenciones de código](docs/coding-conventions.md)
- [Estrategia de pruebas](docs/testing-strategy.md)
- [Decisiones de negocio abiertas](docs/decisiones-negocio-abiertas.md) (propuesta al propietario)
- [Contribuir](CONTRIBUTING.md)

## Calidad

Nada se considera terminado sin (1) test automático que lo cubra, (2) E2E de los flujos afectados en
verde y (3) revisión de otro agente. El CI (`.github/workflows/ci.yml`) ejecuta los jobs `calidad` y
`e2e`, que son checks requeridos en `main`.
