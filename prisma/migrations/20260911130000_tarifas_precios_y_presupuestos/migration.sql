-- CreateEnum
CREATE TYPE "modifier_kind" AS ENUM ('fixed', 'per_unit', 'percentage');

-- CreateEnum
CREATE TYPE "modifier_target" AS ENUM ('finish', 'color', 'accessory', 'installation', 'shipping', 'urgency', 'discount');

-- CreateEnum
CREATE TYPE "quote_status" AS ENUM ('ISSUED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "quote_line_kind" AS ENUM ('base', 'addition', 'discount');

-- CreateTable
CREATE TABLE "tariff_price_table" (
    "tariff_version_id" UUID NOT NULL,
    "per_square_metre_cents" BIGINT,
    "fixed_price_cents" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tariff_price_table_pkey" PRIMARY KEY ("tariff_version_id")
);

-- CreateTable
CREATE TABLE "tariff_size_band" (
    "id" UUID NOT NULL,
    "tariff_price_table_id" UUID NOT NULL,
    "label" JSONB,
    "min_width_mm" INTEGER NOT NULL,
    "max_width_mm" INTEGER NOT NULL,
    "min_height_mm" INTEGER NOT NULL,
    "max_height_mm" INTEGER NOT NULL,
    "price_cents" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tariff_size_band_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_modifier" (
    "id" UUID NOT NULL,
    "tariff_price_table_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "label" JSONB,
    "kind" "modifier_kind" NOT NULL,
    "target" "modifier_target" NOT NULL,
    "finish_id" UUID,
    "color_id" UUID,
    "accessory_id" UUID,
    "amount_cents" BIGINT,
    "percentage" DECIMAL(5,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tariff_modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "status" "quote_status" NOT NULL DEFAULT 'ISSUED',
    "series_id" UUID NOT NULL,
    "tariff_version_id" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "height_mm" INTEGER NOT NULL,
    "finish_id" UUID,
    "color_id" UUID,
    "accessory_ids" UUID[],
    "extras" TEXT[],
    "discount_code" VARCHAR(32),
    "currency" CHAR(3) NOT NULL,
    "subtotal_cents" BIGINT NOT NULL,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL,
    "tax_cents" BIGINT NOT NULL,
    "total_cents" BIGINT NOT NULL,
    "price_snapshot" JSONB NOT NULL,
    "valid_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_line" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "kind" "quote_line_kind" NOT NULL,
    "label" JSONB,
    "units" INTEGER NOT NULL DEFAULT 1,
    "unit_amount_cents" BIGINT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_reference_counter" (
    "year" INTEGER NOT NULL,
    "last_value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "quote_reference_counter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "tariff_size_band_tariff_price_table_id_sort_order_key" ON "tariff_size_band"("tariff_price_table_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_modifier_tariff_price_table_id_code_key" ON "tariff_modifier"("tariff_price_table_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "quote_reference_key" ON "quote"("reference");

-- CreateIndex
CREATE INDEX "quote_series_id_created_at_idx" ON "quote"("series_id", "created_at");

-- CreateIndex
CREATE INDEX "quote_status_created_at_idx" ON "quote"("status", "created_at");

-- CreateIndex
CREATE INDEX "quote_line_quote_id_sort_order_idx" ON "quote_line"("quote_id", "sort_order");

-- AddForeignKey
ALTER TABLE "tariff_price_table" ADD CONSTRAINT "tariff_price_table_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "tariff_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_size_band" ADD CONSTRAINT "tariff_size_band_tariff_price_table_id_fkey" FOREIGN KEY ("tariff_price_table_id") REFERENCES "tariff_price_table"("tariff_version_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_modifier" ADD CONSTRAINT "tariff_modifier_tariff_price_table_id_fkey" FOREIGN KEY ("tariff_price_table_id") REFERENCES "tariff_price_table"("tariff_version_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_modifier" ADD CONSTRAINT "tariff_modifier_finish_id_fkey" FOREIGN KEY ("finish_id") REFERENCES "finish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_modifier" ADD CONSTRAINT "tariff_modifier_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "color"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_modifier" ADD CONSTRAINT "tariff_modifier_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "door_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_tariff_version_id_fkey" FOREIGN KEY ("tariff_version_id") REFERENCES "tariff_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_finish_id_fkey" FOREIGN KEY ("finish_id") REFERENCES "finish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "color"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariantes de dominio que Prisma no expresa en el schema (ver src/domain/pricing y ADR-0003).
-- Son la última red: la capa de aplicación valida antes de escribir.
ALTER TABLE "tariff_price_table"
  ADD CONSTRAINT "tariff_price_table_non_negative_check"
    CHECK (("per_square_metre_cents" IS NULL OR "per_square_metre_cents" >= 0)
       AND ("fixed_price_cents" IS NULL OR "fixed_price_cents" >= 0)),
  ADD CONSTRAINT "tariff_price_table_not_both_bases_check"
    CHECK (NOT ("per_square_metre_cents" IS NOT NULL AND "fixed_price_cents" IS NOT NULL));

ALTER TABLE "tariff_size_band"
  ADD CONSTRAINT "tariff_size_band_mm_check"
    CHECK ("min_width_mm" BETWEEN 1 AND 10000 AND "max_width_mm" BETWEEN 1 AND 10000
       AND "min_height_mm" BETWEEN 1 AND 10000 AND "max_height_mm" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "tariff_size_band_range_check"
    CHECK ("min_width_mm" <= "max_width_mm" AND "min_height_mm" <= "max_height_mm"),
  ADD CONSTRAINT "tariff_size_band_price_check" CHECK ("price_cents" >= 0),
  ADD CONSTRAINT "tariff_size_band_sort_order_check" CHECK ("sort_order" >= 0);

ALTER TABLE "tariff_modifier"
  ADD CONSTRAINT "tariff_modifier_value_check"
    CHECK (
      ("kind" = 'percentage' AND "percentage" IS NOT NULL AND "amount_cents" IS NULL)
      OR ("kind" IN ('fixed', 'per_unit') AND "amount_cents" IS NOT NULL AND "amount_cents" >= 0 AND "percentage" IS NULL)
    ),
  ADD CONSTRAINT "tariff_modifier_percentage_check"
    CHECK ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100)),
  ADD CONSTRAINT "tariff_modifier_target_ref_check"
    CHECK (
      ("target" = 'finish' AND "finish_id" IS NOT NULL AND "color_id" IS NULL AND "accessory_id" IS NULL)
      OR ("target" = 'color' AND "color_id" IS NOT NULL AND "finish_id" IS NULL AND "accessory_id" IS NULL)
      OR ("target" = 'accessory' AND "accessory_id" IS NOT NULL AND "finish_id" IS NULL AND "color_id" IS NULL)
      OR ("target" IN ('installation', 'shipping', 'urgency', 'discount')
          AND "finish_id" IS NULL AND "color_id" IS NULL AND "accessory_id" IS NULL)
    ),
  ADD CONSTRAINT "tariff_modifier_sort_order_check" CHECK ("sort_order" >= 0);

ALTER TABLE "quote"
  ADD CONSTRAINT "quote_measurements_check"
    CHECK ("width_mm" BETWEEN 1 AND 10000 AND "height_mm" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "quote_tax_rate_check" CHECK ("tax_rate_percent" >= 0 AND "tax_rate_percent" <= 100),
  ADD CONSTRAINT "quote_amounts_check"
    CHECK ("subtotal_cents" >= 0 AND "tax_cents" >= 0 AND "total_cents" = "subtotal_cents" + "tax_cents"),
  ADD CONSTRAINT "quote_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "quote_line"
  ADD CONSTRAINT "quote_line_units_check" CHECK ("units" >= 1),
  ADD CONSTRAINT "quote_line_amounts_check" CHECK ("unit_amount_cents" >= 0 AND "amount_cents" >= 0),
  ADD CONSTRAINT "quote_line_sort_order_check" CHECK ("sort_order" >= 0);

ALTER TABLE "quote_reference_counter"
  ADD CONSTRAINT "quote_reference_counter_year_check" CHECK ("year" BETWEEN 2000 AND 9999),
  ADD CONSTRAINT "quote_reference_counter_value_check" CHECK ("last_value" >= 0);
