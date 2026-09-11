#!/usr/bin/env bash
#
# Guardia de la identidad de aprobación de PRs (CIF-105; ADR-0015).
#
# La revisión aprobatoria de un PR debe venir de una identidad **no autora** (la machine user de
# revisión), nunca de GitHub Actions. Esta guardia comprueba las dos mitades de esa puerta:
#
#   1. Estática, sin red: ningún workflow de .github/workflows/ pide permiso de escritura sobre PRs
#      (`pull-requests: write`), ni `permissions: write-all`, ni llama al API de revisiones con
#      `event: APPROVE`, ni usa `gh pr review --approve`.
#   2. Dinámica, con token de administración: el repositorio sigue con
#      `can_approve_pull_request_reviews = false` y `default_workflow_permissions = read`, de modo
#      que Actions no puede aprobar aunque alguien añada el workflow que lo intenta.
#
# Contrato de redacción (ADR-0014): la salida nombra la regla y `fichero:línea`; nunca imprime el
# contenido de la línea ni el valor de un token.
#
# Uso:  scripts/approval-guard.sh [opciones]
#   --static-only        No consulta el API de GitHub (es lo que ejecuta el CI, que no tiene token).
#   --require-api        Falla si la mitad dinámica no se puede completar (modo operación).
#   --workflows-dir DIR  Directorio de workflows (por defecto, .github/workflows).
#   --repo OWNER/NOMBRE  Repositorio a consultar (por defecto, cifu2/presupuestoCifuentes).
#   --api-base URL       Base del API (por defecto, https://api.github.com).
#   -h | --help
#
# Token (solo para la mitad dinámica): GH_TOKEN | GITHUB_DEVOPS_TOKEN.
#
# Salida: líneas `OK`, `VIOLACION <regla> <fichero>:<línea>` y `OMITIDO`, más un resumen.
# Código de salida: 0 sin hallazgos, 1 con hallazgos, 2 error de uso, 69 falta una herramienta.
set -euo pipefail

EXIT_VIOLATION=1
EXIT_USAGE=2
EXIT_MISSING=69

REPO="${REPO:-cifu2/presupuestoCifuentes}"
API_BASE="${API_BASE:-https://api.github.com}"
WORKFLOWS_DIR='.github/workflows'
STATIC_ONLY=0
REQUIRE_API=0

usage() {
  cat <<'TXT'
Uso: scripts/approval-guard.sh [--static-only] [--require-api] [--workflows-dir DIR]
                               [--repo OWNER/NOMBRE] [--api-base URL] [-h|--help]
TXT
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --static-only) STATIC_ONLY=1 ;;
    --require-api) REQUIRE_API=1 ;;
    --workflows-dir)
      [[ $# -ge 2 ]] || { echo 'falta el valor de --workflows-dir' >&2; usage >&2; exit "$EXIT_USAGE"; }
      WORKFLOWS_DIR="$2"
      shift
      ;;
    --repo)
      [[ $# -ge 2 ]] || { echo 'falta el valor de --repo' >&2; usage >&2; exit "$EXIT_USAGE"; }
      REPO="$2"
      shift
      ;;
    --api-base)
      [[ $# -ge 2 ]] || { echo 'falta el valor de --api-base' >&2; usage >&2; exit "$EXIT_USAGE"; }
      API_BASE="${2%/}"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "opción no reconocida: $1" >&2
      usage >&2
      exit "$EXIT_USAGE"
      ;;
  esac
  shift
done

[[ -d "$WORKFLOWS_DIR" ]] || {
  echo "no existe el directorio de workflows: $WORKFLOWS_DIR" >&2
  exit "$EXIT_USAGE"
}
[[ "$REPO" == */* ]] || { echo "--repo debe ser OWNER/NOMBRE" >&2; exit "$EXIT_USAGE"; }
[[ "$API_BASE" == http://* || "$API_BASE" == https://* ]] || {
  echo '--api-base debe ser una URL http(s)' >&2
  exit "$EXIT_USAGE"
}

violations=0
violation() { printf '  VIOLACION %s %s\n' "$1" "$2"; violations=$((violations + 1)); }
ok() { printf '  OK        %s\n' "$1"; }
skipped() { printf '  OMITIDO   %s\n' "$1"; }

# report_hits <regla> <fichero> <salida de grep -n>: no reproduce la línea, solo su número.
report_hits() {
  local rule="$1" file="$2" hits="$3" hit
  [[ -n "$hits" ]] || return 0
  while IFS= read -r hit; do
    [[ -n "$hit" ]] || continue
    violation "$rule" "$file:${hit%%:*}"
  done <<<"$hits"
}

# --- Mitad estática -------------------------------------------------------------------------
shopt -s nullglob
workflow_files=("$WORKFLOWS_DIR"/*.yml "$WORKFLOWS_DIR"/*.yaml)
shopt -u nullglob

if [[ ${#workflow_files[@]} -eq 0 ]]; then
  violation 'sin-workflows' "$WORKFLOWS_DIR"
else
  for wf in "${workflow_files[@]}"; do
    report_hits 'permisos-pr-write' "$wf" \
      "$(grep -nE 'pull-requests[[:space:]]*:[[:space:]]*write([^a-zA-Z]|$)' -- "$wf" || true)"
    report_hits 'permisos-write-all' "$wf" \
      "$(grep -nE 'permissions[[:space:]]*:[[:space:]]*write-all([^a-zA-Z]|$)' -- "$wf" || true)"
    report_hits 'aprobacion-desde-actions' "$wf" \
      "$(grep -nE '(event[^a-zA-Z0-9]{0,3}APPROVE|--approve|APPROVE[^a-zA-Z0-9]{0,3}review|reviews?[^a-zA-Z0-9]{0,3}APPROVE)' -- "$wf" || true)"
  done
  if [[ "$violations" -eq 0 ]]; then
    ok "ningún workflow puede aprobar PRs (${#workflow_files[@]} fichero(s) en $WORKFLOWS_DIR)"
  fi
fi

# --- Mitad dinámica -------------------------------------------------------------------------
TOKEN_RESOLVED="${GH_TOKEN:-${GITHUB_DEVOPS_TOKEN:-}}"

if [[ "$STATIC_ONLY" -eq 1 ]]; then
  skipped 'ajustes del repositorio (--static-only)'
elif [[ -z "$TOKEN_RESOLVED" ]]; then
  if [[ "$REQUIRE_API" -eq 1 ]]; then
    violation 'api-no-verificable' "$REPO"
  else
    skipped "ajustes del repositorio: sin GH_TOKEN ni GITHUB_DEVOPS_TOKEN (usa --require-api para exigirlo)"
  fi
else
  for tool in curl python3; do
    command -v "$tool" >/dev/null 2>&1 || {
      echo "falta $tool (necesario para la comprobación del API)" >&2
      exit "$EXIT_MISSING"
    }
  done

  TMP_BODY="$(mktemp)"
  trap 'rm -f "$TMP_BODY"' EXIT
  code="$(curl -sS -o "$TMP_BODY" -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN_RESOLVED" -H 'Accept: application/vnd.github+json' \
    "$API_BASE/repos/$REPO/actions/permissions/workflow" 2>/dev/null || echo 000)"

  if [[ "$code" != 200 ]]; then
    if [[ "$REQUIRE_API" -eq 1 ]]; then
      violation 'api-no-verificable' "HTTP $code"
    else
      skipped "ajustes del repositorio: el API respondió HTTP $code"
    fi
  else
    read -r approve_setting default_perms <<<"$(
      python3 -c 'import json,sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    print("desconocido desconocido"); raise SystemExit
print(str(d.get("can_approve_pull_request_reviews")).lower(), d.get("default_workflow_permissions") or "desconocido")' "$TMP_BODY"
    )"

    if [[ "$approve_setting" == 'true' ]]; then
      violation 'ajuste-aprobacion-bot' 'can_approve_pull_request_reviews=true'
    elif [[ "$approve_setting" == 'false' ]]; then
      ok 'can_approve_pull_request_reviews=false'
    else
      if [[ "$REQUIRE_API" -eq 1 ]]; then
        violation 'api-no-verificable' 'respuesta sin can_approve_pull_request_reviews'
      else
        skipped 'ajustes del repositorio: respuesta sin can_approve_pull_request_reviews'
      fi
    fi

    if [[ "$default_perms" == 'read' ]]; then
      ok 'default_workflow_permissions=read'
    elif [[ "$default_perms" == 'desconocido' || "$default_perms" == 'None' ]]; then
      if [[ "$REQUIRE_API" -eq 1 ]]; then
        violation 'api-no-verificable' 'respuesta sin default_workflow_permissions'
      else
        skipped 'ajustes del repositorio: respuesta sin default_workflow_permissions'
      fi
    else
      violation 'ajuste-workflow-permissions' "default_workflow_permissions=$default_perms"
    fi
  fi
fi

echo
if [[ "$violations" -gt 0 ]]; then
  printf 'Guardia de aprobación: %d violación(es).\n' "$violations"
  exit "$EXIT_VIOLATION"
fi
echo 'Guardia de aprobación: sin hallazgos.'
