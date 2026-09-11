#!/usr/bin/env bash
#
# Enlaza el proyecto de Vercel e inyecta las variables de entorno por entorno.
# Procedimiento: docs/despliegue.md (apartado 6) y docs/variables-entorno.md.
#
# Uso:   scripts/vercel-bootstrap.sh [ruta/al/fichero.env.local]
#
# El fichero de valores NO se versiona (está en .gitignore) y sus valores no se imprimen.
# Credenciales: `vercel login`, VERCEL_TOKEN o el secreto de Paperclip VERCEL_DEVOPS_TOKEN.
# Sin terminal interactiva: define también VERCEL_ORG_ID y VERCEL_PROJECT_ID y la CLI no pregunta.
#
# `DATABASE_URL` es configuración **por entorno**, nunca una variable común (ADR-0009 §2,
# ADR-0015 §4): el fichero declara DATABASE_URL__PRODUCTION, DATABASE_URL__PREVIEW y
# DATABASE_URL__DEVELOPMENT, y cada una inyecta `DATABASE_URL` solo en su entorno. Un `DATABASE_URL`
# sin sufijo aborta el script (código 78) **antes** de escribir nada en Vercel: es el defecto de
# CIF-110 y no puede repetirse.
set -euo pipefail

export VERCEL_TOKEN="${VERCEL_TOKEN:-${VERCEL_DEVOPS_TOKEN:-}}"

EXIT_CONFIG=78

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

# Nombre de la variable de una línea KEY=VALOR (vacío en líneas vacías o comentarios). Solo devuelve
# el nombre: el valor nunca pasa por una sustitución ni por la salida del script.
variable_name() {
  local line="$1" name
  [[ -z "${line//[[:space:]]/}" || "$line" == \#* ]] && return 0
  name="${line%%=*}"
  printf '%s' "${name//[[:space:]]/}"
}

# Inyecta el valor por stdin: nunca se imprime ni aparece en el historial del proceso.
inject() { # inject <nombre> <entorno> <valor>
  local name="$1" environment="$2" value="$3"
  if [[ "$name" == NEXT_PUBLIC_* ]]; then
    printf '%s' "$value" | vercel env add "$name" "$environment" --force >/dev/null
  else
    printf '%s' "$value" | vercel env add "$name" "$environment" --sensitive --force >/dev/null
  fi
  echo "   ${name} -> ${environment}"
}

# Pasada de validación completa y anterior a cualquier escritura en Vercel: si el fichero declara
# `DATABASE_URL` a secas el script muere aquí, sin inyectar ninguna variable (ni siquiera las que
# aparecen antes en el fichero).
validate_env_file() {
  local line name suffix upper
  while IFS= read -r line || [[ -n "$line" ]]; do
    name="$(variable_name "$line")"
    [[ -z "$name" ]] && continue

    # Toda línea con contenido es KEY=VALOR y el nombre es [A-Za-z_][A-Za-z0-9_]*. Cualquier otra
    # cosa aborta sin imprimir la línea: una credencial pegada por error no puede acabar en la salida
    # del script (ADR-0014 §7).
    if [[ "$line" != *=* || ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      printf 'ERROR: una línea de %s no tiene el formato KEY=VALOR.\n' "$ENV_FILE" >&2
      echo "Revisa el fichero: cada línea con contenido debe ser VARIABLE=valor." >&2
      echo "No se ha inyectado ninguna variable en Vercel." >&2
      exit "$EXIT_CONFIG"
    fi

    # La familia se compara en mayúsculas: `database_url__production` es la misma variable y no
    # puede colarse como variable normal en los tres entornos (ni `database_url` sin sufijo).
    upper="$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')"

    if [[ "$upper" == 'DATABASE_URL' ]]; then
      cat >&2 <<'TXT'
ERROR: `DATABASE_URL` no puede ser una variable común (ADR-0015 §4).

Se declara una base por entorno y el nombre lleva sufijo, para que producción y preview no puedan
compartir destino (ADR-0009 §2). En el fichero de valores, sustituye la línea `DATABASE_URL=…` por
el sufijo de cada entorno que aplique:

    DATABASE_URL__PRODUCTION=postgresql://…     # Neon, base presupuesto_production
    DATABASE_URL__PREVIEW=postgresql://…        # Neon, base presupuesto_preview
    DATABASE_URL__DEVELOPMENT=postgresql://…    # PostgreSQL local o rama dev

No se ha inyectado ninguna variable en Vercel.
TXT
      exit "$EXIT_CONFIG"
    fi

    if [[ "$upper" == DATABASE_URL__* ]]; then
      suffix="${upper#DATABASE_URL__}"
      case "$suffix" in
        PRODUCTION | PREVIEW | DEVELOPMENT) ;;
        *)
          printf 'ERROR: %s tiene un sufijo de entorno desconocido.\n' "$name" >&2
          echo "Los sufijos válidos son DATABASE_URL__PRODUCTION, DATABASE_URL__PREVIEW y" >&2
          echo "DATABASE_URL__DEVELOPMENT. No se ha inyectado ninguna variable en Vercel." >&2
          exit "$EXIT_CONFIG"
          ;;
      esac
    fi
  done < "$ENV_FILE"
}

validate_env_file

if [[ ! -f .vercel/project.json ]]; then
  echo "== enlazando el proyecto de Vercel (vercel link)"
  vercel link --yes
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  name="$(variable_name "$line")"
  [[ -z "$name" ]] && continue
  value="${line#*=}"

  # DATABASE_URL__<ENTORNO> -> DATABASE_URL solo en su entorno, y siempre sensible. La familia se
  # reconoce sin importar mayúsculas y el nombre inyectado es siempre el canónico `DATABASE_URL`.
  upper_name="$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')"
  if [[ "$upper_name" == DATABASE_URL__* ]]; then
    suffix="${upper_name#DATABASE_URL__}"
    inject 'DATABASE_URL' "$(printf '%s' "$suffix" | tr '[:upper:]' '[:lower:]')" "$value"
    continue
  fi

  for environment in "${ENVIRONMENTS[@]}"; do
    inject "$name" "$environment" "$value"
  done
done < "$ENV_FILE"

echo
echo "Variables cargadas. Recuerda: los cambios no entran en vigor hasta el siguiente despliegue."
