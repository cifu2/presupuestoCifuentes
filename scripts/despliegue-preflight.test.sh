#!/usr/bin/env bash
#
# Tests de `scripts/despliegue-preflight.sh` (CIF-123, CIF-241 y CIF-282).
#
# Contrato que se prueba: el preflight no puede dar por bueno un entorno de Production al que le
# faltan `ADMIN_SESSION_SECRET` o `ADMIN_PANEL_PASSWORD`, porque entonces la sesión del panel falla
# cerrada (`503 ADMIN_ACCESS_DISABLED`) y el propietario no puede entrar (CIF-241); tampoco si falta
# `DATABASE_URL`; y las claves se comparan por nombre exacto, así que un `DATABASE_URL_UNPOOLED` no
# cubre `DATABASE_URL` (CIF-129). `ADMIN_API_TOKEN` **no** es exigible: es la credencial opcional de
# automatización por `Bearer` y el propietario entra con la sesión (CIF-123).
#
# Contrato de los interruptores del panel (CIF-282): `CATALOG_DEMO_MODE` activa en Production
# bloquea la puesta en marcha (sirve el catálogo de fixture y abre la guarda de ADR-0023 §5); un
# valor que `environmentFlag` rechaza también bloquea, porque el arranque no pasa de ahí;
# `ADMIN_PANEL_ENABLED` solo se informa y su ausencia no es un pendiente; y si el valor no es
# legible para el token, el preflight avisa sin bloquear en falso. La comparación replica a
# `environmentFlag` de verdad (`z.stringbool()` no recorta): `" true "` no se da por bueno y un valor
# con solo espacios cuenta como ausente (default `false`), no como valor ilegible.
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
# `cleanup` solo se invoca desde el trap; shellcheck no ve la llamada (SC2317).
# shellcheck disable=SC2317
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

cat > "$TMP/env-completo.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_SESSION_SECRET", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_PANEL_PASSWORD", "target": ["production"], "type": "sensitive" }
  ]
}
JSON

cat > "$TMP/env-sin-sesion.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_API_TOKEN", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_PANEL_PASSWORD", "target": ["production"], "type": "sensitive" }
  ]
}
JSON

cat > "$TMP/env-sin-password.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_API_TOKEN", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_SESSION_SECRET", "target": ["production"], "type": "sensitive" }
  ]
}
JSON

# Solo el nombre con sufijo: con comparación por subcadena el preflight lo daría por bueno (CIF-129).
cat > "$TMP/env-con-sufijo.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL_UNPOOLED", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_SESSION_SECRET_OLD", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_PANEL_PASSWORD", "target": ["production"], "type": "sensitive" }
  ]
}
JSON

# Guarda del shell del panel (CIF-282). El inventario de la sesión está completo en los tres, así que
# el único motivo de bloqueo es el interruptor que se prueba.
cat > "$TMP/env-demo-activo.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_SESSION_SECRET", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_PANEL_PASSWORD", "target": ["production"], "type": "sensitive" },
    { "key": "CATALOG_DEMO_MODE", "target": ["production"], "type": "plain", "value": "true" }
  ]
}
JSON

cat > "$TMP/env-demo-ambiguo.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_SESSION_SECRET", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_PANEL_PASSWORD", "target": ["production"], "type": "sensitive" },
    { "key": "CATALOG_DEMO_MODE", "target": ["production"], "type": "plain", "value": "quizá" }
  ]
}
JSON

cat > "$TMP/env-panel-abierto.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_SESSION_SECRET", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_PANEL_PASSWORD", "target": ["production"], "type": "sensitive" },
    { "key": "CATALOG_DEMO_MODE", "target": ["production"], "type": "plain", "value": "false" },
    { "key": "ADMIN_PANEL_ENABLED", "target": ["production"], "type": "plain", "value": "true" }
  ]
}
JSON

# Vercel no entrega el valor de una variable sensible: el preflight no puede comprobarla y no debe
# inventarse un pendiente (avisa y sigue).
cat > "$TMP/env-demo-no-legible.json" <<'JSON'
{
  "envs": [
    { "key": "DATABASE_URL", "target": ["production"], "type": "sensitive" },
    { "key": "NEXT_PUBLIC_SITE_URL", "target": ["production"], "type": "plain" },
    { "key": "ADMIN_SESSION_SECRET", "target": ["production"], "type": "sensitive" },
    { "key": "ADMIN_PANEL_PASSWORD", "target": ["production"], "type": "sensitive" },
    { "key": "CATALOG_DEMO_MODE", "target": ["production"], "type": "sensitive" }
  ]
}
JSON

# Variantes de CIF-282: el inventario con la sesión completa más un interruptor, para no repetir
# cinco bloques casi iguales. `sensitive` deja el valor sin leer, como hace la API de Vercel.
con_interruptor() { # con_interruptor <destino> <clave> <tipo> [valor]
  python3 - "$TMP/env-completo.json" "$1" "$2" "$3" "${4-}" <<'PY'
import json
import sys

base, destino, clave, tipo, valor = sys.argv[1:6]
with open(base, encoding="utf-8") as handle:
    datos = json.load(handle)
entrada = {"key": clave, "target": ["production"], "type": tipo}
if tipo != "sensitive":
    entrada["value"] = valor
datos["envs"].append(entrada)
with open(destino, "w", encoding="utf-8") as handle:
    json.dump(datos, handle)
PY
}

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

# Caso 1: Production define DATABASE_URL y la sesión del panel -> todo en orden y código 0.
ejecutar "$TMP/env-completo.json"
codigo=$?
if [[ "$codigo" -eq 0 ]]; then
  pasa "con DATABASE_URL y la sesión en Production el preflight sale con código 0"
else
  falla "con DATABASE_URL y la sesión en Production el preflight sale con código $codigo (se esperaba 0)"
fi
if grep -qE '^  OK .*DATABASE_URL' "$TMP/salida" &&
  grep -qE '^  OK .*ADMIN_SESSION_SECRET' "$TMP/salida" &&
  grep -qE '^  OK .*ADMIN_PANEL_PASSWORD' "$TMP/salida"; then
  pasa "el informe lista las claves exigidas de Production"
else
  falla "el informe no lista las claves exigidas de Production"
fi

# Caso 2: Production sin ADMIN_SESSION_SECRET -> pendiente explícito y código 1. Con
# `ADMIN_API_TOKEN` presente: desde CIF-123 el token no es exigible y su falta no se avisa.
ejecutar "$TMP/env-sin-sesion.json"
codigo=$?
if [[ "$codigo" -eq 1 ]]; then
  pasa "sin ADMIN_SESSION_SECRET en Production el preflight sale con código 1"
else
  falla "sin ADMIN_SESSION_SECRET en Production el preflight sale con código $codigo (se esperaba 1)"
fi
if grep -qE '^  PENDIENTE falta ADMIN_SESSION_SECRET en Production' "$TMP/salida"; then
  pasa "el informe marca PENDIENTE la falta de ADMIN_SESSION_SECRET"
else
  falla "el informe no marca PENDIENTE la falta de ADMIN_SESSION_SECRET"
fi
if grep -qE 'falta ADMIN_API_TOKEN' "$TMP/salida"; then
  falla "el informe marca PENDIENTE la falta de ADMIN_API_TOKEN, que ya no es exigible (CIF-123)"
else
  pasa "el informe no exige ADMIN_API_TOKEN: su ausencia no se avisa (CIF-123)"
fi

# Caso 3: Production sin ADMIN_PANEL_PASSWORD -> pendiente explícito y código 1.
ejecutar "$TMP/env-sin-password.json"
codigo=$?
if [[ "$codigo" -eq 1 ]]; then
  pasa "sin ADMIN_PANEL_PASSWORD en Production el preflight sale con código 1"
else
  falla "sin ADMIN_PANEL_PASSWORD en Production el preflight sale con código $codigo (se esperaba 1)"
fi
if grep -qE '^  PENDIENTE falta ADMIN_PANEL_PASSWORD en Production' "$TMP/salida"; then
  pasa "el informe marca PENDIENTE la falta de ADMIN_PANEL_PASSWORD"
else
  falla "el informe no marca PENDIENTE la falta de ADMIN_PANEL_PASSWORD"
fi

# Caso 4: nombres con sufijo no cubren a la clave exacta (CIF-129).
ejecutar "$TMP/env-con-sufijo.json"
codigo=$?
if [[ "$codigo" -eq 1 ]]; then
  pasa "con DATABASE_URL_UNPOOLED y ADMIN_SESSION_SECRET_OLD el preflight sale con código 1"
else
  falla "con nombres con sufijo el preflight sale con código $codigo (se esperaba 1)"
fi
if grep -qE '^  PENDIENTE falta DATABASE_URL en Production' "$TMP/salida" &&
  grep -qE '^  PENDIENTE falta ADMIN_SESSION_SECRET en Production' "$TMP/salida"; then
  pasa "nombres con sufijo no cubren DATABASE_URL ni ADMIN_SESSION_SECRET"
else
  falla "un nombre con sufijo cubrió la clave exacta (comparación por subcadena)"
fi

# Caso 5: CATALOG_DEMO_MODE activa en Production -> pendiente explícito y código 1 (CIF-282).
ejecutar "$TMP/env-demo-activo.json"
codigo=$?
if [[ "$codigo" -eq 1 ]]; then
  pasa "con CATALOG_DEMO_MODE activa en Production el preflight sale con código 1"
else
  falla "con CATALOG_DEMO_MODE activa el preflight sale con código $codigo (se esperaba 1)"
fi
if grep -qE '^  PENDIENTE CATALOG_DEMO_MODE activa el catálogo de demostración en Production' "$TMP/salida"; then
  pasa "el informe marca PENDIENTE el modo demostración en Production"
else
  falla "el informe no marca PENDIENTE el modo demostración en Production"
fi

# Caso 6: valor que `environmentFlag` rechaza -> el arranque no pasa y el preflight lo bloquea.
ejecutar "$TMP/env-demo-ambiguo.json"
codigo=$?
if [[ "$codigo" -eq 1 ]] &&
  grep -qE '^  PENDIENTE CATALOG_DEMO_MODE tiene un valor que el arranque rechaza' "$TMP/salida"; then
  pasa "un valor ambiguo de CATALOG_DEMO_MODE bloquea y se explica (CIF-74)"
else
  falla "un valor ambiguo de CATALOG_DEMO_MODE no bloquea o no se explica (código $codigo)"
fi

# Caso 7: ADMIN_PANEL_ENABLED=true es un interruptor legítimo -> se informa y no bloquea.
ejecutar "$TMP/env-panel-abierto.json"
codigo=$?
if [[ "$codigo" -eq 0 ]]; then
  pasa "con ADMIN_PANEL_ENABLED activado el preflight sigue saliendo con código 0"
else
  falla "con ADMIN_PANEL_ENABLED activado el preflight sale con código $codigo (se esperaba 0)"
fi
if grep -qE '^  OK .*ADMIN_PANEL_ENABLED activado en Production' "$TMP/salida"; then
  pasa "el informe indica que el panel se sirve detrás de la sesión"
else
  falla "el informe no indica el estado de ADMIN_PANEL_ENABLED"
fi

# Caso 8: valor no legible (variable sensible) -> INFO, sin pendiente inventado.
ejecutar "$TMP/env-demo-no-legible.json"
codigo=$?
if [[ "$codigo" -eq 0 ]] &&
  grep -qE '^  INFO .*CATALOG_DEMO_MODE .*no es legible' "$TMP/salida"; then
  pasa "un valor no legible avisa por INFO y no bloquea en falso"
else
  falla "un valor no legible de CATALOG_DEMO_MODE no se trata como INFO (código $codigo)"
fi

# Caso 9: `CATALOG_DEMO_MODE=" false "` no es un booleano válido (`z.stringbool()` no recorta) y el
# arranque no pasa, así que el preflight no puede informar OK (CIF-282 H5).
con_interruptor "$TMP/env-demo-con-espacios.json" CATALOG_DEMO_MODE plain " false "
ejecutar "$TMP/env-demo-con-espacios.json"
codigo=$?
if [[ "$codigo" -eq 1 ]] &&
  grep -qE '^  PENDIENTE CATALOG_DEMO_MODE tiene un valor que el arranque rechaza' "$TMP/salida" &&
  ! grep -qE 'CATALOG_DEMO_MODE desactivado' "$TMP/salida"; then
  pasa "un valor con espacios no se recorta: CATALOG_DEMO_MODE bloquea en vez de dar un falso OK"
else
  falla "un CATALOG_DEMO_MODE con espacios se dio por bueno (código $codigo)"
fi

# Caso 10: ADMIN_PANEL_ENABLED=" true " revienta la guarda en cada petición -> PENDIENTE, no OK.
con_interruptor "$TMP/env-panel-con-espacios.json" ADMIN_PANEL_ENABLED plain " true "
ejecutar "$TMP/env-panel-con-espacios.json"
codigo=$?
if [[ "$codigo" -eq 1 ]] &&
  grep -qE '^  PENDIENTE ADMIN_PANEL_ENABLED tiene un valor que la guarda rechaza' "$TMP/salida" &&
  ! grep -qE 'ADMIN_PANEL_ENABLED activado' "$TMP/salida"; then
  pasa "un ADMIN_PANEL_ENABLED con espacios no se informa como activado"
else
  falla "un ADMIN_PANEL_ENABLED con espacios se informó como activado (código $codigo)"
fi

# Caso 11: solo espacios es «ausente» (`environmentFlag` recorta y cae al default false) -> OK sin
# bloqueo y sin tratar el valor como ilegible.
con_interruptor "$TMP/env-demo-solo-espacios.json" CATALOG_DEMO_MODE plain "   "
ejecutar "$TMP/env-demo-solo-espacios.json"
codigo=$?
if [[ "$codigo" -eq 0 ]] &&
  grep -qE '^  OK .*CATALOG_DEMO_MODE solo tiene espacios' "$TMP/salida"; then
  pasa "un valor con solo espacios cuenta como ausente (default false) y no bloquea"
else
  falla "un valor con solo espacios no se trató como ausente (código $codigo)"
fi

# Caso 12: ADMIN_PANEL_ENABLED con valor ambiguo -> PENDIENTE explícito y código 1 (rama `ko`).
con_interruptor "$TMP/env-panel-ambiguo.json" ADMIN_PANEL_ENABLED plain "quizá"
ejecutar "$TMP/env-panel-ambiguo.json"
codigo=$?
if [[ "$codigo" -eq 1 ]] &&
  grep -qE '^  PENDIENTE ADMIN_PANEL_ENABLED tiene un valor que la guarda rechaza' "$TMP/salida"; then
  pasa "un ADMIN_PANEL_ENABLED ambiguo bloquea y se explica"
else
  falla "un ADMIN_PANEL_ENABLED ambiguo no bloquea o no se explica (código $codigo)"
fi

# Caso 13: ADMIN_PANEL_ENABLED no legible (variable sensible) -> INFO, sin pendiente inventado.
con_interruptor "$TMP/env-panel-no-legible.json" ADMIN_PANEL_ENABLED sensitive
ejecutar "$TMP/env-panel-no-legible.json"
codigo=$?
if [[ "$codigo" -eq 0 ]] &&
  grep -qE '^  INFO .*ADMIN_PANEL_ENABLED .*no es legible' "$TMP/salida"; then
  pasa "un ADMIN_PANEL_ENABLED no legible avisa por INFO y no bloquea en falso"
else
  falla "un ADMIN_PANEL_ENABLED no legible no se trata como INFO (código $codigo)"
fi

# Caso 14: contrato de redacción (ADR-0014): el informe no imprime ningún valor de credencial.
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
