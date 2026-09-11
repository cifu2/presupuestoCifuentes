#!/usr/bin/env bash
#
# Rollback de la aplicación en producción: promueve un deployment anterior ya construido.
# Procedimiento completo: docs/despliegue.md, apartado 5.
#
# Uso:   scripts/rollback.sh list            # últimos deployments de producción
#        scripts/rollback.sh to <url-o-id>   # promueve ese deployment a producción
#
# Recuerda: después hay que revertir el cambio en `main` para que repositorio y producción coincidan.
set -euo pipefail

export VERCEL_TOKEN="${VERCEL_TOKEN:-${VERCEL_DEVOPS_TOKEN:-}}"

command -v vercel >/dev/null 2>&1 || { echo "falta la CLI de Vercel (vercel)" >&2; exit 69; }

case "${1:-list}" in
  list | --list | -l)
    vercel ls --prod
    ;;
  to | --to)
    target="${2:-}"
    if [[ -z "$target" ]]; then
      echo "uso: $0 to <url-o-id-del-deployment>" >&2
      exit 64
    fi
    vercel promote "$target"
    echo
    echo "Promovido. Ahora:"
    echo "  1. curl -fsS https://<dominio-produccion>/api/health"
    echo "  2. abre el PR que revierta en main el cambio causante (git revert)"
    echo "  3. deja constancia en la tarea de Paperclip"
    ;;
  *)
    echo "uso: $0 [list | to <url-o-id-del-deployment>]" >&2
    exit 64
    ;;
esac
