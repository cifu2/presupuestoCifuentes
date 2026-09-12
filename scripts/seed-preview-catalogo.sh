#!/usr/bin/env bash
#
# Siembra el catálogo de demostración en la base de datos de **preview** (CIF-330).
#
# Por qué existe: la base `presupuesto_preview` arranca vacía, así que el preview de un PR muestra el
# configurador en estado «todavía no hay ninguna serie publicada» y QA no puede ejercer el flujo
# completo (emitir presupuesto y descargar el PDF). `CATALOG_DEMO_MODE=true` **no basta** en Vercel:
# el catálogo de demostración vive en memoria del proceso y cada ruta es una función distinta, así
# que el presupuesto emitido por `POST /api/quotes` no lo ve `GET /api/quotes/:ref/pdf` (CIF-330).
#
# Datos **inventados** de demostración, los mismos que `src/infrastructure/demo/demo-catalog.ts`: no
# son tarifas comerciales de Puertas Cifuentes ni contienen datos de clientes. La base de preview es
# desechable (ADR-0009 §2), así que sembrarla no tiene riesgo para producción.
#
# Uso:
#   PREVIEW_DATABASE_URL='postgresql://…/presupuesto_preview' scripts/seed-preview-catalogo.sh
#
# La guarda de destino aborta (código 78) si el nombre de la base no contiene «preview» o si menciona
# producción: este script nunca escribe fuera de preview. Es **idempotente** (upserts por clave
# natural) y no borra presupuestos emitidos: se puede repetir sin perder trabajo de QA.
set -euo pipefail

EXIT_CONFIG=78
EXIT_FALTA_PSQL=69

DB_URL="${PREVIEW_DATABASE_URL:-${DATABASE_URL:-}}"

if [[ -z "$DB_URL" ]]; then
  cat >&2 <<'TXT'
ERROR: falta la cadena de conexión de la base de preview.

Define PREVIEW_DATABASE_URL (preferido) o DATABASE_URL apuntando a la base de preview:

    PREVIEW_DATABASE_URL='postgresql://…/presupuesto_preview' scripts/seed-preview-catalogo.sh

La cadena se pasa a psql tal cual: no se imprime ni se escribe en ningún fichero.
TXT
  exit "$EXIT_CONFIG"
fi

# Nombre de la base sin credenciales ni parámetros: es lo único que este script imprime.
database_name() {
  local url="${1%%\?*}"
  printf '%s' "${url##*/}"
}

DB_NAME="$(database_name "$DB_URL")"

if [[ -z "$DB_NAME" || "$DB_NAME" == *production* || "$DB_NAME" == *prod* ]]; then
  printf 'ERROR: «%s» no es una base de preview. No se ha escrito nada.\n' "$DB_NAME" >&2
  exit "$EXIT_CONFIG"
fi

if [[ "$DB_NAME" != *preview* ]]; then
  printf 'ERROR: «%s» no lleva «preview» en el nombre y la guarda no puede confirmar el destino.\n' "$DB_NAME" >&2
  echo "Este paso solo siembra bases de preview (ADR-0009 §2). No se ha escrito nada." >&2
  exit "$EXIT_CONFIG"
fi

command -v psql >/dev/null 2>&1 || {
  echo "falta psql (cliente de PostgreSQL)" >&2
  exit "$EXIT_FALTA_PSQL"
}

psql --dbname="$DB_URL" -X -q --set=ON_ERROR_STOP=1 <<'SQL'

-- Transacción única: o queda el catálogo de demostración completo, o no queda nada.
BEGIN;

-- Acabados. Los ids son fijos y legibles para que la siembra sea reproducible.
INSERT INTO finish (id, code, status, sort_order, created_at, updated_at) VALUES
  ('0192f1b0-0000-7000-8000-0000000000f1', 'LACADO', 'PUBLISHED', 1, now(), now()),
  ('0192f1b0-0000-7000-8000-0000000000f2', 'MADERA', 'PUBLISHED', 2, now(), now())
ON CONFLICT (code) DO UPDATE
  SET status = EXCLUDED.status, sort_order = EXCLUDED.sort_order, updated_at = now();

-- Colores (el `finish_id` se resuelve por código: nunca por un id fijo que pueda no existir).
INSERT INTO color (id, finish_id, code, hex, status, sort_order, created_at, updated_at)
SELECT v.id::uuid, f.id, v.code, v.hex, 'PUBLISHED'::catalog_status, v.sort_order, now(), now()
FROM (VALUES
  ('0192f1b0-0000-7000-8000-0000000000c1', 'LACADO', 'RAL-9010', '#F1EDE1', 1),
  ('0192f1b0-0000-7000-8000-0000000000c2', 'LACADO', 'RAL-7016', '#383E42', 2),
  ('0192f1b0-0000-7000-8000-0000000000c3', 'MADERA', 'ROBLE', '#B98A54', 1)
) AS v(id, finish_code, code, hex, sort_order)
JOIN finish f ON f.code = v.finish_code
ON CONFLICT (finish_id, code) DO UPDATE
  SET hex = EXCLUDED.hex, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order, updated_at = now();

-- Accesorios.
INSERT INTO accessory (id, code, category, status, sort_order, created_at, updated_at) VALUES
  ('0192f1b0-0000-7000-8000-0000000000a1', 'MANILLA-A', 'HARDWARE', 'PUBLISHED', 1, now(), now()),
  ('0192f1b0-0000-7000-8000-0000000000a2', 'CIERRAPUERTAS', 'CLOSING', 'PUBLISHED', 2, now(), now()),
  ('0192f1b0-0000-7000-8000-0000000000a3', 'VIDRIO-TRASERO', 'GLASS', 'PUBLISHED', 3, now(), now())
ON CONFLICT (code) DO UPDATE
  SET category = EXCLUDED.category, status = EXCLUDED.status, sort_order = EXCLUDED.sort_order, updated_at = now();

-- Series publicadas: CI-100 (precio por m²), CI-200 (tramos), CI-300 (precio fijo) y CI-400
-- (publicada sin tarifa vigente: el configurador la manda a presupuesto manual).
INSERT INTO door_series (id, code, slug, status, min_width_mm, max_width_mm, min_height_mm, max_height_mm, sort_order, created_at, updated_at) VALUES
  ('0192f1b0-0000-7000-8000-000000000101', 'CI-100', 'ci-100', 'PUBLISHED', 600, 1000, 1800, 2200, 1, now(), now()),
  ('0192f1b0-0000-7000-8000-000000000201', 'CI-200', 'ci-200', 'PUBLISHED', 700, 1200, 1900, 2400, 2, now(), now()),
  ('0192f1b0-0000-7000-8000-000000000301', 'CI-300', 'ci-300', 'PUBLISHED', 500, 900, 1500, 2100, 3, now(), now()),
  ('0192f1b0-0000-7000-8000-000000000401', 'CI-400', 'ci-400', 'PUBLISHED', 600, 1000, 1800, 2200, 4, now(), now())
ON CONFLICT (slug) DO UPDATE
  SET code = EXCLUDED.code, status = EXCLUDED.status,
      min_width_mm = EXCLUDED.min_width_mm, max_width_mm = EXCLUDED.max_width_mm,
      min_height_mm = EXCLUDED.min_height_mm, max_height_mm = EXCLUDED.max_height_mm,
      sort_order = EXCLUDED.sort_order, updated_at = now();

-- Compatibilidades serie ↔ acabado ↔ accesorio.
INSERT INTO series_finish (series_id, finish_id)
SELECT s.id, f.id
FROM (VALUES
  ('ci-100', 'LACADO'), ('ci-100', 'MADERA'), ('ci-200', 'LACADO'),
  ('ci-300', 'MADERA'), ('ci-400', 'LACADO')
) AS v(series_slug, finish_code)
JOIN door_series s ON s.slug = v.series_slug
JOIN finish f ON f.code = v.finish_code
ON CONFLICT DO NOTHING;

INSERT INTO series_accessory (series_id, accessory_id)
SELECT s.id, a.id
FROM (VALUES
  ('ci-100', 'MANILLA-A'), ('ci-100', 'CIERRAPUERTAS'), ('ci-100', 'VIDRIO-TRASERO'),
  ('ci-200', 'MANILLA-A'), ('ci-300', 'MANILLA-A')
) AS v(series_slug, accessory_code)
JOIN door_series s ON s.slug = v.series_slug
JOIN accessory a ON a.code = v.accessory_code
ON CONFLICT DO NOTHING;

-- Tarifas publicadas. La restricción de no solape solo admite una publicada por serie y vigencia.
INSERT INTO tariff_version (id, series_id, version_number, status, strategy, valid_from, valid_until, tax_rate_percent, currency, notes, published_at, created_at, updated_at)
SELECT v.id::uuid, s.id, v.version_number, 'PUBLISHED'::tariff_status, v.strategy::pricing_strategy,
       v.valid_from::date, NULL, 21.00, 'EUR', 'Datos de demostración (CIF-330)', now(), now(), now()
FROM (VALUES
  ('0192f1b0-0000-7000-8000-000000001001', 'ci-100', 1, 'per_square_metre', '2026-01-01'),
  ('0192f1b0-0000-7000-8000-000000002001', 'ci-200', 1, 'size_bands', '2026-01-01'),
  ('0192f1b0-0000-7000-8000-000000003001', 'ci-300', 1, 'fixed', '2026-01-01')
) AS v(id, series_slug, version_number, strategy, valid_from)
JOIN door_series s ON s.slug = v.series_slug
ON CONFLICT (series_id, version_number) DO UPDATE
  SET status = EXCLUDED.status, strategy = EXCLUDED.strategy, valid_from = EXCLUDED.valid_from,
      valid_until = EXCLUDED.valid_until, tax_rate_percent = EXCLUDED.tax_rate_percent,
      currency = EXCLUDED.currency, notes = EXCLUDED.notes, published_at = EXCLUDED.published_at,
      updated_at = now();

-- Tabla de precios de cada tarifa publicada (precio por m², tramos o fijo).
INSERT INTO tariff_price_table (tariff_version_id, per_square_metre_cents, fixed_price_cents, created_at, updated_at)
SELECT t.id, v.per_square_metre_cents, v.fixed_price_cents, now(), now()
FROM (VALUES
  ('ci-100', 38000::bigint, NULL::bigint),
  ('ci-200', NULL::bigint, NULL::bigint),
  ('ci-300', NULL::bigint, 145000::bigint)
) AS v(series_slug, per_square_metre_cents, fixed_price_cents)
JOIN door_series s ON s.slug = v.series_slug
JOIN tariff_version t ON t.series_id = s.id AND t.version_number = 1
ON CONFLICT (tariff_version_id) DO UPDATE
  SET per_square_metre_cents = EXCLUDED.per_square_metre_cents,
      fixed_price_cents = EXCLUDED.fixed_price_cents, updated_at = now();

-- Tramos de la tarifa por bandas de CI-200.
INSERT INTO tariff_size_band (id, tariff_price_table_id, label, min_width_mm, max_width_mm, min_height_mm, max_height_mm, price_cents, sort_order, created_at, updated_at)
SELECT v.id::uuid, p.tariff_version_id, v.label::jsonb, v.min_width_mm, v.max_width_mm,
       v.min_height_mm, v.max_height_mm, v.price_cents, v.sort_order, now(), now()
FROM (VALUES
  ('0192f1b0-0000-7000-8000-000000002011', 'ci-200', '{"es":"Mediana","en":"Medium"}', 700, 950, 1900, 2150, 98000, 1),
  ('0192f1b0-0000-7000-8000-000000002012', 'ci-200', '{"es":"Ancha","en":"Wide"}', 951, 1200, 1900, 2150, 118000, 2),
  ('0192f1b0-0000-7000-8000-000000002013', 'ci-200', '{"es":"Alta","en":"Tall"}', 700, 1200, 2151, 2400, 132000, 3)
) AS v(id, series_slug, label, min_width_mm, max_width_mm, min_height_mm, max_height_mm, price_cents, sort_order)
JOIN door_series s ON s.slug = v.series_slug
JOIN tariff_version t ON t.series_id = s.id AND t.version_number = 1
JOIN tariff_price_table p ON p.tariff_version_id = t.id
ON CONFLICT (id) DO UPDATE
  SET label = EXCLUDED.label, min_width_mm = EXCLUDED.min_width_mm, max_width_mm = EXCLUDED.max_width_mm,
      min_height_mm = EXCLUDED.min_height_mm, max_height_mm = EXCLUDED.max_height_mm,
      price_cents = EXCLUDED.price_cents, sort_order = EXCLUDED.sort_order, updated_at = now();

-- Modificadores de la tarifa de CI-100 (acabado, color, accesorio, instalación, portes, urgencia y
-- descuento con código). Los objetivos de catálogo se resuelven por código.
INSERT INTO tariff_modifier (id, tariff_price_table_id, code, label, kind, target, discount_code, finish_id, color_id, accessory_id, amount_cents, percentage, sort_order, created_at, updated_at)
SELECT v.id::uuid, p.tariff_version_id, v.code, v.label::jsonb, v.kind::modifier_kind, v.target::modifier_target,
       v.discount_code, f.id, c.id, a.id, v.amount_cents, v.percentage, v.sort_order, now(), now()
FROM (VALUES
  ('0192f1b0-0000-7000-8000-0000000010a1', 'ACABADO-LACADO', '{"es":"Acabado lacado","en":"Lacquered finish"}', 'fixed', 'finish', NULL, 'LACADO', NULL, NULL, 4500::bigint, NULL::numeric, 1),
  ('0192f1b0-0000-7000-8000-0000000010a2', 'COLOR-RAL-7016', '{"es":"Color gris antracita","en":"Anthracite grey colour"}', 'fixed', 'color', NULL, NULL, 'RAL-7016', NULL, 2500::bigint, NULL::numeric, 2),
  ('0192f1b0-0000-7000-8000-0000000010a3', 'MANILLA-A', '{"es":"Manilla de acero","en":"Steel handle"}', 'per_unit', 'accessory', NULL, NULL, NULL, 'MANILLA-A', 3200::bigint, NULL::numeric, 3),
  ('0192f1b0-0000-7000-8000-0000000010a4', 'INSTALACION', '{"es":"Instalación","en":"Installation"}', 'fixed', 'installation', NULL, NULL, NULL, NULL, 18000::bigint, NULL::numeric, 4),
  ('0192f1b0-0000-7000-8000-0000000010a5', 'PORTES', '{"es":"Portes","en":"Delivery"}', 'fixed', 'shipping', NULL, NULL, NULL, NULL, 9500::bigint, NULL::numeric, 5),
  ('0192f1b0-0000-7000-8000-0000000010a6', 'URGENCIA', '{"es":"Entrega urgente","en":"Express delivery"}', 'percentage', 'urgency', NULL, NULL, NULL, NULL, NULL::bigint, 5.00::numeric, 6),
  ('0192f1b0-0000-7000-8000-0000000010a7', 'PROMO10', '{"es":"Descuento promocional","en":"Promotional discount"}', 'percentage', 'discount', 'PROMO10', NULL, NULL, NULL, NULL::bigint, 10.00::numeric, 7)
) AS v(id, code, label, kind, target, discount_code, finish_code, color_code, accessory_code, amount_cents, percentage, sort_order)
JOIN door_series s ON s.slug = 'ci-100'
JOIN tariff_version t ON t.series_id = s.id AND t.version_number = 1
JOIN tariff_price_table p ON p.tariff_version_id = t.id
LEFT JOIN finish f ON f.code = v.finish_code
LEFT JOIN color c ON c.code = v.color_code
LEFT JOIN accessory a ON a.code = v.accessory_code
ON CONFLICT (tariff_price_table_id, code) DO UPDATE
  SET label = EXCLUDED.label, kind = EXCLUDED.kind, target = EXCLUDED.target,
      discount_code = EXCLUDED.discount_code, finish_id = EXCLUDED.finish_id, color_id = EXCLUDED.color_id,
      accessory_id = EXCLUDED.accessory_id, amount_cents = EXCLUDED.amount_cents,
      percentage = EXCLUDED.percentage, sort_order = EXCLUDED.sort_order, updated_at = now();

-- Textos multi-idioma (nombre y descripción) de series, acabados, colores y accesorios.
INSERT INTO catalog_text (id, entity_type, entity_id, field, locale, value, created_at, updated_at)
SELECT gen_random_uuid(), 'SERIES'::catalog_entity_type, s.id, v.field::catalog_text_field, v.locale, v.value, now(), now()
FROM (VALUES
  ('ci-100', 'NAME', 'es', 'Serie CI-100'), ('ci-100', 'NAME', 'en', 'CI-100 series'),
  ('ci-100', 'DESCRIPTION', 'es', 'Puerta de paso interior con acabado a elegir'),
  ('ci-100', 'DESCRIPTION', 'en', 'Interior door with a choice of finish'),
  ('ci-200', 'NAME', 'es', 'Serie CI-200'), ('ci-200', 'NAME', 'en', 'CI-200 series'),
  ('ci-200', 'DESCRIPTION', 'es', 'Puerta de grandes dimensiones por bandas'),
  ('ci-200', 'DESCRIPTION', 'en', 'Large-format door priced by size band'),
  ('ci-300', 'NAME', 'es', 'Serie CI-300'), ('ci-300', 'NAME', 'en', 'CI-300 series'),
  ('ci-400', 'NAME', 'es', 'Serie CI-400'), ('ci-400', 'NAME', 'en', 'CI-400 series'),
  ('ci-400', 'DESCRIPTION', 'es', 'Serie publicada sin tarifa vigente (pasa a presupuesto manual)'),
  ('ci-400', 'DESCRIPTION', 'en', 'Published series without a tariff in force (manual quote)')
) AS v(slug, field, locale, value)
JOIN door_series s ON s.slug = v.slug
ON CONFLICT (entity_type, entity_id, field, locale) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO catalog_text (id, entity_type, entity_id, field, locale, value, created_at, updated_at)
SELECT gen_random_uuid(), 'FINISH'::catalog_entity_type, f.id, v.field::catalog_text_field, v.locale, v.value, now(), now()
FROM (VALUES
  ('LACADO', 'NAME', 'es', 'Lacado'), ('LACADO', 'NAME', 'en', 'Lacquered'),
  ('LACADO', 'DESCRIPTION', 'es', 'Acabado lacado liso'), ('LACADO', 'DESCRIPTION', 'en', 'Smooth lacquered finish'),
  ('MADERA', 'NAME', 'es', 'Chapa natural'), ('MADERA', 'NAME', 'en', 'Natural wood veneer')
) AS v(code, field, locale, value)
JOIN finish f ON f.code = v.code
ON CONFLICT (entity_type, entity_id, field, locale) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO catalog_text (id, entity_type, entity_id, field, locale, value, created_at, updated_at)
SELECT gen_random_uuid(), 'COLOR'::catalog_entity_type, c.id, v.field::catalog_text_field, v.locale, v.value, now(), now()
FROM (VALUES
  ('RAL-9010', 'NAME', 'es', 'Blanco puro'), ('RAL-9010', 'NAME', 'en', 'Pure white'),
  ('RAL-7016', 'NAME', 'es', 'Gris antracita'), ('RAL-7016', 'NAME', 'en', 'Anthracite grey'),
  ('ROBLE', 'NAME', 'es', 'Roble'), ('ROBLE', 'NAME', 'en', 'Oak')
) AS v(code, field, locale, value)
JOIN color c ON c.code = v.code
ON CONFLICT (entity_type, entity_id, field, locale) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO catalog_text (id, entity_type, entity_id, field, locale, value, created_at, updated_at)
SELECT gen_random_uuid(), 'ACCESSORY'::catalog_entity_type, a.id, v.field::catalog_text_field, v.locale, v.value, now(), now()
FROM (VALUES
  ('MANILLA-A', 'NAME', 'es', 'Manilla de acero'), ('MANILLA-A', 'NAME', 'en', 'Steel handle'),
  ('CIERRAPUERTAS', 'NAME', 'es', 'Cierrapuertas'), ('CIERRAPUERTAS', 'NAME', 'en', 'Door closer'),
  ('VIDRIO-TRASERO', 'NAME', 'es', 'Vidrio trasero'), ('VIDRIO-TRASERO', 'NAME', 'en', 'Rear glazing')
) AS v(code, field, locale, value)
JOIN accessory a ON a.code = v.code
ON CONFLICT (entity_type, entity_id, field, locale) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

COMMIT;

SQL

read -r series tarifas < <(
  psql --dbname="$DB_URL" -X -q -A -t -F' ' --set=ON_ERROR_STOP=1 \
    -c "SELECT count(*) FILTER (WHERE status = 'PUBLISHED'), (SELECT count(*) FROM tariff_version WHERE status = 'PUBLISHED') FROM door_series"
)

printf 'sembrado en «%s»: %s series publicadas, %s tarifas publicadas\n' "$DB_NAME" "$series" "$tarifas"
