-- Entrega del presupuesto en PDF y por email (CIF-173, ADR-0004 §5-6).
--
-- Guarda una fila por destinatario y versión del documento con su estado (pendiente, enviada o
-- fallida) y la clave de idempotencia `quote_id + versión + destinatario`. El estado se escribe
-- antes de renderizar el PDF y de enviar el email, para que un fallo no pierda el presupuesto y el
-- reintento no duplique correos. La clave es única en la base: dos intentos concurrentes de la
-- misma entrega convergen en la misma fila.

-- CreateEnum
CREATE TYPE "quote_delivery_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "quote_delivery_audience" AS ENUM ('CUSTOMER', 'INTERNAL');

-- CreateTable
CREATE TABLE "quote_delivery" (
    "id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "audience" "quote_delivery_audience" NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "customer_name" VARCHAR(200),
    "idempotency_key" VARCHAR(400) NOT NULL,
    "status" "quote_delivery_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" VARCHAR(200),
    "last_error" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quote_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_delivery_idempotency_key_key" ON "quote_delivery"("idempotency_key");

-- CreateIndex
CREATE INDEX "quote_delivery_quote_id_version_idx" ON "quote_delivery"("quote_id", "version");

-- CreateIndex
CREATE INDEX "quote_delivery_status_updated_at_idx" ON "quote_delivery"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "quote_delivery" ADD CONSTRAINT "quote_delivery_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
