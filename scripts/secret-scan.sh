#!/usr/bin/env bash
#
# Barrido de secretos con contrato de redacción (CIF-92; ADR-0014).
#
# Busca credenciales en los ficheros **rastreados** por git del repositorio y, opcionalmente, en todo
# su historial. Nunca imprime el valor buscado, el patrón ni el texto coincidente: solo la regla y
# `ruta:línea`. Ese contrato es la lección del run c7f69293 (CIF-88): el barrido era correcto, pero
# un `echo` de los patrones expandidos dejó los valores de las credenciales en el log del run.
#
# Uso:
#   scripts/secret-scan.sh [opciones]
#     --values-stdin      Lee valores candidatos (uno por línea) de la entrada estándar y los busca
#                         como texto literal. Es el modo para comprobar si una credencial concreta
#                         está en el repositorio o en su historial. Los valores no pasan por `argv`
#                         (no aparecen en `ps`) y no se imprimen nunca.
#     --history           Busca también en todas las ramas del historial de git. Necesita un clon
#                         completo (en CI, `actions/checkout` sin profundidad limitada).
#     --path DIR          Directorio a escanear (por defecto, el directorio actual).
#     --no-patterns       No aplica el catálogo de patrones; solo los valores de --values-stdin.
#     --allowlist FILE    Fichero con globs de rutas a ignorar (uno por línea; `#` comenta).
#     -h | --help
#
# Salida: líneas `[FUGA] <regla> <ruta>:<llegada>` y un resumen con el total de coincidencias.
# Código de salida: 0 sin hallazgos, 1 con hallazgos, 2 error de uso, 69 falta una herramienta.
#
# Ningún argumento se reproduce en los mensajes de error: un valor pasado por error como argumento
# no puede acabar en el log de quien ejecuta el barrido.
set -euo pipefail

EXIT_FOUND=1
EXIT_USAGE=2
EXIT_MISSING=69

VALUES_FROM_STDIN=0
SCAN_HISTORY=0
USE_PATTERNS=1
TARGET_DIR=''
ALLOWLIST_FILE=''

# Sincronizado con la cabecera del script; no se lee del propio fichero para no depender de números
# de línea.
usage() {
  cat <<'TXT'
secret-scan.sh — barrido de secretos con contrato de redacción (CIF-92; ADR-0014)

Uso:
  scripts/secret-scan.sh [opciones]
    --values-stdin      Lee valores candidatos (uno por línea) de la entrada estándar y los busca
                        como texto literal. Los valores no pasan por argv y no se imprimen nunca.
    --history           Busca también en todas las ramas del historial de git (clon completo).
    --path DIR          Directorio a escanear (por defecto, el directorio actual).
    --no-patterns       No aplica el catálogo de patrones; solo los valores de --values-stdin.
    --allowlist FILE    Fichero con globs de rutas a ignorar (uno por línea; `#` comenta).
    -h | --help

Salida: líneas `[FUGA] <regla> <ruta>:<línea>` y un resumen. Nunca imprime el valor, el patrón ni el
texto coincidente.
Código de salida: 0 sin hallazgos, 1 con hallazgos, 2 error de uso, 69 falta una herramienta.
TXT
}

die_usage() {
  printf 'secret-scan: %s\n\n' "$1" >&2
  usage >&2
  exit "$EXIT_USAGE"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --values-stdin) VALUES_FROM_STDIN=1 ;;
    --history) SCAN_HISTORY=1 ;;
    --no-patterns) USE_PATTERNS=0 ;;
    --path)
      TARGET_DIR="${2:-}"
      [[ -n "$TARGET_DIR" ]] || die_usage 'falta el directorio de --path'
      shift
      ;;
    --allowlist)
      ALLOWLIST_FILE="${2:-}"
      [[ -n "$ALLOWLIST_FILE" ]] || die_usage 'falta el fichero de --allowlist'
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die_usage 'argumento no reconocido' ;;
  esac
  shift
done

command -v grep >/dev/null 2>&1 || { echo 'secret-scan: falta grep' >&2; exit "$EXIT_MISSING"; }
if [[ "$SCAN_HISTORY" -eq 1 ]]; then
  command -v git >/dev/null 2>&1 || { echo 'secret-scan: falta git' >&2; exit "$EXIT_MISSING"; }
fi

TARGET_DIR="${TARGET_DIR:-$(pwd)}"
[[ -d "$TARGET_DIR" ]] || die_usage 'el directorio a escanear no existe'
if [[ "$USE_PATTERNS" -eq 0 && "$VALUES_FROM_STDIN" -eq 0 ]]; then
  die_usage 'no hay nada que buscar: usa --values-stdin o quita --no-patterns'
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/secret-scan.XXXXXX")"
chmod 700 "$TMP_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

# --- Valores candidatos -------------------------------------------------------
# Viven en un fichero temporal con permisos del usuario y se borran al salir. Nunca se imprimen.
VALUES_FILE="$TMP_DIR/valores.txt"
: > "$VALUES_FILE"
chmod 600 "$VALUES_FILE"
if [[ "$VALUES_FROM_STDIN" -eq 1 ]]; then
  [[ -t 0 ]] && die_usage '--values-stdin espera valores por la entrada estándar'
  cat > "$VALUES_FILE"
  awk 'length($0) >= 8 { print }' "$VALUES_FILE" > "$TMP_DIR/valores-utiles.txt"
  mv "$TMP_DIR/valores-utiles.txt" "$VALUES_FILE"
  chmod 600 "$VALUES_FILE"
fi

# --- Catálogo de patrones -----------------------------------------------------
# Formato: id<TAB>expresión regular<TAB>exclusión (opcional, se aplica a la línea completa).
# Los patrones son públicos; los valores nunca entran aquí.
PATTERN_FILE="$TMP_DIR/patron.txt"
RULE_IDS=()
RULE_RES=()
RULE_EXCLUDES=()
while IFS=$'\t' read -r rule_id rule_re rule_ex; do
  [[ -z "$rule_id" || "$rule_id" == '#'* ]] && continue
  RULE_IDS+=("$rule_id")
  RULE_RES+=("$rule_re")
  RULE_EXCLUDES+=("${rule_ex:-}")
done <<'RULES'
github-pat-clasico	ghp_[A-Za-z0-9]{36}
github-pat-fino	github_pat_[A-Za-z0-9_]{50,}
github-app-token	gh[osur]_[A-Za-z0-9]{36}
openai-api-key	sk-[A-Za-z0-9]{24,}
aws-access-key-id	AKIA[0-9A-Z]{16}
clave-privada-pem	-----BEGIN [A-Z ]{0,24}PRIVATE KEY-----
jwt-firmado	eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}
postgres-con-credenciales	postgresql?://[^:@/[:space:]]{1,}:[^@/[:space:]]{1,}@	(localhost|127\.0\.0\.1)
RULES

# --- Ficheros a escanear ------------------------------------------------------
ALLOWLIST=()
if [[ -n "$ALLOWLIST_FILE" ]]; then
  [[ -f "$ALLOWLIST_FILE" ]] || die_usage 'no existe el fichero de --allowlist'
  while IFS= read -r allow_line; do
    allow_line="${allow_line%%#*}"
    [[ -z "${allow_line//[[:space:]]/}" ]] && continue
    ALLOWLIST+=("$allow_line")
  done < "$ALLOWLIST_FILE"
fi

FILE_LIST=()
add_file() {
  local candidate="$1" glob
  for glob in ${ALLOWLIST[@]+"${ALLOWLIST[@]}"}; do
    # shellcheck disable=SC2254
    case "$candidate" in $glob) return 1 ;; esac
  done
  FILE_LIST+=("$candidate")
  return 0
}

if git -C "$TARGET_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  while IFS= read -r -d '' tracked; do
    add_file "$tracked" || true
  done < <(git -C "$TARGET_DIR" ls-files -z)
else
  while IFS= read -r -d '' found; do
    add_file "${found#"$TARGET_DIR"/}" || true
  done < <(find "$TARGET_DIR" -type f -not -path '*/.git/*' -print0)
fi

FINDINGS=0
report() {
  printf '[FUGA] %s %s\n' "$1" "$2"
  FINDINGS=$((FINDINGS + 1))
}

# scan_matches <fichero-de-patrones> <regla> <F|-E> <exclusión>
# El `cut` deja solo `ruta:línea`: el texto coincidente nunca llega a la salida.
scan_matches() {
  local patterns="$1" rule="$2" mode="$3" exclude="$4"
  local matches
  [[ ${#FILE_LIST[@]} -eq 0 ]] && return 0
  # Las rutas de FILE_LIST son relativas al directorio escaneado, así que grep se ejecuta allí.
  matches="$(
    cd "$TARGET_DIR" || exit 0
    printf '%s\0' ${FILE_LIST[@]+"${FILE_LIST[@]}"} |
      xargs -0 grep -I -H -n "$mode" -f "$patterns" 2>/dev/null |
      { if [[ -n "$exclude" ]]; then grep -v -E "$exclude"; else cat; fi; } |
      cut -d: -f1,2 || true
  )"
  while IFS= read -r location; do
    [[ -z "$location" ]] && continue
    report "$rule" "$location"
  done <<< "$matches"
}

scan_history() {
  local matches
  [[ -s "$VALUES_FILE" ]] || return 0
  command -v git >/dev/null 2>&1 || return 0
  git -C "$TARGET_DIR" rev-parse --git-dir >/dev/null 2>&1 || return 0
  # shellcheck disable=SC2046
  matches="$(git -C "$TARGET_DIR" grep -I -F -n -f "$VALUES_FILE" $(git -C "$TARGET_DIR" rev-list --all) 2>/dev/null |
    cut -d: -f1,2,3 || true)"
  while IFS= read -r location; do
    [[ -z "$location" ]] && continue
    report 'valor-conocido-en-historial' "$location"
  done <<< "$matches"
}

if [[ "$USE_PATTERNS" -eq 1 ]]; then
  index=0
  while [[ "$index" -lt "${#RULE_IDS[@]}" ]]; do
    printf '%s\n' "${RULE_RES[$index]}" > "$PATTERN_FILE"
    chmod 600 "$PATTERN_FILE"
    scan_matches "$PATTERN_FILE" "${RULE_IDS[$index]}" -E "${RULE_EXCLUDES[$index]}"
    index=$((index + 1))
  done
fi

if [[ -s "$VALUES_FILE" ]]; then
  scan_matches "$VALUES_FILE" 'valor-conocido' -F ''
  [[ "$SCAN_HISTORY" -eq 1 ]] && scan_history
fi

printf 'secret-scan: %d coincidencia(s) en %d fichero(s) rastreados de %s\n' \
  "$FINDINGS" "${#FILE_LIST[@]}" "$TARGET_DIR"

[[ "$FINDINGS" -eq 0 ]] || exit "$EXIT_FOUND"
exit 0
