-- Reversión de `20260911150000_constraint_solape_tarifas_publicadas`.
--
-- Deja la unicidad de tarifa vigente otra vez solo en el dominio (comprobación previa a la
-- escritura y `selectTariffInForce` como red de lectura). Tras revertir, la ventana de carrera
-- entre dos publicaciones concurrentes vuelve a estar abierta.
--
-- `btree_gist` no se elimina: puede estar en uso por otras restricciones o consultas de la base.
ALTER TABLE "tariff_version" DROP CONSTRAINT IF EXISTS "tariff_version_published_no_overlap";
