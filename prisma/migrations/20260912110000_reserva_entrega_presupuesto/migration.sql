-- Reserva del intento de entrega (CIF-178, ADR-0004 §5-6).
--
-- `claimed_at` marca el intento que tiene reservada la entrega. Con la clave de idempotencia única,
-- es lo que impide que dos peticiones simultáneas del mismo presupuesto envíen dos correos: el
-- `UPDATE` condicional solo deja reservar si no hay otra reserva viva (15 minutos) o si la entrega
-- ya se envió. Un proceso caído deja caducar la reserva y el reintento puede reclamarla.
ALTER TABLE "quote_delivery" ADD COLUMN "claimed_at" TIMESTAMPTZ(3);
