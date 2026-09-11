-- Cierra la ventana de carrera al publicar tarifas (CIF-89, hallazgo N3 de CIF-85).
--
-- `publishTariffVersion` comprueba el no solapamiento en el caso de uso y escribe después con
-- `upsert`. Sin transacción ni restricción en PostgreSQL, dos publicaciones concurrentes de
-- versiones solapadas de la misma serie pueden superar ambas la comprobación y dejar dos filas
-- `PUBLISHED` vigentes a la vez. Esta migración mueve la garantía a la base de datos: cualquier
-- solape de vigencia entre versiones publicadas de una serie se rechaza en la escritura
-- (SQLSTATE 23P01), aunque la comprobación previa del dominio no lo haya visto.
--
-- La invariante se expresa con una restricción de exclusión parcial sobre el rango semiabierto
-- `[valid_from, valid_until)` (`valid_until` nulo = vigencia abierta), solo para filas publicadas.

-- La restricción no se puede crear si ya hay datos que la incumplen. Se comprueba antes para dar
-- un error accionable en lugar del genérico de PostgreSQL.
DO $$
DECLARE
  conflicto record;
BEGIN
  SELECT
    a."id" AS version_a,
    b."id" AS version_b,
    a."series_id" AS series_id
  INTO conflicto
  FROM "tariff_version" AS a
  JOIN "tariff_version" AS b
    ON a."series_id" = b."series_id"
   AND a."id" < b."id"
   AND a."status" = 'PUBLISHED'
   AND b."status" = 'PUBLISHED'
   AND daterange(a."valid_from", a."valid_until", '[)')
       && daterange(b."valid_from", b."valid_until", '[)')
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'No se puede crear la restricción de solape: la serie % tiene las tarifas publicadas % y % solapadas. Archiva o recorta una de las dos antes de migrar.',
      conflicto.series_id, conflicto.version_a, conflicto.version_b;
  END IF;
END
$$;

-- `btree_gist` aporta el operador de igualdad para GiST que necesita `series_id` en la exclusión.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "tariff_version"
  ADD CONSTRAINT "tariff_version_published_no_overlap"
    EXCLUDE USING gist (
      "series_id" WITH =,
      daterange("valid_from", "valid_until", '[)') WITH &&
    )
    WHERE ("status" = 'PUBLISHED');
