#!/usr/bin/env bash
#
# Medición del consumo de despliegues de Vercel por clase de rama y entorno (ADR-0019 §6, CIF-537).
#
# La escalada por cuota (CIF-536) pide números antes de apagar el preview de una clase de rama nueva:
# cuántos despliegues de régimen gasta cada clase (`main`, `feat/**`, `fix/**`, `ci/**`, `docs/**`…)
# y en qué entorno (`target: production` vs `preview`). Este script los cuenta con **solo `GET`**
# sobre `GET /v6/deployments`: crear un despliegue para medir gastaría justo la cuota que se mide.
#
# La clase de rama sale de `meta.githubCommitRef` (la API de listado no da un campo de clase) y el
# entorno de `target`. Se pagina con `until=<next>` hasta que la API deja de devolver cursor.
#
# Límite del método: `v6/deployments` no lista los despliegues ya borrados, así que el recuento es
# una **cota inferior** del contador del límite del plan (`api-deployments-free-per-day`). El script
# lo advierte en la cabecera: la diferencia contra el contador solo se ve en el cuerpo del 402 del
# límite o en el panel, que no se exponen por `GET`.
#
# Uso:    scripts/vercel-consumo.sh [horas…]        (por defecto: 24 72)
# Entorno:
#   VERCEL_DEVOPS_TOKEN      credencial de solo lectura del gestor de secretos (obligatoria)
#   VERCEL_TEAM_ID           id del equipo (`team_…`)
#   VERCEL_PROJECT_ID        id del proyecto (`prj_…`)
#   VERCEL_API_BASE          base de la API (por defecto https://api.vercel.com)
#   VERCEL_CONSUMO_VENTANAS  ventanas por defecto si no se pasan como argumentos
#   VERCEL_CONSUMO_AHORA_MS  instante de referencia en ms (para reproducir una medición)
#   VERCEL_CONSUMO_PAGINAS_MAX  tope de páginas (por defecto 20)
# Salida: una tabla TSV por ventana (cabecera `#`), en stdout. Código 0 si mide, 2 si faltan
# entradas, 3 si la API no responde lo esperado. Nunca imprime la credencial.
set -uo pipefail

ventanas="${*:-${VERCEL_CONSUMO_VENTANAS:-24 72}}"
token="${VERCEL_DEVOPS_TOKEN:-}"
equipo="${VERCEL_TEAM_ID:-}"
proyecto="${VERCEL_PROJECT_ID:-}"
api="${VERCEL_API_BASE:-https://api.vercel.com}"
paginas_max="${VERCEL_CONSUMO_PAGINAS_MAX:-20}"
ahora_ms="${VERCEL_CONSUMO_AHORA_MS:-}"

faltan=0
if [[ -z "$token" ]]; then
  echo "ERROR vercel-consumo: falta VERCEL_DEVOPS_TOKEN (gestor de secretos)." >&2
  faltan=1
fi
if [[ -z "$equipo" ]]; then
  echo "ERROR vercel-consumo: falta VERCEL_TEAM_ID." >&2
  faltan=1
fi
if [[ -z "$proyecto" ]]; then
  echo "ERROR vercel-consumo: falta VERCEL_PROJECT_ID." >&2
  faltan=1
fi
if ((faltan)); then
  exit 2
fi

for horas in $ventanas; do
  if [[ ! "$horas" =~ ^[0-9]+$ ]] || ((horas == 0)); then
    echo "ERROR vercel-consumo: la ventana '$horas' no es un número de horas positivo." >&2
    exit 2
  fi
done

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR vercel-consumo: falta jq." >&2
  exit 2
fi

if [[ -z "$ahora_ms" ]]; then
  ahora_ms="$(( $(date -u +%s) * 1000 ))"
fi
if [[ ! "$ahora_ms" =~ ^[0-9]+$ ]]; then
  echo "ERROR vercel-consumo: VERCEL_CONSUMO_AHORA_MS no es un instante en ms." >&2
  exit 2
fi

temporal="$(mktemp -d "${TMPDIR:-/tmp}/vercel-consumo.XXXXXX")"
chmod 700 "$temporal"
trap 'rm -rf "$temporal"' EXIT
crudo="$temporal/despliegues.jsonl"
: > "$crudo"

# Solo `GET`: `curl` sin `-X`/`--data`/`-F`/`-T` no puede crear, promover ni borrar nada.
url="$api/v6/deployments?teamId=$equipo&projectId=$proyecto&limit=100"
paginas=0
while [[ -n "$url" ]]; do
  paginas=$((paginas + 1))
  if ((paginas > paginas_max)); then
    echo "ERROR vercel-consumo: más de ${paginas_max} páginas; acoto para no dar vueltas." >&2
    exit 3
  fi
  respuesta="$(curl -sS -H "Authorization: Bearer $token" "$url")" || {
    echo "ERROR vercel-consumo: la consulta a $api falló (curl)." >&2
    exit 3
  }
  if ! printf '%s' "$respuesta" | jq -e 'has("deployments")' >/dev/null 2>&1; then
    echo "ERROR vercel-consumo: $api no devolvió una lista de despliegues." >&2
    exit 3
  fi
  printf '%s' "$respuesta" | jq -c '.deployments[]' >> "$crudo"
  siguiente="$(printf '%s' "$respuesta" | jq -r '.pagination.next // empty')"
  if [[ -n "$siguiente" ]]; then
    url="$api/v6/deployments?teamId=$equipo&projectId=$proyecto&limit=100&until=$siguiente"
  else
    url=""
  fi
done

listados="$(wc -l < "$crudo" | tr -d ' ')"
primero="$(jq -sr 'sort_by(.created) | (.[0].created // empty) | (. / 1000 | floor | todate)' "$crudo" 2>/dev/null)"

echo "# proyecto=$proyecto listados=$listados paginas=$paginas primer_despliegue=${primero:-ninguno}"
echo "# aviso: v6/deployments no lista los despliegues borrados; este recuento es una cota inferior"
echo "#        del contador del limite (api-deployments-free-per-day)."

for horas in $ventanas; do
  desde=$((ahora_ms - horas * 3600 * 1000))
  echo "# ventana de ${horas} h: de $(jq -nr --argjson ms "$desde" '($ms / 1000 | floor | todate)') a $(jq -nr --argjson ms "$ahora_ms" '($ms / 1000 | floor | todate)')"
  jq -sr --argjson desde "$desde" --argjson horas "$horas" '
    def clase:
      (. // "") as $rama
      | if $rama == "" then "(sin-ref)"
        elif ($rama | contains("/")) then ($rama | split("/")[0]) + "/**"
        else $rama
        end;
    def entorno: if .target == "production" then "production" else "preview" end;
    [ .[] | select(.created >= $desde) | { clase: (.meta.githubCommitRef | clase), entorno: entorno } ]
    | group_by([.clase, .entorno])
    | map({ clase: .[0].clase, entorno: .[0].entorno, n: length })
    | sort_by(-.n, .clase, .entorno)
    | (map(.n) | add // 0) as $total
    | (["clase", "entorno", "despliegues", "tasa_dia"] | @tsv),
      (.[] | [.clase, .entorno, (.n | tostring), ((.n / ($horas / 24)) * 100 | round / 100 | tostring)] | @tsv),
      (["TOTAL", "-", ($total | tostring), (($total / ($horas / 24)) * 100 | round / 100 | tostring)] | @tsv)
  ' "$crudo"
done
