-- Reversión de `20260911130000_tarifas_precios_y_presupuestos`.
-- Deja el esquema en el estado de `20260911120000_catalogo_y_tarifas`.
DROP TABLE IF EXISTS "quote_line";
DROP TABLE IF EXISTS "quote";
DROP TABLE IF EXISTS "quote_reference_counter";
DROP TABLE IF EXISTS "tariff_modifier";
DROP TABLE IF EXISTS "tariff_size_band";
DROP TABLE IF EXISTS "tariff_price_table";
DROP TYPE IF EXISTS "quote_line_kind";
DROP TYPE IF EXISTS "quote_status";
DROP TYPE IF EXISTS "modifier_target";
DROP TYPE IF EXISTS "modifier_kind";
