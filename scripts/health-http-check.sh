#!/usr/bin/env bash
#
# Contrato HTTP real de `/api/health` sobre una build de producción servida (CIF-456).
#
# La sonda del monitor externo no ve el caso de uso, ve el borde: código HTTP y cuerpo JSON. Este
# script levanta la build de producción (`pnpm start`) cuatro veces, una por estado del contrato
# (ADR-0015 §5), y compara lo observado con lo esperado:
#
#   unconfigured  DATABASE_URL ausente (modo demostración)  200  ok        unconfigured
#   ok            base migrada                             200  ok        ok
#   unmigrated    base sin el esquema de la aplicación      503  degraded  unmigrated
#   unreachable   base que no responde (puerto cerrado)     503  degraded  unreachable
#
# Por qué no bastan los unitarios de la ruta: `src/app/api/health/route.test.ts` dobla el caso de
# uso, así que una regresión del montaje real (variables de entorno, driver, bundle de producción)
# no la vería nadie. Esto es justo lo que vigila el monitor externo (ADR-0009 §5) y lo que en
# CIF-453 solo quedó comprobado a mano.
#
# `unmigrated` se provoca con `search_path` a un esquema que **no existe**: la base responde pero la
# sonda no resuelve las tablas de la aplicación (`to_regclass` devuelve NULL, igual que en una base
# recién creada sin migraciones). No se ejecuta ningún DDL: una comprobación de la puerta no debe
# escribir en la base.
#
# `unreachable` apunta a un puerto cerrado con credenciales sintéticas. La cadena se arma por piezas
# para que el fichero no contenga una cadena con forma de credencial (ADR-0014; el barrido
# `scripts/secret-scan.sh` es una puerta de CI). El informe nunca imprime cadenas de conexión y
# comprueba que la contraseña de la base no aparece ni en él ni en los logs del servidor. Su
# contrato se prueba en `scripts/health-http-check.test.sh`.
#
# `unconfigured` es **sin** `DATABASE_URL`, no con la variable vacía: `DATABASE_URL=""` no pasa la
# validación del entorno (`z.string().min(1)`) y el borde responde 500 (visto al escribir CIF-456).
# El caso se arranca con `-u DATABASE_URL` para que un valor heredado del entorno no lo contamine;
# si hay un `.env.local` con `DATABASE_URL`, Next lo cargaría igual y el script avisa.
#
# Uso:    scripts/health-http-check.sh
# Entorno:
#   HEALTH_CHECK_DATABASE_URL | TEST_DATABASE_URL  base migrada (obligatoria; en CI es la del job)
#   HEALTH_CHECK_SKIP_BUILD=1                      reutiliza la build existente (`.next/BUILD_ID`)
#   HEALTH_CHECK_REPORT=<ruta>                     copia el informe a esa ruta (lo mismo que stdout)
# Salida: informe en texto, una línea por caso. Código 0 si los cuatro contratos se cumplen, 1 si
# alguno falla, 69 si falta una herramienta, la base de test o la build pedida.

set -uo pipefail

EXIT_OK=0
EXIT_CONTRACT=1
EXIT_SETUP=69

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DB_URL="${HEALTH_CHECK_DATABASE_URL:-${TEST_DATABASE_URL:-}}"
SKIP_BUILD="${HEALTH_CHECK_SKIP_BUILD:-0}"
REPORT_COPY="${HEALTH_CHECK_REPORT:-}"

missing_tool=0
for tool in curl python3 pnpm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'falta %s\n' "$tool" >&2
    missing_tool=1
  fi
done
[[ "$missing_tool" -eq 0 ]] || exit "$EXIT_SETUP"

if [[ -z "$DB_URL" ]]; then
  printf 'falta HEALTH_CHECK_DATABASE_URL (o TEST_DATABASE_URL): los estados ok y unmigrated necesitan una base migrada\n' >&2
  exit "$EXIT_SETUP"
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/salud-http.XXXXXX")"
REPORT="$TMP/report.txt"
: > "$REPORT"
SERVER_PID=""

say() { printf '%s\n' "$*" >> "$REPORT"; }

# Nunca imprime una cadena de conexión (ADR-0014): se usa con los logs de la build y del servidor.
redact() { sed -E 's#(postgres(ql)?)://[^[:space:]]+#\1://<oculto>#g'; }

free_port() {
  python3 -c 'import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()'
}

body_field() { # body_field <fichero-json> <clave>
  python3 -c 'import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    data = {}
value = data.get(sys.argv[2])
print(value if isinstance(value, str) else "")' "$1" "$2"
}

wait_http_code() { # wait_http_code <puerto> <fichero-cuerpo> [intentos]
  local port="$1" body="$2" attempts="${3:-60}" code="" _
  for _ in $(seq 1 "$attempts"); do
    code="$(curl -sS -o "$body" -w '%{http_code}' "http://127.0.0.1:$port/api/health" 2>/dev/null || true)"
    if [[ -n "$code" && "$code" != "000" ]]; then
      break
    fi
    # Si el servidor ya no existe (arranque fallido), no se espera el resto del tope.
    if [[ -n "$SERVER_PID" ]] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  printf '%s' "$code"
}

# El servidor arranca en su propio grupo de procesos (`setsid`): `pnpm start` lanza `next start`
# como hijo, así que matar solo el PID de `pnpm` dejaría el servidor escuchando.
start_server() { # start_server <puerto> <CLAVE=valor>...
  local port="$1"
  shift
  (
    cd "$REPO_DIR" || exit 1
    exec setsid env "$@" pnpm start --port "$port"
  ) >"$TMP/server-$port.log" 2>&1 &
  SERVER_PID=$!
}

stop_server() {
  if [[ -n "$SERVER_PID" ]]; then
    kill -TERM -"$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
    SERVER_PID=""
  fi
}

wait_port_closed() { # el puerto deja de responder cuando el grupo se ha parado de verdad
  local port="$1" _ code=""
  for _ in $(seq 1 20); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/health" 2>/dev/null || true)"
    [[ "$code" == "000" ]] && return 0
    sleep 0.2
  done
  return 1
}

# shellcheck disable=SC2317
cleanup() {
  stop_server
  rm -rf "$TMP"
}
trap cleanup EXIT

ko=0
hygiene=0

run_case() { # run_case <nombre> <código> <status> <database> <CLAVE=valor>...
  local name="$1" expected_code="$2" expected_status="$3" expected_database="$4"
  shift 4

  local port
  port="$(free_port)"
  local body="$TMP/body-$name.json"

  start_server "$port" "$@"
  local code
  code="$(wait_http_code "$port" "$body")"
  stop_server

  if ! wait_port_closed "$port"; then
    say "  KO   $name  el servidor sigue escuchando en el puerto $port tras pararlo"
    return 1
  fi

  local status database
  status="$(body_field "$body" status)"
  database="$(body_field "$body" database)"

  if [[ "$code" == "$expected_code" && "$status" == "$expected_status" && "$database" == "$expected_database" ]]; then
    say "  OK   $name  HTTP $code  status=$status  database=$database"
    return 0
  fi

  say "  KO   $name  HTTP ${code:-sin respuesta}  status=${status:-<ausente>}  database=${database:-<ausente>}"
  say "       esperado  HTTP $expected_code  status=$expected_status  database=$expected_database"
  local line
  while IFS= read -r line; do
    say "       log  $line"
  done < <(grep -o '\[health\][^"]*' "$TMP/server-$port.log" 2>/dev/null | sort -u | head -3)
  return 1
}

say '== contrato HTTP de /api/health sobre la build de producción (CIF-456; ADR-0015 §5)'

if [[ "$SKIP_BUILD" == "1" ]]; then
  if [[ ! -f "$REPO_DIR/.next/BUILD_ID" ]]; then
    printf 'HEALTH_CHECK_SKIP_BUILD=1 pero no hay build en %s/.next\n' "$REPO_DIR" >&2
    exit "$EXIT_SETUP"
  fi
  say '   build  se reutiliza la existente (.next/BUILD_ID)'
else
  if ! (cd "$REPO_DIR" && CATALOG_DEMO_MODE=true pnpm build) >"$TMP/build.log" 2>&1; then
    printf 'la build de producción ha fallado (últimas líneas, redactadas)\n' >&2
    redact <"$TMP/build.log" | tail -n 20 >&2
    exit "$EXIT_SETUP"
  fi
  say '   build  producción recompilada'
fi

for env_file in "$REPO_DIR/.env.local" "$REPO_DIR/.env.production.local" "$REPO_DIR/.env.production" "$REPO_DIR/.env"; do
  if [[ -f "$env_file" ]] && grep -qE '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$env_file"; then
    say "   aviso  $(basename "$env_file") define DATABASE_URL: el estado unconfigured puede no ser determinista"
    break
  fi
done

# Esquema por el que se pregunta y que no existe: la base responde y la sonda no ve las tablas.
EMPTY_SCHEMA='salud_http_sin_esquema'
OPTIONS="$(python3 -c 'import sys, urllib.parse
print(urllib.parse.quote("-c search_path=" + sys.argv[1], safe=""))' "$EMPTY_SCHEMA")"
SEPARATOR='?'
[[ "$DB_URL" == *"?"* ]] && SEPARATOR='&'
UNMIGRATED_URL="${DB_URL}${SEPARATOR}options=${OPTIONS}"

# Cadena sintética por piezas: el fichero no puede contener una cadena con forma de credencial
# (`postgres-con-credenciales`, ADR-0014). El separador se monta en tiempo de ejecución, como en
# `seed-preview-catalogo.test.sh`, para que el barrido no marque el propio literal.
UNREACHABLE_USER='sonda-qa'
UNREACHABLE_PASSWORD='sintetica-sin-credencial-real'
UNREACHABLE_HOST='127.0.0.1'
DOS_PUNTOS=':'
UNREACHABLE_URL="$(printf 'postgresql://%s%s%s@%s:1/sonda' "$UNREACHABLE_USER" "$DOS_PUNTOS" "$UNREACHABLE_PASSWORD" "$UNREACHABLE_HOST")"

# `-u DATABASE_URL` va antes de las asignaciones: `env` deja de aceptar opciones en cuanto ve un
# `CLAVE=valor`.
run_case unconfigured 200 ok unconfigured -u DATABASE_URL CATALOG_DEMO_MODE=true || ko=$((ko + 1))
run_case ok 200 ok ok CATALOG_DEMO_MODE=false DATABASE_URL="$DB_URL" || ko=$((ko + 1))
run_case unmigrated 503 degraded unmigrated CATALOG_DEMO_MODE=false DATABASE_URL="$UNMIGRATED_URL" || ko=$((ko + 1))
run_case unreachable 503 degraded unreachable CATALOG_DEMO_MODE=false DATABASE_URL="$UNREACHABLE_URL" || ko=$((ko + 1))

DB_PASSWORD="$(python3 -c 'import sys, urllib.parse
password = urllib.parse.urlparse(sys.argv[1]).password
print(urllib.parse.unquote(password) if password else "")' "$DB_URL")"

if [[ -n "$DB_PASSWORD" ]]; then
  for log in "$TMP"/server-*.log; do
    [[ -f "$log" ]] || continue
    if grep -qF -- "$DB_PASSWORD" "$log"; then
      say "  KO   higiene  $(basename "$log") contiene la contraseña de la base (ADR-0014)"
      hygiene=$((hygiene + 1))
    fi
  done
fi

if grep -qE 'postgres(ql)?://' "$REPORT"; then
  say '  KO   higiene  el informe contiene una cadena de conexión (ADR-0014)'
  hygiene=$((hygiene + 1))
fi

if [[ "$ko" -eq 0 && "$hygiene" -eq 0 ]]; then
  say '== 4/4 estados del contrato en verde'
else
  say "== $((4 - ko))/4 estados del contrato en verde y $hygiene hallazgos de higiene"
fi

cat "$REPORT"

if [[ -n "$REPORT_COPY" ]]; then
  cp "$REPORT" "$REPORT_COPY"
fi

[[ "$ko" -eq 0 && "$hygiene" -eq 0 ]] && exit "$EXIT_OK"
exit "$EXIT_CONTRACT"
