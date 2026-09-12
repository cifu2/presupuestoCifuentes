# ADR-0023 — Alcance de arranque del panel: shell de presentación en paralelo; lectura y escritura reales, gated

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (decisión de tablero en CIF-239; petición de Frontend en CIF-239, contexto CIF-9 / CIF-101 / CIF-126)
- **Ámbito:** panel de administración (CIF-9) y su frontera con el modelo de catálogo (CIF-126, ADR-0017) y el configurador (ADR-0020)

## Contexto

CIF-9 (panel de administración) colgaba de CIF-126 (importador CLI + modelo de **escritura** de catálogo,
ADR-0017), y CIF-126 está bloqueada a propósito por la decisión de negocio CIF-114, que lleva días
parada (el agente CEO está en `error`; la fecha del propietario es ≤ 2026-09-19). Con ese calendario, la
última pieza de frontend del MVP se quedaba parada semanas.

Hechos verificados el 2026-09-12:

1. ADR-0020 §4 fijó CIF-126 como el gate real de CIF-9, pero ADR-0017 §8 limita ese contrato al **modelo
   de escritura** (puertos de escritura, casos de uso y adaptadores Prisma compartidos con el importador).
   Nada de la presentación del panel depende del modelo de escritura.
2. El diseño está congelado: CIF-55 aprobada con el prototipo v3.2 (68/68 del arnés de tokens), CIF-102 y
   CIF-104 cerradas; `--color-scrim` ya está en `src/app/globals.css` y las claves `CatalogAdmin.*` existen
   en `messages/`. Los dos hallazgos de CIF-101 (`--scrim` en el backdrop, nombres accesibles traducidos)
   son parte del port, no diseño nuevo.
3. Los conjuntos de escritura de CIF-126 y del shell son disjuntos **salvo un fichero que la propuesta de
   CIF-239 no menciona**: `src/composition/container.ts` es raíz de composición única (convenciones de
   código y ADR-0001) y cualquiera de las dos partes tendería a editarlo.
4. El panel va a `/admin` en el mismo despliegue de producción (ADR-0007): sin guarda, el shell quedaría
   públicamente accesible antes de existir autenticación del panel. Hoy solo existe `ADMIN_API_TOKEN`
   para el API, no hay sesión de UI ni tarea que la cubra.

## Decisión

1. **Se autoriza arrancar el shell de presentación del panel en paralelo a CIF-126.** Alcance exacto (y
   techo): rutas `/[locale]/admin/**`; shell de aplicación (sidebar, topbar, tabs, migas, selector de
   idioma); navegación entre secciones; i18n con paridad es/en; a11y (nombres accesibles por clave
   `CatalogAdmin.a11y.*`); responsive comprobado en móvil; estados vacío, carga y error; y los dos
   hallazgos de CIF-101.
2. **Queda fuera de la fase 1** todo lo que lea o escriba catálogo real: alta/edición/desactivación,
   publicación de tarifas desde la UI, edición rápida de precio, endpoints de escritura y cualquier
   consulta a la base de datos o al catálogo de demostración.
3. **Frontera de datos de la fase 1.** El shell consume un contrato de lectura **propiedad de la capa de
   presentación**: view models + interfaz `AdminCatalogReader` + adaptador de fixtures, todo bajo
   `src/ui/admin/**`, resuelto en un único punto de intercambio documentado
   (`src/ui/admin/admin-catalog-reader.factory.ts`). Prohibido en esta fase tocar
   `src/composition/container.ts`, `src/application/**`, `src/infrastructure/**`, `src/domain/**`,
   `prisma/**` y `scripts/**`.
4. **Conjunto de escritura autorizado en la fase 1:** `src/app/[locale]/admin/**`, `src/ui/admin/**`,
   `messages/*.json`, `e2e/admin-*.spec.ts` y `e2e/support/**`, `docs/adr/0023-*.md`,
   `docs/adr/README.md` y el fichero nuevo de guarda de acceso que exija §5. Cualquier otro fichero
   requiere volver a pasar por el CTO.
5. **El panel no puede quedar públicamente accesible.** El PR de fase 1 incluye una guarda que, en
   Production, deja `/[locale]/admin/**` no accesible (interruptor de entorno apagado por defecto) y sin
   indexación. La autenticación real del panel es una tarea propia (ver §7) y es requisito de la fase 3.
6. **Fase 2 — lectura real.** Una tarea de Backend publica el puerto de lectura de administración, su
   caso de uso y el adaptador Prisma que satisface el contrato de vista congelado en §3, con datos de
   semilla. Solo ficheros nuevos y edición aditiva de la raíz de composición.
7. **Fase 3 — escritura.** Sigue gated: la tarea de cableado de escritura es hija de CIF-9 y queda
   bloqueada por CIF-126 y por la tarea de autenticación del panel. Ninguna superficie de escritura
   (ni UI ni endpoint) se construye antes.
8. **El gate duro CIF-9 → CIF-126 se retira.** CIF-9 deja de estar `blocked`; el bloqueo queda
   concentrado en la tarea de fase 3, que es la que realmente depende de CIF-126.
9. **Verificación de la fase 1 (DoD completa).** El PR trae tests unitarios (estados, navegación, paridad
   de claves i18n) y un E2E nuevo del shell en `chromium` y `movil` en verde; el arnés de tokens de
   CIF-55 sigue en 68/68; sin literales de texto ni de color; revisión de otro agente distinto del autor.
10. **Sin datos de negocio reales.** Los fixtures de la fase 1 son datos de demostración; el repositorio
    no contiene series, tarifas, colores ni precios reales (ADR-0014 §1, ADR-0017 §2).
11. **Polish de la fase 1 tras la validación en runtime (CIF-296).** Los tres hallazgos no bloqueantes de
    CIF-277 se cierran dentro del mismo techo de la fase 1: los iconos del panel son **SVG** propios
    (`src/ui/admin/panel-icons.tsx`) en lugar de emoji de plataforma —el color entra por `currentColor`
    desde los tokens de `sistema-de-diseno` §2, nunca por un literal—; la CTA deshabilitada del vacío de
    series declara que llegará con la edición (`CatalogAdmin.newSeriesHint`) en vez de quedarse en un
    botón muerto; y el menú móvil usa el mismo patrón que el `Modal`/`Sheet`: scrim con
    `--color-scrim`, foco al primer enlace al abrir y vuelta al botón al cerrar con `Esc` o con el
    scrim. No se abre ninguna superficie de escritura: la CTA sigue deshabilitada.

## Consecuencias

- El frontend arranca ya y el camino crítico del MVP deja de depender de una decisión de negocio parada.
- Coste asumido: cuando llegue la lectura real (fase 2), el adaptador de fixtures se sustituye en un único
  punto. Si el contrato de vista resulta equivocado, se corrige con un ADR que supersede a este, no
  reescribiendo la presentación.
- Riesgo asumido y acotado: el shell se diseña contra fixtures; su valor real se mide con el E2E del shell
  y con el arnés de tokens, no con datos reales.
- El panel no se expone en producción hasta que exista la guarda de §5 y, para escritura, la
  autenticación de §7.

## Alternativas consideradas

- **B — mantener el gate completo:** deja CIF-9 y CIF-101 `blocked` semanas por una decisión que no es
  técnica ni bloquea la presentación; el coste lo paga el MVP entero.
- **Retirar el gate sin guardarraíles:** construiría sobre un contrato de datos inexistente, tocaría la
  raíz de composición en paralelo a CIF-126 y expondría `/admin` sin autenticación.
- **Definir el contrato de lectura dentro de CIF-126:** volvería a atar la presentación a una tarea
  bloqueada por CIF-114, que es exactamente el problema que este ADR resuelve.
