-- Reversión de `20260911140000_descuento_automatico_en_modificadores`.
-- Vuelve al código de descuento derivado de `code`; los descuentos automáticos no se pueden
-- representar en ese esquema y quedan fuera.

ALTER TABLE "tariff_modifier" DROP CONSTRAINT "tariff_modifier_target_ref_check";

ALTER TABLE "tariff_modifier"
  ADD CONSTRAINT "tariff_modifier_target_ref_check"
    CHECK (
      ("target" = 'finish' AND "finish_id" IS NOT NULL AND "color_id" IS NULL AND "accessory_id" IS NULL)
      OR ("target" = 'color' AND "color_id" IS NOT NULL AND "finish_id" IS NULL AND "accessory_id" IS NULL)
      OR ("target" = 'accessory' AND "accessory_id" IS NOT NULL AND "finish_id" IS NULL AND "color_id" IS NULL)
      OR ("target" IN ('installation', 'shipping', 'urgency', 'discount')
          AND "finish_id" IS NULL AND "color_id" IS NULL AND "accessory_id" IS NULL)
    );

ALTER TABLE "tariff_modifier" DROP COLUMN "discount_code";
