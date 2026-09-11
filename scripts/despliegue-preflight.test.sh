#!/usr/bin/env bash
#
# Tests de `scripts/despliegue-preflight.sh` (CIF-123).
#
# Contrato que se prueba: el preflight no puede dar por bueno un entorno de Production al que le
# falta `ADMIN_API_TOKEN`, porque con esa variable ausente el API del panel responde `503`
# (`ADMIN_API_DISABLED`) y el propietario no puede publicar ni archivar tarifas.
#
# `curl` se sustituye por un doble que responde con datos canónicos de GitHub, Vercel y del
# inventario de variables: no se llama a ninguna API real y no se usa ninguna credencial. Los valores
# que se pasan son centinelas **sin forma de credencial**, solo para comprobar que el preflight no los
# imprime (ADR-0014).
#
# Uso:   scripts/despliegue-preflight.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFLIGHT="$SCRIPT_DIR/despliegue-preflight.sh"

SENTINEL_GH="centinela-github-sin-forma-de-credencial"
SENTINEL_VERCEL="centinela-vercel-sin-forma-de-credencial"

if [[ ! -f "$PREFLIGHT" ]]; then
  echo "no encuentro $PREFLIGHT" >&2
  exit 69
fi
command -v python3 >/dev/null 2>&1 || {
  echo "falta python3" >&2
  exit 69
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/preflight-test.XXXXXX")"
chmod 700 "$TMP"
mkdir -p "$TMP/bin"

LISTENER_PID=""
cleanup() {
  [[ -n "$LISTENER_PID" ]] && kill "$LISTENER_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

# --- Escucha TCP local: la comprobación de la base de datos de producción tiene que pasar de verdad
# --- para que el caso "todo en orden" pueda terminar con código 0.

cat > "$TMP/listener.py" <<'PY'
import socket
import sys

sock = socket.socket()
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(("127.0.0.1", 0))
sock.listen(16)
with open(sys.argv[1], "w", encoding="utf-8") as handle:
    handle.write(str(sock.getsockname()[1]))
while True:
    conexion, _ = sock.accept()
    conexion.close()
PY

python3 "$TMP/listener.py" "$TMP/port" &
LISTENER_PID=$!

for _ in $(seq 1 100); do
  [[ -s "$TMP/port" ]] && break
  sleep 0.1
done
if [[ ! -s "$TMP/port" ]]; then
  echo "FALLO no arranca el escucha TCP local de los tests" >&2
  exit 1
fi
PORT="$(cat "$TMP/port")"
SENTINEL_DB="postgresql://centinela:centinela@127.0.0.1:${PORT}/centinela"
for _ in $(seq 1 100); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then break; fi
  sleep 0.1
done

# --- Doble de `curl`: respuestas canónicas, sin red. El inventario de Vercel se lee del fichero que
# --- indique `STUB_VERCEL_ENV_FILE`, para poder variar el caso.

cat > "$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
set -uo pipefail
out=""
dump=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    -D)
      dump="$2"
      shift 2
      ;;
    -w)
      shift 2
      ;;
    -H | --header)
      shift 2
      ;;
    -s | -S | -sS | --fail)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
[[ -n "$dump" ]] && : > "$dump"
emitir() { # emitir <código> <cuerpo-json>
  [[ -n "$out" ]] && printf '%s' "$2" > "$out"
  printf '%s' "$1"
}
case "$url" in
  https://api.github.com/user)
    printf 'x-oauth-scopes: repo, workflow\r\n' > "$dump"
    emitir 200 '{"login":"devops-doble"}'
    ;;
  https://api.github.com/repos/*/branches/main/protection)
    emitir 200 '{"required_status_checks":{"contexts":["calidad","e2e"]}}'
    ;;
  https://api.github.com/repos/*)
    emitir 200 '{"private":true,"default_branch":"main","permissions":{"admin":true}}'
    ;;
  https://api.vercel.com/v2/user)
    emitir 200 '{"user":{"username":"devops-doble"}}'
    ;;
  *"/env?teamId="*)
    # El inventario se copia tal cual: `emitir` con cuerpo vacío lo truncaría.
    [[ -n "$out" ]] && cp "${STUB_VERCEL_ENV_FILE:?}" "$out"
    printf '%s' 200
    ;;
  https://api.vercel.com/v9/projects/*)
    emitir 200 '{"id":"prj_doble","framework":"nextjs","link":{"repo":"cifu2/presupuestoCifuentes"}}'
    ;;
  *)
    emitir 404 '{"error":"el doble de curl no esperaba esta URL"}'
    ;;
esac
STUB
chmod +x "$TMP/bin/curl"

cat > "$TMP/env-con-token.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_API_TOKEN", "target": ["production"], "type": "sensitive" }
  ]
}
JSON

cat > "$TMP/env-sin-token.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "DATABASE_URL", "target": ["preview"], "type": "sensitive" }
  ]
}
JSON

fallos=0
pasa() { printf 'ok    %s\n' "$1"; }
falla() {
  printf 'FALLO %s\n' "$1"
  fallos=$((fallos + 1))
}

ejecutar() { # ejecutar <fichero-de-inventario> -> código en $?, salida en $TMP/salida
  STUB_VERCEL_ENV_FILE="$1" PATH="$TMP/bin:$PATH" \
    GH_TOKEN="$SENTINEL_GH" \
    VERCEL_TOKEN="$SENTINEL_VERCEL" \
    PRODUCTION_DATABASE_URL="$SENTINEL_DB" \
    bash "$PREFLIGHT" > "$TMP/salida" 2>&1
}

# Caso 1: Production define ADMIN_API_TOKEN -> todo en orden, código 0 y la variable en el informe.
ejecutar "$TMP/env-con-token.json"
codigo=$?
if [[ "$codigo" -eq 0 ]]; then
  pasa "con ADMIN_API_TOKEN en Production el preflight sale con código 0"
else
  falla "con ADMIN_API_TOKEN en Production el preflight sale con código $codigo (se esperaba 0)"
fi
if grep -qE '^  OK .*ADMIN_API_TOKEN' "$TMP/salida"; then
  pasa "el informe lista ADMIN_API_TOKEN entre las variables de Production"
else
  falla "el informe no lista ADMIN_API_TOKEN entre las variables de Production"
fi

# Caso 2: Production sin ADMIN_API_TOKEN -> pendiente explícito y código 1.
ejecutar "$TMP/env-sin-token.json"
codigo=$?
if [[ "$codigo" -eq 1 ]]; then
  pasa "sin ADMIN_API_TOKEN en Production el preflight sale con código 1"
else
  falla "sin ADMIN_API_TOKEN en Production el preflight sale con código $codigo (se esperaba 1)"
fi
if grep -qE '^  PENDIENTE falta ADMIN_API_TOKEN en Production' "$TMP/salida"; then
  pasa "el informe marca PENDIENTE la falta de ADMIN_API_TOKEN"
else
  falla "el informe no marca PENDIENTE la falta de ADMIN_API_TOKEN"
fi

# Caso 3: contrato de redacción (ADR-0014): el informe no imprime ningún valor de credencial.
if grep -qF "$SENTINEL_GH" "$TMP/salida" || grep -qF "$SENTINEL_VERCEL" "$TMP/salida" ||
  grep -qF "$SENTINEL_DB" "$TMP/salida"; then
  falla "el informe imprime un valor de credencial"
else
  pasa "el informe no imprime ningún valor de credencial"
fi

echo
if [[ "$fallos" -eq 0 ]]; then
  echo "Todo correcto."
  exit 0
fi
echo "Fallos: $fallos"
exit 1
