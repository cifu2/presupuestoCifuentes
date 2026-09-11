-- Descuento automático frente a descuento por código (CIF-74, hallazgo B2 de la revisión de CIF-71).
--
-- Hasta ahora el adaptador Prisma derivaba el código del descuento de `code`, así que un descuento
-- automático (sin código de descuento en el dominio) no se podía representar: al leerlo de base de
-- datos volvía como descuento por código. `discount_code` guarda la referencia del descuento y
-- `NULL` significa descuento automático.

ALTER TABLE "tariff_modifier" ADD COLUMN "discount_code" VARCHAR(32);

-- Los descuentos ya guardados eran por código: su `code` era el código de descuento.
UPDATE "tariff_modifier" SET "discount_code" = "code" WHERE "target" = 'discount';

ALTER TABLE "tariff_modifier" DROP CONSTRAINT "tariff_modifier_target_ref_check";

ALTER TABLE "tariff_modifier"
  ADD CONSTRAINT "tariff_modifier_target_ref_check"
    CHECK (
      ("target" = 'finish' AND "finish_id" IS NOT NULL AND "color_id" IS NULL AND "accessory_id" IS NULL
        AND "discount_code" IS NULL)
      OR ("target" = 'color' AND "color_id" IS NOT NULL AND "finish_id" IS NULL AND "accessory_id" IS NULL
        AND "discount_code" IS NULL)
      OR ("target" = 'accessory' AND "accessory_id" IS NOT NULL AND "finish_id" IS NULL AND "color_id" IS NULL
        AND "discount_code" IS NULL)
      OR ("target" IN ('installation', 'shipping', 'urgency')
        AND "finish_id" IS NULL AND "color_id" IS NULL AND "accessory_id" IS NULL
        AND "discount_code" IS NULL)
      OR ("target" = 'discount' AND "finish_id" IS NULL AND "color_id" IS NULL AND "accessory_id" IS NULL
        AND ("discount_code" IS NULL OR length("discount_code") > 0))
    );
