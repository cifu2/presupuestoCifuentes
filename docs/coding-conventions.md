# Convenciones de código

> El objetivo es que cinco agentes produzcan código que parezca escrito por una sola persona.
> Ante la duda: menos código, nombres explícitos y una única forma obvia de hacer cada cosa.

## Idioma

- **Identificadores en inglés** (clases, funciones, variables, ficheros, rutas de API).
- **Documentación, comentarios y mensajes de commit en español.**
- **Textos de interfaz fuera del código**: siempre por i18n (ADR-0005).

## TypeScript

- `strict` activado, además de `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y
  `verbatimModuleSyntax` (ver `tsconfig.json`). No se desactivan flags por comodidad.
- Prohibido `any`. Si un valor externo es desconocido, es `unknown` y se valida con Zod en el borde.
- Prohibido `as` para silenciar un error de tipos. Si hace falta un _narrowing_, se usa un
  predicado de tipo o una función de validación.
- `type` para datos y uniones; `interface` para contratos que se implementan (puertos).
- Preferir `readonly` y estructuras inmutables. Los objetos de valor se construyen por factorías
  validadas, no con constructores públicos sueltos.
- Exportaciones nombradas; sin `export default` salvo donde Next.js lo exige (`page.tsx`, `layout.tsx`).

## Arquitectura (ADR-0001)

- `src/domain`: entidades, objetos de valor, servicios de dominio y errores tipados. Sin imports de
  framework, base de datos ni red.
- `src/application`: casos de uso (una función por caso de uso, un fichero por caso de uso) y puertos
  en `src/application/ports`. Depende solo de `domain`.
- `src/infrastructure`: adaptadores que implementan puertos (`PrismaSeriesRepository`,
  `ResendEmailSender`, `SystemClock`). Depende de `application` y `domain`.
- `src/app` / `src/ui`: entrega y presentación. No importan `infrastructure`; obtienen dependencias
  de `src/composition/container.ts`.
- **Los puertos se nombran por lo que necesita el caso de uso**, no por la tecnología:
  `QuoteRepository`, `TariffProvider`, `EmailSender`, `QuotePdfRenderer`, `Clock`.
- Nada de un `Repository<T>` genérico ni de un `BaseService` con herencia. Interfaces pequeñas y
  específicas.

## Nombres

| Elemento              | Convención                  | Ejemplo                               |
| --------------------- | --------------------------- | ------------------------------------- |
| Ficheros              | `kebab-case`                | `calculate-quote-price.ts`            |
| Clases / tipos        | `PascalCase`                | `TariffVersion`, `Money`              |
| Funciones / variables | `camelCase`                 | `calculateQuotePrice`                 |
| Puertos               | sustantivo + capacidad      | `EmailSender`, `Clock`                |
| Adaptadores           | tecnología + puerto         | `ResendEmailSender`                   |
| Casos de uso          | verbo + sustantivo          | `createQuote`, `publishTariffVersion` |
| Booleanos             | prefijo `is`/`has`/`can`    | `isExpired`, `hasAutomaticPrice`      |
| Ficheros de test      | junto al código, `.test.ts` | `money.test.ts`                       |
| E2E                   | flujo, en `e2e/`            | `quote-flow.spec.ts`                  |

## Dinero, fechas y unidades

- **Dinero:** siempre el objeto de valor `Money` (céntimos en `bigint`). Prohibido `number` para
  importes. Redondeo explícito _half-up_ (ADR-0003).
- **Fechas:** instantes en UTC, formato ISO 8601; la hora se pide al puerto `Clock`, nunca a
  `Date.now()` dentro de dominio o casos de uso.
- **Medidas:** milímetros enteros en el dominio; la conversión a m² para precio es una regla
  explícita y testeada (redondeo al alza a 3 decimales).
- **Porcentajes:** fracción exacta a partir de cadena decimal, nunca coma flotante.

## Errores

- Errores de dominio tipados (`DomainError` y subtipos como `InvalidMeasurementError`,
  `ManualQuoteRequiredError`) con un `code` estable.
- El mapeo a HTTP ocurre **solo** en el borde (`src/app/api/**`): un único helper traduce
  `DomainError` a código y mensaje; nunca se devuelve un stack trace al cliente.
- Prohibido `catch` vacío y `console.log` en producción. El logging pasa por un logger con contexto y
  sin datos personales.

## Tests

- Un test describe **comportamiento**, no implementación. Nombre en español, en presente:
  `it('aplica el tamaño máximo de la serie y pasa a presupuesto manual')`.
- Estructura `arrange / act / assert` separada por líneas en blanco.
- Se mockean **puertos**, nunca el dominio. Los adaptadores se prueban con dobles de frontera
  (base de datos de test, servidor de email falso), no con mocks de sus tripas.
- Datos de prueba con factorías (`makeSeries`, `makeQuote`) en vez de literales largos repetidos.
- Cobertura mínima 80 % en `src/domain` y `src/application` (ADR-0006).

## Git

- **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`,
  `ci:`, `build:`. Ámbito opcional: `feat(pricing): ...`. Mensaje en español, imperativo, una línea
  de resumen y el detalle en el cuerpo si hace falta.
- Ramas: `feat/<descripcion>`, `fix/<descripcion>`, `docs/<descripcion>`, `chore/<descripcion>`.
- **Un tema por PR**, menos de ~400 líneas de diff cuando sea posible. Los PR gigantes no se revisan
  bien y bloquean al equipo.
- No se fusiona con el CI en rojo ni sin revisión (DoD).
- Nunca se reescribe la historia de `main`; los commits ajenos no se rebasan sin avisar.

## Prohibiciones explícitas

- Lógica de negocio en componentes de React o en route handlers.
- Acceso directo a Prisma desde la UI o desde el dominio.
- Secretos, tokens o datos reales de clientes en el repositorio, los tests o los comentarios.
- Dependencias nuevas sin justificarlo en el PR (tamaño, mantenimiento, alternativa ya presente) y,
  si son estructurales, sin ADR.
- `skip`, `only` o `fixme` en tests sin acuerdo del CTO.
