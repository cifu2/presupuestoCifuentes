# Arquitectura

Decisión de referencia: [ADR-0001](adr/0001-repositorio-unico-arquitectura-hexagonal.md).
Stack: [ADR-0002](adr/0002-stack-definitivo.md).

## Capas y regla de dependencia

```text
                ┌──────────────────────────────────────────────┐
   Entrega      │  src/app (Next.js)   ·   src/ui (React)      │
                └───────────────┬──────────────────────────────┘
                                │ casos de uso
                ┌───────────────▼──────────────────────────────┐
   Aplicación   │  src/application  →  casos de uso + puertos  │
                └───────────────┬──────────────────────────────┘
                                │ entidades y reglas
                ┌───────────────▼──────────────────────────────┐
   Dominio      │  src/domain  →  sin dependencias externas    │
                └──────────────────────────────────────────────┘
                                ▲ implementa puertos
                ┌───────────────┴──────────────────────────────┐
   Infra        │  src/infrastructure (Prisma, email, PDF…)    │
                └──────────────────────────────────────────────┘
                     construido en src/composition/container.ts
```

**Regla de oro:** las dependencias apuntan siempre hacia dentro. El dominio no sabe que existe
Next.js, Prisma ni Resend. La UI no sabe que existe Postgres.

## Mapa de carpetas

| Ruta                        | Qué vive aquí                                                        | Puede importar                      |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| `src/domain`                | Entidades, objetos de valor, servicios de dominio, errores tipados   | Nada externo                        |
| `src/application/ports`     | Interfaces que el dominio/aplicación necesita                        | `src/domain`                        |
| `src/application/use-cases` | Un fichero por caso de uso                                           | `domain`, `ports`                   |
| `src/infrastructure`        | Adaptadores concretos (Prisma, Resend, `@react-pdf/renderer`, reloj) | `domain`, `application`             |
| `src/composition`           | Raíz de composición: une puertos con adaptadores                     | Todo                                |
| `src/app`                   | Rutas, layouts, route handlers, server actions                       | `application`, `composition`, `ui`  |
| `src/ui`                    | Componentes de presentación compartidos                              | `domain` (tipos), otros componentes |
| `src/i18n`                  | Enrutado por idioma, diccionarios y mensajes de error traducibles    | `domain`, `next-intl`               |
| `messages`                  | Diccionarios de interfaz por idioma (`es.json`, `en.json`)           | —                                   |
| `src/config`                | Validación de entorno y configuración transversal                    | Nada del proyecto                   |
| `prisma`                    | Esquema y migraciones                                                | —                                   |
| `e2e`                       | Tests Playwright de flujos completos                                 | —                                   |

El cumplimiento de la columna "puede importar" lo verifica `pnpm lint`: hay reglas
`no-restricted-imports` por capa en `eslint.config.mjs`. Un import prohibido es un error, no un
aviso.

## Flujo de una petición

1. **Route handler** (`src/app/api/...`) o **server action**: valida la entrada con Zod, obtiene las
   dependencias de `createContainer()` y llama a un caso de uso.
2. **Caso de uso** (`src/application/use-cases/...`): orquesta puertos y reglas; no sabe nada de
   HTTP ni de React.
3. **Dominio** (`src/domain`): decide (precio, compatibilidad, tamaño máximo). Devuelve un resultado
   tipado, no lanza errores para control de flujo salvo violación de invariante.
4. **Adaptador** (`src/infrastructure`): lee/escribe PostgreSQL, renderiza el PDF, envía el email.
5. El borde traduce el resultado o el error de dominio a una respuesta HTTP con código estable.

## Ejemplo: cómo se añade un caso de uso

1. Define o reutiliza el puerto en `src/application/ports` (p. ej. `TariffProvider`).
2. Escribe el caso de uso en `src/application/use-cases/publish-tariff-version.ts` con sus
   dependencias como primer parámetro: `publishTariffVersion({ tariffs, clock }, input)`.
3. Añade sus tests con dobles de los puertos (sin base de datos).
4. Implementa el adaptador en `src/infrastructure` si hace falta tecnología nueva.
5. Conéctalo en `src/composition/container.ts`.
6. Exponlo desde un route handler o server action, validando la entrada con Zod.
7. Si el flujo es de usuario, añade el E2E en `e2e/` (DoD).

## Dinero, tiempo y medidas

- `Money` (`src/domain/shared/money.ts`): céntimos en `bigint`, redondeo _half-up_ explícito.
- `Clock` (`src/application/ports/clock.ts`): todo lo que dependa de "ahora" (vigencia de tarifas,
  caducidad de presupuestos) usa este puerto, para poder testear con una fecha fija.
- Medidas en milímetros enteros; la superficie en m² es una conversión explícita y testeada.

## Datos

- PostgreSQL gestionado + Prisma. El esquema se define en CIF-3 siguiendo los puertos del dominio.
- Las tablas de catálogo y tarifas son **versionadas**: la tarifa vigente se resuelve por fecha
  (ADR-0003).
- Un presupuesto emitido guarda su tarifa y su desglose: es un documento inmutable desde el punto de
  vista del precio.

## Decisiones pendientes conocidas

- Proveedor concreto de PostgreSQL (Neon o Vercel Postgres): CIF-11.
- Dominio remitente del email y buzón del comercial: CIF-13 (propietario).
- Lista definitiva de idiomas: CIF-13 (propietario).
