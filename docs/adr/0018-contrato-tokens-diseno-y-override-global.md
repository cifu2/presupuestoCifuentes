# ADR-0018 — Contrato de 42 tokens de diseño y override global de radios y sombras (Tailwind v4)

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (contrato de `sistema-de-diseno` §2 y veredicto M10; ejecución en el PR #33 de CIF-117)
- **Ámbito:** capa de presentación: `src/app/globals.css`, contrato de tokens de `sistema-de-diseno` §2
  y redefinición de los defaults de Tailwind v4 que afectan a toda la app

## Contexto

`sistema-de-diseno` §2 (documento de CIF-5) define **42 tokens** de diseño. El `@theme` de
`src/app/globals.css` solo declaraba **4** (`--color-brand-900/700/500` y `--color-accent-500`); el
**PR #33 (CIF-117)** incorpora además `--color-scrim` (M1/CIF-102) como parte de los 42 y aplica el
contrato completo, pero ese contrato y el veredicto sobre su efecto global (M10) se decidieron **fuera
del repositorio**: el README de ADR marca como
ADR-obligatoria "cualquier decisión que otro agente pueda cuestionar dentro de tres meses", y sin ADR ni
test ejecutable el bloque `@theme` se puede "corregir" a ciegas.

Restricción técnica que hace la decisión no obvia: en Tailwind v4 los nombres `--radius-sm/md/lg` y
`--shadow-sm/md/lg` **son los defaults del framework** (v4.3.3: `0.25rem`/`0.375rem`/`0.5rem` y las
sombras negras por defecto), de modo que redefinirlos en `@theme` no añade tokens nuevos: **cambia el
valor de toda utilidad `rounded-*`/`shadow-*` de la app**, sin tocar los componentes.

Verificación visual y de estilos computados en **CIF-133** (revisión de otro agente), sobre `main`
(`e789df1`) frente a la rama del PR #33 (`8a914cd`): 42/42 tokens exactos y un único delta visual, el
radio de las tarjetas de la home.

## Decisión

1. `src/app/globals.css` declara en `@theme` los **42 tokens de `sistema-de-diseno` §2**, con **nombre y
   valor exactos**, y ninguno más:

   | Token                        | Valor                              |
   | ---------------------------- | ---------------------------------- |
   | `--color-brand-900`          | `#17202a`                          |
   | `--color-brand-800`          | `#22303f`                          |
   | `--color-brand-700`          | `#2c3e50`                          |
   | `--color-brand-600`          | `#3b5670`                          |
   | `--color-brand-500`          | `#4a6785`                          |
   | `--color-brand-400`          | `#6b8baa`                          |
   | `--color-brand-300`          | `#a8bccf`                          |
   | `--color-brand-100`          | `#e4eaf0`                          |
   | `--color-accent-700`         | `#7a5a08`                          |
   | `--color-accent-600`         | `#9a7409`                          |
   | `--color-accent-500`         | `#b8860b`                          |
   | `--color-accent-100`         | `#f7eed2`                          |
   | `--color-surface`            | `#ffffff`                          |
   | `--color-surface-muted`      | `#f7f7f5`                          |
   | `--color-surface-sunken`     | `#efeee9`                          |
   | `--color-border`             | `#e3e1dc`                          |
   | `--color-border-strong`      | `#c9c6bf`                          |
   | `--color-ink-muted`          | `#5b6773`                          |
   | `--color-ink-inverse`        | `#ffffff`                          |
   | `--color-scrim`              | `rgb(23 32 42 / 0.45)`             |
   | `--color-success-600`        | `#1f7a4d`                          |
   | `--color-success-100`        | `#eaf6ef`                          |
   | `--color-warning-600`        | `#8a5a00`                          |
   | `--color-warning-100`        | `#fdf3e3`                          |
   | `--color-danger-600`         | `#b3261e`                          |
   | `--color-danger-700`         | `#8c1d18`                          |
   | `--color-danger-100`         | `#fdecea`                          |
   | `--color-info-600`           | `#1b5e8c`                          |
   | `--color-info-100`           | `#eaf2f9`                          |
   | `--radius-control`           | `6px`                              |
   | `--radius-card`              | `16px`                             |
   | `--radius-sm`                | `6px`                              |
   | `--radius-md`                | `10px`                             |
   | `--radius-lg`                | `16px`                             |
   | `--radius-full`              | `9999px`                           |
   | `--shadow-sm`                | `0 1px 2px rgb(23 32 42 / 0.06)`   |
   | `--shadow-md`                | `0 4px 12px rgb(23 32 42 / 0.08)`  |
   | `--shadow-lg`                | `0 12px 32px rgb(23 32 42 / 0.12)` |
   | `--ease-standard`            | `cubic-bezier(0.2, 0, 0, 1)`       |
   | `--transition-duration-fast` | `120ms`                            |
   | `--transition-duration-base` | `180ms`                            |
   | `--transition-duration-slow` | `280ms`                            |

   `src/app/design-tokens.test.ts` —que se incorpora con el PR #33— es la **fuente de verdad ejecutable**
   de esta tabla: comprueba que el bloque declara exactamente esos tokens, con esos valores, sin
   duplicados ni sobrantes. La tabla y el `@theme` se amplían o corrigen **en el mismo PR**; los
   comentarios de uso y contraste viven junto a cada token en `globals.css`.

2. Se **redefinen globalmente** los defaults de Tailwind v4 `--radius-sm/md/lg` y `--shadow-sm/md/lg` con
   los valores de §2 (`6px`/`10px`/`16px` y las sombras `rgb(23 32 42 / …)` de la tabla). Consecuencia
   querida: **todo `rounded-sm|md|lg` y `shadow-sm|md|lg` de la app pasa a los radios y sombras del
   sistema**, no a los del framework. Se mantienen además los nombres propios `--radius-control`,
   `--radius-card`, `--radius-full`, `--ease-standard` y `--transition-duration-fast/base/slow` para que
   los componentes nuevos no dependan de esa decisión.

3. **Límite explícito (M10), aceptado:** redefinir `--radius-lg` cambia la home; las tarjetas de "Alcance
   del MVP" pasan de `rounded-lg` **8px** (default v4) a **16px**. CIF-133 lo verificó con estilos
   computados y diff píxel a píxel en Chromium: 0,117 % de píxeles distintos a 1280×900 y 0,364 % a
   390×946, concentrados en 8 bandas de 16 px (las esquinas de las 4 tarjetas), la firma de un cambio de
   radio. **M10 se acepta como resultado querido, no como regresión.** Sin cambios de color, tipografía ni
   layout. Las tarjetas usan `border`, no `shadow-*`, así que la redefinición de sombras no tiene hoy
   efecto visible.

4. **Fuera de alcance:** consumir los tokens en componentes concretos. Este ADR fija el contrato y su
   efecto global, no la adopción. El consumo entra con CIF-6, CIF-7 y CIF-9.

5. **Gestión del cambio:** una modificación de `sistema-de-diseno` §2 exige un PR que actualice a la vez
   `globals.css` y `design-tokens.test.ts`. Cambiar el **contrato** (nombres, namespaces de Tailwind,
   override global de defaults) exige un **ADR nuevo que supersede a este**; este ADR no se edita.

6. Sin cambios de color, tipografía ni layout. Los **4** tokens previos (`--color-brand-900/700/500` y
   `--color-accent-500`) conservan su valor; `--color-scrim` entra con los 42 y conserva su comentario de
   trazabilidad `M1/CIF-102`.

## Consecuencias

- **Mejora:** el contrato deja de vivir en un documento externo y pasa a ser verificable por cualquier
  agente con `pnpm test`; el `@theme` no se puede "arreglar" a ciegas sin que falle el test.
- **Coste asumido:** el override de `--radius-*`/`--shadow-*` tiene radio de acción de app completa.
  Cualquier componente existente o futuro que use esas utilidades hereda el cambio del sistema sin
  tocar el componente. Mitigación: nombres propios para los componentes nuevos y este ADR como
  explicación del porqué ante una regresión percibida.
- **Cambio visible en la home:** `rounded-lg` 8px → 16px (M10 aceptado). No es un bug ni una regresión;
  no debe revertirse sin un ADR que supersede a este.
- **Trabajo generado:** CIF-6, CIF-7 y CIF-9 adoptan los tokens en componentes. El PR #33 (CIF-117) se
  fusionó en `main` (`b98be32`, 2026-09-12) antes de existir este ADR: este documento lo registra **a
  posteriori** y su merge no se condicionó a él.
- El ADR se registra después de la implementación, porque la decisión se tomó fuera del repositorio; a
  partir de aquí rige el orden "ADR en el mismo PR que el cambio".

## Alternativas consideradas

- **Declarar solo tokens con nombre propio y no tocar `--radius-sm/md/lg` ni `--shadow-sm/md/lg`:**
  descartada; §2 define esos nombres y la decisión del CTO es que el sistema mande sobre los defaults del
  framework. Evitaría el efecto global, pero dejaría dos verdades de radio/sombra conviviendo.
- **Renombrar el contrato a un namespace propio (`--radius-system-*`, etc.):** descartada; contradice §2 y
  obliga a un mapeo manual en cada componente, justo lo que el override global evita.
- **Dejar el contrato únicamente en `sistema-de-diseno` §2 (documento de CIF-5):** descartada; sin ADR ni
  test en el repositorio, la decisión no es auditable y cualquiera puede revertirla creyendo que arregla
  una regresión (es el caso de M10).
- **Aceptar M10 como regresión y revertir `--radius-lg` a 8px:** descartada; CIF-133 confirmó con estilos
  computados que el único delta es el radio y que 16px es exactamente el valor de §2.
