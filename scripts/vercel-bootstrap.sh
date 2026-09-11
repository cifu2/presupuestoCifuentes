#!/usr/bin/env bash
#
# Enlaza el proyecto de Vercel e inyecta las variables de entorno por entorno.
# Procedimiento: docs/despliegue.md (apartado 6) y docs/variables-entorno.md.
#
# Uso:   scripts/vercel-bootstrap.sh [ruta/al/fichero.env.local]
#
# El fichero de valores NO se versiona (está en .gitignore) y sus valores no se imprimen.
# Credenciales: `vercel login` o la variable VERCEL_TOKEN.
set -euo pipefail

ENV_FILE="${1:-.env.vercel.local}"
ENVIRONMENTS=(production preview development)

command -v vercel >/dev/null 2>&1 || {
  echo "falta la CLI de Vercel (vercel). Instálala y autentícate antes de seguir." >&2
  exit 69
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "no existe $ENV_FILE" >&2
  echo "créalo con una línea KEY=VALOR por variable (no se versiona, no lo compartas)." >&2
  exit 66
fi

if [[ ! -f .vercel/project.json ]]; then
  echo "== enlazando el proyecto de Vercel (vercel link)"
  vercel link
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "${line//[[:space:]]/}" || "$line" == \#* ]] && continue
  name="${line%%=*}"
  value="${line#*=}"
  name="${name//[[:space:]]/}"
  [[ -z "$name" ]] && continue

  for environment in "${ENVIRONMENTS[@]}"; do
    # El valor viaja por stdin: nunca se imprime ni aparece en el historial.
    if [[ "$name" == NEXT_PUBLIC_* ]]; then
      printf '%s' "$value" | vercel env add "$name" "$environment" --force >/dev/null
    else
      printf '%s' "$value" | vercel env add "$name" "$environment" --sensitive --force >/dev/null
    fi
    echo "   ${name} -> ${environment}"
  done
done < "$ENV_FILE"

echo
echo "Variables cargadas. Recuerda: los cambios no entran en vigor hasta el siguiente despliegue."
