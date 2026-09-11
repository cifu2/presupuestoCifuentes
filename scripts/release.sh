#!/usr/bin/env bash
#
# Paso explícito de release: aplica las migraciones de esquema en la base de datos de producción.
# Vercel despliega solo la aplicación; las migraciones nunca son automáticas (ADR-0007).
# Procedimiento: docs/despliegue.md, apartado 3.
#
# Uso:   PRODUCTION_DATABASE_URL='...' scripts/release.sh [--yes]
#
# La cadena de conexión se lee de una variable de entorno y no se imprime en ningún momento.
set -euo pipefail

if [[ -z "${PRODUCTION_DATABASE_URL:-}" ]]; then
  echo "falta PRODUCTION_DATABASE_URL." >&2
  echo "Tómala del gestor de secretos o de .env.local (no versionado). Nunca la escribas aquí." >&2
  exit 66
fi

command -v pnpm >/dev/null 2>&1 || { echo "falta pnpm" >&2; exit 69; }

ASSUME_YES=0
[[ "${1:-}" == "--yes" ]] && ASSUME_YES=1

cat <<'TXT'
Comprueba antes de seguir (docs/despliegue.md, apartado 3):
  - la migración es compatible hacia atrás (expand/contract): añade, no borra ni renombra
  - si toca datos existentes, existe una rama snapshot de `production` en Neon
  - el merge a `main` ya está en GitHub y el CI está en verde
TXT

if [[ "$ASSUME_YES" -ne 1 ]]; then
  read -r -p "¿Aplicar migraciones en producción? (escribe 'si') " answer
  [[ "$answer" == "si" ]] || { echo "cancelado"; exit 0; }
fi

echo "== estado antes de migrar"
DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm prisma migrate status

echo "== aplicando migraciones (migrate deploy)"
DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm prisma migrate deploy

echo "== estado después de migrar"
DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm prisma migrate status

echo
echo "Migraciones aplicadas. Comprueba ahora /api/health en producción (docs/despliegue.md, apartado 4)."
