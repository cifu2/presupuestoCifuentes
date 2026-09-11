-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "catalog_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pricing_strategy" AS ENUM ('per_square_metre', 'size_bands', 'fixed');

-- CreateEnum
CREATE TYPE "tariff_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "manual_quote_reason" AS ENUM ('size_exceeds_series_max', 'no_tariff_in_force', 'uncovered_configuration', 'customer_requested');

-- CreateEnum
CREATE TYPE "manual_quote_status" AS ENUM ('PENDING', 'CONTACTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "catalog_entity_type" AS ENUM ('SERIES', 'FINISH', 'COLOR', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "catalog_text_field" AS ENUM ('NAME', 'DESCRIPTION');

-- CreateEnum
CREATE TYPE "accessory_category" AS ENUM ('HARDWARE', 'CLOSING', 'GLASS', 'VENTILATION', 'OTHER');

-- CreateTable
CREATE TABLE "door_series" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "status" "catalog_status" NOT NULL DEFAULT 'DRAFT',
    "min_width_mm" INTEGER NOT NULL,
    "max_width_mm" INTEGER NOT NULL,
    "min_height_mm" INTEGER NOT NULL,
    "max_height_mm" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "door_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finish" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "status" "catalog_status" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "finish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color" (
    "id" UUID NOT NULL,
    "finish_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "hex" CHAR(7),
    "status" "catalog_status" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "color_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "category" "accessory_category" NOT NULL DEFAULT 'OTHER',
    "status" "catalog_status" NOT NULL DEFAULT 'DRAFT',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_finish" (
    "series_id" UUID NOT NULL,
    "finish_id" UUID NOT NULL,

    CONSTRAINT "series_finish_pkey" PRIMARY KEY ("series_id","finish_id")
);

-- CreateTable
CREATE TABLE "series_accessory" (
    "series_id" UUID NOT NULL,
    "accessory_id" UUID NOT NULL,

    CONSTRAINT "series_accessory_pkey" PRIMARY KEY ("series_id","accessory_id")
);

-- CreateTable
CREATE TABLE "catalog_text" (
    "id" UUID NOT NULL,
    "entity_type" "catalog_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "field" "catalog_text_field" NOT NULL,
    "locale" VARCHAR(5) NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_text_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tariff_version" (
    "id" UUID NOT NULL,
    "series_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "tariff_status" NOT NULL DEFAULT 'DRAFT',
    "strategy" "pricing_strategy" NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "tax_rate_percent" DECIMAL(5,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "notes" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tariff_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_quote_request" (
    "id" UUID NOT NULL,
    "reason" "manual_quote_reason" NOT NULL,
    "status" "manual_quote_status" NOT NULL DEFAULT 'PENDING',
    "series_id" UUID,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "finish_id" UUID,
    "color_id" UUID,
    "accessory_ids" UUID[],
    "locale" VARCHAR(5) NOT NULL,
    "customer_name" VARCHAR(120) NOT NULL,
    "customer_email" VARCHAR(254) NOT NULL,
    "customer_phone" VARCHAR(40),
    "message" TEXT,
    "configuration_snapshot" JSONB,
    "handled_at" TIMESTAMPTZ(3),
    "handled_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "manual_quote_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "door_series_code_key" ON "door_series"("code");

-- CreateIndex
CREATE UNIQUE INDEX "door_series_slug_key" ON "door_series"("slug");

-- CreateIndex
CREATE INDEX "door_series_status_sort_order_idx" ON "door_series"("status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "finish_code_key" ON "finish"("code");

-- CreateIndex
CREATE INDEX "color_finish_id_status_sort_order_idx" ON "color"("finish_id", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "color_finish_id_code_key" ON "color"("finish_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_code_key" ON "accessory"("code");

-- CreateIndex
CREATE INDEX "accessory_category_status_sort_order_idx" ON "accessory"("category", "status", "sort_order");

-- CreateIndex
CREATE INDEX "catalog_text_entity_type_entity_id_field_idx" ON "catalog_text"("entity_type", "entity_id", "field");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_text_entity_type_entity_id_field_locale_key" ON "catalog_text"("entity_type", "entity_id", "field", "locale");

-- CreateIndex
CREATE INDEX "tariff_version_series_id_status_valid_from_idx" ON "tariff_version"("series_id", "status", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "tariff_version_series_id_version_number_key" ON "tariff_version"("series_id", "version_number");

-- CreateIndex
CREATE INDEX "manual_quote_request_status_created_at_idx" ON "manual_quote_request"("status", "created_at");

-- CreateIndex
CREATE INDEX "manual_quote_request_series_id_idx" ON "manual_quote_request"("series_id");

-- AddForeignKey
ALTER TABLE "color" ADD CONSTRAINT "color_finish_id_fkey" FOREIGN KEY ("finish_id") REFERENCES "finish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_finish" ADD CONSTRAINT "series_finish_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "door_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_finish" ADD CONSTRAINT "series_finish_finish_id_fkey" FOREIGN KEY ("finish_id") REFERENCES "finish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_accessory" ADD CONSTRAINT "series_accessory_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "door_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_accessory" ADD CONSTRAINT "series_accessory_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tariff_version" ADD CONSTRAINT "tariff_version_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "door_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_quote_request" ADD CONSTRAINT "manual_quote_request_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "door_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_quote_request" ADD CONSTRAINT "manual_quote_request_finish_id_fkey" FOREIGN KEY ("finish_id") REFERENCES "finish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_quote_request" ADD CONSTRAINT "manual_quote_request_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "color"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Invariantes de dominio que Prisma no expresa en el schema (ver src/domain/catalog).
-- Medidas: milímetros enteros positivos; mínimo nunca por encima del máximo (tamaño máximo por serie).
ALTER TABLE "door_series"
  ADD CONSTRAINT "door_series_min_width_mm_check" CHECK ("min_width_mm" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "door_series_max_width_mm_check" CHECK ("max_width_mm" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "door_series_min_height_mm_check" CHECK ("min_height_mm" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "door_series_max_height_mm_check" CHECK ("max_height_mm" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "door_series_width_range_check" CHECK ("min_width_mm" <= "max_width_mm"),
  ADD CONSTRAINT "door_series_height_range_check" CHECK ("min_height_mm" <= "max_height_mm");

-- Vigencia: fin posterior al inicio (intervalo semiabierto) y periodo de IVA entre 0 y 100.
ALTER TABLE "tariff_version"
  ADD CONSTRAINT "tariff_version_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from"),
  ADD CONSTRAINT "tariff_version_tax_rate_check" CHECK ("tax_rate_percent" >= 0 AND "tax_rate_percent" <= 100);

-- Color hexadecimal canónico #RRGGBB.
ALTER TABLE "color"
  ADD CONSTRAINT "color_hex_check" CHECK ("hex" IS NULL OR "hex" ~ '^#[0-9A-F]{6}$');

-- Solicitudes manuales: medidas opcionales pero, si existen, válidas.
ALTER TABLE "manual_quote_request"
  ADD CONSTRAINT "manual_quote_request_width_check" CHECK ("width_mm" IS NULL OR "width_mm" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "manual_quote_request_height_check" CHECK ("height_mm" IS NULL OR "height_mm" BETWEEN 1 AND 10000);
