# ADR-0026 — Catálogo de producción y validación en entornos desplegados

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (CIF-381), dentro de ADR-0015 §7 y del límite de ADR-0009 §2. La excepción del
  punto 6 exige aprobación explícita de negocio (CEO o propietario).
- **Revisión:** CIF-385 (Backend) devolvió NO PASA a la revisión 1 (`f2ed78b`): la evidencia de
  `/api/health` no probaba que la base respondiera (F1) y faltaban dos consecuencias (F3, F4). Esta
  revisión 2 corrige F1–F6 según CIF-428.
- **Ámbito:** datos, entornos, validación desplegada y release

## Contexto

CIF-381 cierra CIF-345 con un hallazgo: producción sirve el configurador **sin ninguna serie
publicada**, así que la superficie pública no puede presupuestar nada —ni en `es` ni en `en`— y el
E2E de regresión del fix de formato en inglés (`b7eee5b`, PR #67) no se puede ejercer contra
producción. Evidencia del 2026-09-12:

- `GET /api/catalog/series` → `200` `{"data":[],"meta":{"locale":"es","mode":"prisma"}}`, y
  `GET /api/catalog/series/ci-100` → `404 NOT_FOUND`: la consulta se ejecutó **contra la base**
  (`mode:"prisma"`) y no encontró ninguna serie. «La base responde y está migrada» se apoya en esta
  evidencia, no en `/api/health`.
- `GET /api/health` → `200` `database: "configured"` **no** prueba que la base responda en `main`:
  la ruta solo refleja si `DATABASE_URL` está definida (`src/app/api/health/route.ts`) y
  `getSystemStatus` es la plantilla síncrona que no toca la base. La sonda que sí la consulta y
  distingue `ok` de `unreachable`/`unmigrated` + `503` (CIF-112/CIF-144, ratificada en CIF-146) quedó
  en ramas **sin fusionar**; aterrizarla en `main` es la dependencia abierta **CIF-429**.
- El selector `configurator-series` no llega a existir en el DOM, así que el E2E espera hasta agotar
  el timeout en vez de informar de la causa.

La política de datos ya estaba fijada: ADR-0015 §7 dice que los datos de negocio **no** se siembran
desde el repositorio, que la base de producción nace vacía y que el catálogo real lo carga el
propietario desde el panel; ADR-0009 §2 reserva los datos de prueba para entornos desechables. Lo
que faltaba era su consecuencia operativa: qué se espera de producción mientras no exista catálogo
real y dónde se validan los flujos que sí dependen de catálogo.

## Decisión

1. **Producción sirve solo catálogo real publicado por el propietario desde el panel.** No se siembra
   el catálogo de demostración en la base de producción: ni con un script, ni copiando la base de
   preview, ni con `CATALOG_DEMO_MODE=true`.
2. **`CATALOG_DEMO_MODE=true` queda descartado en producción por tres motivos:**
   - **Seguridad:** en _Production_ la bandera también **abre la guarda del shell del panel**
     (`src/ui/admin/admin-access.ts`: `isPanelEnabled || isDemoCatalog`, ADR-0023 §5);
     `scripts/despliegue-preflight.sh` rechaza el despliegue si la encuentra activa.
   - **Efecto del panel:** la raíz de composición pasa a un catálogo en memoria
     (`src/composition/container.ts`, `useDemo = env.CATALOG_DEMO_MODE || !env.DATABASE_URL`). En
     Vercel cada ruta es una función distinta, así que la escritura del panel y la lectura de la
     superficie pública no comparten el `InMemoryCatalogStore` y el panel dejaría de tener efecto
     sobre la web pública. (Dentro de un mismo proceso sí comparten instancia; es lo que ocurre en
     local y en el E2E hermético.)
   - **Entrega:** el presupuesto emitido en `POST /api/quotes` no lo vería
     `GET /api/quotes/:ref/pdf` (CIF-330).
3. **El configurador vacío en producción es el estado esperado y documentado** hasta la carga
   inicial del propietario: **no es un incidente técnico ni un bug de código**, y el equipo deja de
   buscarle una causa que no existe. No es una afirmación de disponibilidad: aceptar que la web
   pública siga vacía es una decisión de negocio (ADR-0015 §7, en curso en CIF-114 con el CEO y el
   propietario), no algo que este ADR declare por sí solo. Mientras la sonda de CIF-112/CIF-144 no
   esté en `main` (**CIF-429**), §3 no es verificable en producción: desde fuera, «catálogo vacío» y
   «base inalcanzable o sin migrar» se ven igual.
4. **La validación desplegada de los flujos que dependen de catálogo se hace en preview con la base
   sembrada** (`scripts/seed-preview-catalogo.sh`, CIF-330), que es el entorno desechable.
   Producción se valida cuando exista catálogo real publicado.
5. **La guarda de destino del seed de demostración no se relaja:** sigue abortando con código 78 si
   el nombre de la base menciona producción o no contiene «preview».
6. **Si negocio decide que producción debe ser demostrable antes de la carga real**, la vía es un
   catálogo de validación _marcado_ y _reversible_, aprobado de forma explícita por el CEO o el
   propietario y ejecutado por DevOps con su propio script y su propia guarda de destino. Esa
   aprobación supercede esta decisión y se registra en un ADR nuevo, no editando este.
7. **Un E2E contra un entorno desplegado no productivo (`E2E_BASE_URL` en preview o en local
   sembrado, nunca _Production_: ADR-0025 §5 prohíbe producción como banco de pruebas de E2E) debe
   informar de la ausencia de catálogo como precondición fallida y con mensaje**, nunca agotar el
   timeout esperando un selector que no puede existir. Un entorno sin datos no debe parecer un fallo
   del código que se está validando.

## Consecuencias

- QA no puede cerrar contra producción el fix de CIF-345; lo valida en el preview sembrado y
  producción se revalida cuando el propietario publique su catálogo.
- El equipo deja de tratar «configurador vacío en producción» como incidente y deja de buscar una
  causa de código que no existe.
- **§3 no es verificable en producción hasta que aterrice en `main` la sonda de CIF-112/CIF-144
  (CIF-429, Backend).** Sin ella, `/api/health` no distingue catálogo vacío de base inalcanzable o
  sin migrar; hasta entonces §3 se sostiene por la evidencia de catálogo (`mode:"prisma"`, `data:[]`,
  `404`), no por la salud de la base. Bloquea dar §3 por operativo, no la decisión en sí.
- **El copy del estado vacío engaña al visitante:** `Configurator.catalog.empty` promete «Vuelve a
  intentarlo en unos minutos» (`messages/es.json`, ídem `en.json`) para un estado que puede durar
  días. Alinearlo es trabajo con dueño en **CIF-430** (Frontend).
- La carga real del catálogo sigue dependiendo de dos trabajos ya abiertos: el panel de
  administración (CIF-9, con la lectura y la escritura en curso) y el material del propietario
  (CIF-13), más la decisión de negocio de CIF-114.
- Cada validación desplegada que dependa de catálogo consume un preview y su siembra; se reutiliza un
  preview ya abierto en lugar de crear uno nuevo por corrida (ADR-0019).
- Trabajo derivado con dueño: la precondición del punto 7 se implementa en la revalidación de QA
  hija de CIF-381, no como cambio suelto de este ADR.

## Alternativas consideradas

- **Sembrar el catálogo de demostración en producción** (opción b del reporte de CIF-381): descartada
  por defecto. Mezclaría datos inventados con el sistema de registro del cliente, publicaría precios
  falsos bajo la marca del propietario y dejaría a la carga real un catálogo que hay que limpiar
  antes. Es una decisión de negocio, no de infraestructura, y solo entra con el punto 6.
- **`CATALOG_DEMO_MODE=true` en el entorno _Production_ de Vercel:** descartada por el punto 2 y
  porque el catálogo en memoria no sobrevive al cambio de función entre rutas.
- **Copiar la base de preview a producción:** descartada por ADR-0009 §2 y por ADR-0015 §1.
- **Dejar el E2E de regresión en rojo sin diagnóstico hasta que haya catálogo real:** descartada; el
  punto 7 le da un fallo explícito y la validación se ejerce en preview.
