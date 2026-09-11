# ADR-0002 — Stack definitivo del MVP

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO
- **Ámbito:** stack, versiones y herramientas

## Contexto

El plan del MVP fija Next.js full-stack + PostgreSQL, despliegue en Vercel y código en GitHub.
Hay que concretar versiones y herramientas para que los cinco agentes construyan contra el mismo
contrato, y justificar las exclusiones que ya hemos detectado al montar el esqueleto.

## Decisión

| Área                    | Decisión                                                             | Versión                                 |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| Runtime                 | Node.js                                                              | 24 (LTS, fijado en `.nvmrc`)            |
| Gestor de paquetes      | pnpm                                                                 | 10 (`packageManager` en `package.json`) |
| Framework               | Next.js App Router (full-stack: UI, route handlers y server actions) | 16.x                                    |
| UI                      | React                                                                | 19.x                                    |
| Estilos                 | Tailwind CSS                                                         | 4.x                                     |
| Lenguaje                | TypeScript en modo `strict`                                          | 5.9.x                                   |
| Validación en bordes    | Zod                                                                  | 4.x                                     |
| Datos                   | PostgreSQL gestionado + Prisma ORM                                   | 17 / Prisma 7.x                         |
| i18n                    | next-intl (ver ADR-0005)                                             | 4.x                                     |
| Unitarios / integración | Vitest (+ `@vitest/coverage-v8`)                                     | 5.x                                     |
| E2E                     | Playwright (Chromium escritorio y móvil)                             | 1.63.x                                  |
| Lint / formato          | ESLint + Prettier                                                    | ESLint 9.x / Prettier 3.x               |

Notas de versión con impacto:

- **TypeScript 5.9, no 7.x.** `typescript-eslint` 8.70 declara compatibilidad `>=4.8.4 <6.1.0`.
  Adoptar TS 7 hoy rompe el lint con tipos. Se revisará cuando el ecosistema lo soporte.
- **ESLint 9, no 10.x.** Con ESLint 10, `eslint-config-next` 16 falla al cargar
  `react/display-name` (`contextOrFilename.getFilename is not a function`). Verificado al montar el
  repositorio. Dependabot ignora los majors de `eslint` hasta que el plugin lo soporte.
- **PostgreSQL gestionado**: la elección entre Neon y Vercel Postgres la cierra DevOps en CIF-11 con
  el propietario. El código no depende del proveedor: solo de `DATABASE_URL`.
- **`src/config/env.ts`** valida el entorno con Zod al arrancar. `DATABASE_URL` es opcional hasta
  que CIF-3 introduzca el primer modelo persistido; entonces pasa a obligatoria.
- **Prisma 7 cambia dos cosas**: la URL de conexión ya no se admite en `schema.prisma`, vive en
  `prisma.config.ts` (que carga `.env` con `dotenv`), y el cliente se construye con un _driver
  adapter_ (`@prisma/adapter-pg`, ya instalado). CIF-3 conecta el cliente en
  `src/infrastructure/persistence` detrás del puerto correspondiente.

## Consecuencias

- Una sola tubería de build y despliegue; sin Docker ni servidores propios.
- Todo el mundo trabaja con las mismas versiones porque están fijadas en `package.json`,
  `pnpm-lock.yaml` y `.nvmrc`; el CI instala con `--frozen-lockfile`.
- Las actualizaciones de dependencias llegan por Dependabot en PRs semanales agrupados.

## Alternativas consideradas

- **Vitest + Testing Library para componentes:** la librería se añadirá cuando existan componentes
  con lógica propia (CIF-5/CIF-6). Los flujos se cubren de momento con Playwright.
- **Jest:** descartado por arranque y transformación más lentos con ESM/TS.
- **Un ORM ligero (Drizzle/Kysely):** descartado por ecosistema, migraciones y comodidad para un
  equipo con poca experiencia en el modelo; Prisma ya venía en el plan aprobado.
