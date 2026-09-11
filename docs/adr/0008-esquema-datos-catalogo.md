# ADR-0008 — Esquema de datos del catálogo y migraciones reversibles

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO (confirmado en la revisión de CIF-3)
- **Ámbito:** modelo de datos persistido, migraciones y traducciones

## Contexto

CIF-3 necesitaba el modelo de dominio y el esquema de datos del catálogo: series con **tamaño máximo
por serie**, acabados, colores, accesorios, tarifas versionadas por vigencia, textos multi-idioma y
solicitudes de presupuesto manual. El repositorio solo tenía el esqueleto de Prisma (generador y
datasource) y una migración que aún no existía.

Restricciones: PostgreSQL + Prisma 7, despliegue en Vercel, el propietario no es técnico y el
dominio debe poder testearse sin base de datos.

## Decisión

1. **Una tabla por agregado del catálogo** (`door_series`, `finish`, `color`, `accessory`) con
   identificadores UUID v7, `code` único legible para el propietario y `slug` único para la URL
   pública. El estado editorial (`draft`/`published`/`archived`) se guarda como enum en cada tabla.
2. **El tamaño máximo vive en la serie**: `min_width_mm`, `max_width_mm`, `min_height_mm` y
   `max_height_mm`, en milímetros enteros. Superar el máximo (o no llegar al mínimo) es lo que
   dispara el paso a presupuesto manual; la regla se implementa en el dominio
   (`SizeRange.assess`) **y** se protege en la base de datos con `CHECK`.
3. **Compatibilidades explícitas** con tablas puente `series_finish` y `series_accessory`; no se
   infieren por convención de nombres.
4. **Traducciones en una única tabla polimórfica** `catalog_text`
   (`entity_type`, `entity_id`, `field`, `locale`, `value`) con índice único por
   entidad+campo+idioma. Se elige polimórfica en lugar de una tabla por entidad porque el panel
   edita traducciones de todas las entidades con el mismo formulario y añadir un campo traducible no
   debe generar una migración de esquema. **Contrapartida asumida:** `entity_id` no puede llevar
   clave ajena; la integridad la garantiza la capa de aplicación y el borrado de traducciones se
   hace al borrar la entidad.
5. **Tarifa versionada por vigencia**: `tariff_version` con `version_number` (único por serie),
   `strategy`, `valid_from`/`valid_until` (`DATE`, intervalo semiabierto `[desde, hasta)`) y
   `tax_rate_percent` (`NUMERIC(5,2)`). La invariante "como máximo una versión vigente por serie" se
   valida en dominio (`selectTariffInForce`) y al publicar
   (`assertNoOverlappingPublishedTariffs`); el desglose de precios (bandas y modificadores) llega
   con CIF-4 como migración propia.
6. **Nombres en `snake_case`** en la base de datos (`@@map`/`@map`) para que el propietario y los
   informes SQL trabajen cómodos, manteniendo los modelos de Prisma en `PascalCase`.
7. **Migraciones versionadas y reversibles**: `prisma/migrations/<timestamp>_<nombre>/migration.sql`
   es la migración aplicable; junto a ella se guarda `down.sql` con el guion de reversión, que se
   verifica aplicando la migración, comprobando las tablas y las restricciones, y ejecutando
   `down.sql` hasta dejar el esquema vacío.
8. **Datos personales mínimos**: la solicitud de presupuesto manual guarda nombre, email y teléfono
   porque son imprescindibles para contactar al cliente; nada más. La configuración pedida se guarda
   como `configuration_snapshot` para el comercial.

## Consecuencias

- El configurador y el panel (CIF-4, CIF-9) tienen ya un esquema estable sobre el que construir
  adaptadores Prisma; los puertos viven en `src/application/ports`.
- Las restricciones `CHECK` (rangos de medida, vigencia, IVA, hex de color) actúan como última red:
  Prisma no las modela en el schema, así que **toda migración futura que toque esos campos debe
  reproducirlas**; están documentadas aquí y en la propia migración.
- La tabla polimórfica de traducciones impide la integridad referencial de las traducciones: se
  compensa con una tarea de limpieza al borrar una entidad y con el índice único.
- El dominio sigue sin depender de Prisma: `src/domain/catalog` se testea sin base de datos
  (cobertura ≥ 80 % de la puerta de calidad, hoy 100 %).

## Alternativas consideradas

- **Tablas de traducción por entidad** (`series_text`, `finish_text`…): más integridad, pero
  multiplica el esquema y obliga a migrar cada vez que se añade un campo traducible. Descartada.
- **JSON con las traducciones en la propia fila** (`name: { es, en }`): imposible de consultar e
  indexar por idioma y sin validación de claves. Descartada.
- **Tabla de medidas aparte** (`series_measure` con filas por ancho/alto): útil si cada serie tuviera
  una tabla de tallas discretas; el MVP necesita un rango continuo con máximo, que cabe en la serie.
  Si el propietario pide tallas discretas, se añade como migración nueva.
- **Índice de exclusión (`EXCLUDE USING gist`) para impedir solapes de tarifas en base de datos**:
  obliga a la extensión `btree_gist` y complica el despliegue en Vercel. Se pospone; la invariante se
  protege en dominio y aplicación.
