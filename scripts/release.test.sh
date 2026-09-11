#!/usr/bin/env bash
#
# Tests de `scripts/release.sh` (CIF-111).
#
# El contrato que se prueba es el que dejó producción sin migrar: `prisma migrate status` sale con
# código 1 cuando hay migraciones pendientes, y el `set -e` del paso de release lo interpretaba como
# fallo y abortaba antes de `migrate deploy`. Un release no puede fallar precisamente cuando tiene
# trabajo que hacer.
#
# `pnpm` se sustituye por un doble que solo registra la invocación y devuelve el código pedido: no se
# toca ninguna base de datos real. La cadena de conexión que se usa es sintética.
#
# Uso:   scripts/release.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE="$SCRIPT_DIR/release.sh"
# Valor sintético, nunca una credencial: sirve para comprobar que el script no lo imprime. Se arma
# por piezas a propósito: el fichero no puede contener una cadena con forma de credencial porque el
# propio barrido (`scripts/secret-scan.sh`) es una puerta de CI y la marcaría como fuga.
SENTINEL_USER='usuario-sentinel'
SENTINEL_PASS='clave-sentinel'
SENTINEL="$(printf '%s://%s:%s@example.invalid:5432/sentinel' 'postgresql' "$SENTINEL_USER" "$SENTINEL_PASS")"

if [[ ! -x "$RELEASE" ]]; then
  echo "no encuentro $RELEASE" >&2
  exit 69
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/release-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"
mkdir -p "$TMP/bin"

cat > "$TMP/bin/pnpm" <<'FAKE'
#!/usr/bin/env bash
# Doble de `pnpm`: registra la invocación y devuelve el código configurado por el test.
# La primera llamada a `migrate status` imita el estado previo al release (con migraciones pendientes
# sale 1); las siguientes imitan el estado posterior, ya migrado.
set -uo pipefail
printf '%s\n' "$*" >> "${FAKE_LOG:?}"
case "$*" in
  "prisma migrate status")
    contador=0
    [[ -f "${FAKE_LOG}.status" ]] && contador="$(cat "${FAKE_LOG}.status")"
    contador=$((contador + 1))
    printf '%s' "$contador" > "${FAKE_LOG}.status"
    if [[ "$contador" -eq 1 ]]; then exit "${FAKE_STATUS_EXIT:-0}"; fi
    exit "${FAKE_STATUS_EXIT_AFTER:-0}"
    ;;
  "prisma migrate deploy") exit "${FAKE_DEPLOY_EXIT:-0}" ;;
  *) exit 70 ;;
esac
FAKE
chmod +x "$TMP/bin/pnpm"

fallos=0
ok() { printf '  ok    %s\n' "$1"; }
ko() {
  printf '  FALLO %s\n' "$1"
  fallos=$((fallos + 1))
}

# ejecutar <status_exit> <deploy_exit> <status_exit_after> [args...]
# Deja la salida en $TMP/salida y el código en $codigo.
ejecutar() {
  local status_exit="$1" deploy_exit="$2" status_after="$3"
  shift 3
  : > "$TMP/log"
  rm -f "$TMP/log.status"
  codigo=0
  FAKE_LOG="$TMP/log" FAKE_STATUS_EXIT="$status_exit" FAKE_DEPLOY_EXIT="$deploy_exit" \
    FAKE_STATUS_EXIT_AFTER="$status_after" \
    PRODUCTION_DATABASE_URL="$SENTINEL" PATH="$TMP/bin:$PATH" \
    bash "$RELEASE" "$@" > "$TMP/salida" 2>&1 || codigo=$?
}

echo "release.sh"

# 1. Migraciones pendientes (status = 1): debe continuar y desplegar.
ejecutar 1 0 0 --yes
if [[ "$codigo" -eq 0 ]]; then ok "status=1 no aborta el release"; else ko "status=1 abortó con $codigo"; fi
if grep -qF "prisma migrate deploy" "$TMP/log"; then ok "status=1 llega a migrate deploy"; else ko "status=1 no llegó a migrate deploy"; fi

# 2. Todo al día (status = 0): sigue siendo un release válido y comprueba el estado dos veces.
ejecutar 0 0 0 --yes
if [[ "$codigo" -eq 0 ]]; then ok "status=0 termina en verde"; else ko "status=0 falló con $codigo"; fi
if [[ "$(grep -cF 'prisma migrate status' "$TMP/log")" -eq 2 ]]; then ok "comprueba el estado antes y después"; else ko "no comprobó el estado antes y después"; fi

# 3. `migrate deploy` falla: el release falla y no se disimula.
ejecutar 1 1 0 --yes
if [[ "$codigo" -ne 0 ]]; then ok "un fallo de migrate deploy falla el release"; else ko "un fallo de migrate deploy pasó por bueno"; fi

# 4. El estado posterior no queda limpio: el release no se da por bueno.
ejecutar 1 0 1 --yes
if [[ "$codigo" -ne 0 ]]; then ok "un estado posterior sucio falla el release"; else ko "un estado posterior sucio pasó por bueno"; fi

# 5. Sin cadena de conexión: aborta antes de invocar a pnpm.
codigo=0
: > "$TMP/log"
FAKE_LOG="$TMP/log" PATH="$TMP/bin:$PATH" env -u PRODUCTION_DATABASE_URL -u NEON_PRODUCTION_DATABASE_URL \
  bash "$RELEASE" --yes > "$TMP/salida" 2>&1 || codigo=$?
if [[ "$codigo" -eq 66 ]]; then ok "sin cadena de conexión sale con 66"; else ko "sin cadena de conexión salió con $codigo"; fi
if [[ ! -s "$TMP/log" ]]; then ok "sin cadena de conexión no invoca a pnpm"; else ko "invocó a pnpm sin cadena de conexión"; fi

# 6. La cadena nunca aparece en la salida (ADR-0014: redacción).
ejecutar 1 0 0 --yes
if grep -qF "clave-sentinel" "$TMP/salida" || grep -qF "usuario-sentinel" "$TMP/salida"; then
  ko "la salida imprime la cadena de conexión"
else
  ok "la salida no imprime la cadena de conexión"
fi

echo
if [[ "$fallos" -eq 0 ]]; then
  echo "todo en verde"
else
  echo "$fallos caso(s) en rojo"
fi
exit "$(( fallos > 0 ))"
