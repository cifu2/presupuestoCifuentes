-- DropForeignKey
ALTER TABLE "public"."color" DROP CONSTRAINT "color_finish_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."series_finish" DROP CONSTRAINT "series_finish_series_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."series_finish" DROP CONSTRAINT "series_finish_finish_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."series_accessory" DROP CONSTRAINT "series_accessory_series_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."series_accessory" DROP CONSTRAINT "series_accessory_accessory_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."tariff_version" DROP CONSTRAINT "tariff_version_series_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."manual_quote_request" DROP CONSTRAINT "manual_quote_request_series_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."manual_quote_request" DROP CONSTRAINT "manual_quote_request_finish_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."manual_quote_request" DROP CONSTRAINT "manual_quote_request_color_id_fkey";

-- DropTable
DROP TABLE "public"."door_series";

-- DropTable
DROP TABLE "public"."finish";

-- DropTable
DROP TABLE "public"."color";

-- DropTable
DROP TABLE "public"."accessory";

-- DropTable
DROP TABLE "public"."series_finish";

-- DropTable
DROP TABLE "public"."series_accessory";

-- DropTable
DROP TABLE "public"."catalog_text";

-- DropTable
DROP TABLE "public"."tariff_version";

-- DropTable
DROP TABLE "public"."manual_quote_request";

-- DropEnum
DROP TYPE "public"."catalog_status";

-- DropEnum
DROP TYPE "public"."pricing_strategy";

-- DropEnum
DROP TYPE "public"."tariff_status";

-- DropEnum
DROP TYPE "public"."manual_quote_reason";

-- DropEnum
DROP TYPE "public"."manual_quote_status";

-- DropEnum
DROP TYPE "public"."catalog_entity_type";

-- DropEnum
DROP TYPE "public"."catalog_text_field";

-- DropEnum
DROP TYPE "public"."accessory_category";

