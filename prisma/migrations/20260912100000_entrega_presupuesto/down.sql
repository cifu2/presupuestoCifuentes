-- Reversión de `20260912100000_entrega_presupuesto`.
--
-- Elimina el registro de entregas. Se pierde el histórico de envíos y de reintentos: al revertir,
-- la aplicación no puede saber si un presupuesto ya se envió, así que un reintento posterior
-- podría duplicar un correo. Revertir solo con el flujo de entrega detenido.
DROP TABLE IF EXISTS "quote_delivery";
DROP TYPE IF EXISTS "quote_delivery_status";
DROP TYPE IF EXISTS "quote_delivery_audience";
