# ADR-0026 — Catálogo de producción y validación en entornos desplegados

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (CIF-381), dentro de ADR-0015 §7 y del límite de ADR-0009 §2. La excepción del
  punto 6 exige aprobación explícita de negocio (CEO o propietario).
- **Ámbito:** datos, entornos, validación desplegada y release

## Contexto

CIF-381 cierra CIF-345 con un hallazgo: producción sirve el configurador **sin ninguna serie
publicada**, así que la superficie pública no puede presupuestar nada —ni en `es` ni en `en`— y el
E2E de regresión del fix de formato en inglés (`b7eee5b`, PR #67) no se puede ejercer contra
producción. Evidencia del 2026-09-12:

- `GET /api/health` → `200` `database: "configured"`: la base responde, no es un fallo de despliegue.
- `GET /api/catalog/series` → `200` `{"data":[],"meta":{"locale":"es","mode":"prisma"}}`, y
  `GET /api/catalog/series/ci-100` → `404 NOT_FOUND`.
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
2. **`CATALOG_DEMO_MODE=true` queda descartado en producción también por motivos técnicos:** la raíz
   de composición pasa a un catálogo en memoria (`src/composition/container.ts`), de modo que el
   panel dejaría de tener efecto sobre la superficie pública y el presupuesto emitido en
   `POST /api/quotes` no lo vería `GET /api/quotes/:ref/pdf` (CIF-330).
3. **El configurador vacío en producción es el estado esperado y documentado** hasta la carga
   inicial del propietario: no es un incidente de despliegue ni un bug y no bloquea ningún release.
4. **La validación desplegada de los flujos que dependen de catálogo se hace en preview con la base
   sembrada** (`scripts/seed-preview-catalogo.sh`, CIF-330), que es el entorno desechable.
   Producción se valida cuando exista catálogo real publicado.
5. **La guarda de destino del seed de demostración no se relaja:** sigue abortando con código 78 si
   el nombre de la base menciona producción o no contiene «preview».
6. **Si negocio decide que producción debe ser demostrable antes de la carga real**, la vía es un
   catálogo de validación _marcado_ y _reversible_, aprobado de forma explícita por el CEO o el
   propietario y ejecutado por DevOps con su propio script y su propia guarda de destino. Esa
   aprobación supercede esta decisión y se registra en un ADR nuevo, no editando este.
7. **Un E2E contra un entorno desplegado (`E2E_BASE_URL`) debe informar de la ausencia de catálogo
   como precondición fallida y con mensaje**, nunca agotar el timeout esperando un selector que no
   puede existir. Un entorno sin datos no debe parecer un fallo del código que se está validando.

## Consecuencias

- QA no puede cerrar contra producción el fix de CIF-345; lo valida en el preview sembrado y
  producción se revalida cuando el propietario publique su catálogo.
- El equipo deja de tratar «configurador vacío en producción» como incidente y deja de buscar una
  causa de código que no existe.
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
