-- Reversión de `20260912110000_reserva_entrega_presupuesto`.
--
-- Quita la reserva del intento. Sin ella, dos entregas simultáneas de la misma clave vuelven a
-- poder enviar dos correos; revertir solo con el flujo de entrega detenido.
ALTER TABLE "quote_delivery" DROP COLUMN IF EXISTS "claimed_at";
