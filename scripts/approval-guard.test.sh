#!/usr/bin/env bash
#
# Test de la guardia de identidad de aprobación (CIF-105; ADR-0015).
#
# Comprueba que la guardia detecta las formas conocidas de aprobar un PR desde Actions, que deja
# pasar la configuración correcta, que exige verificación cuando se le pide (`--require-api`) y que
# nunca imprime el contenido de la línea señalada ni el token usado.
#
# Uso: scripts/approval-guard.test.sh
# Código de salida: 0 si todo pasa, 1 si algún caso falla, 69 si falta una herramienta.
set -uo pipefail

GUARD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/approval-guard.sh"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v python3 >/dev/null 2>&1 || { echo 'falta python3' >&2; exit 69; }
command -v curl >/dev/null 2>&1 || { echo 'falta curl' >&2; exit 69; }

checks=0
failures=0

pass() {
  checks=$((checks + 1))
  printf '  OK    %s\n' "$1"
}
fail() {
  checks=$((checks + 1))
  failures=$((failures + 1))
  printf '  FALLO %s [%s]\n' "$1" "$2"
}
assert_eq() { # <descripción> <esperado> <obtenido>
  if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1" "esperado '$2', obtenido '$3'"; fi
}
assert_contains() { # <descripción> <aguja>
  if [[ "$OUT" == *"$2"* ]]; then pass "$1"; else fail "$1" "no aparece '$2' en la salida"; fi
}
assert_not_contains() { # <descripción> <aguja>
  if [[ "$OUT" != *"$2"* ]]; then pass "$1"; else fail "$1" "aparece '$2' en la salida"; fi
}

OUT=''
RC=0
run() { # run [argumentos...]  (siempre desde la raíz del repositorio)
  OUT="$(cd "$ROOT" && bash "$GUARD" "$@" 2>&1)"
  RC=$?
}

FIX="$(mktemp -d)"
SERVER_PID=''
cleanup() {
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null
  find "$FIX" -type f -delete 2>/dev/null
  find "$FIX" -depth -type d -exec rmdir {} + 2>/dev/null
  return 0
}
trap cleanup EXIT

mkdir -p "$FIX/ok" "$FIX/pr-write" "$FIX/pr-write-sin-espacio" "$FIX/write-all" "$FIX/aprueba" \
  "$FIX/pr-read" "$FIX/vacio" "$FIX/yaml-ext" "$FIX/fn-alias" "$FIX/fn-variable" "$FIX/fn-calculado" \
  "$FIX/fn-secreto"

cat >"$FIX/ok/ci.yml" <<'YML'
name: CI
on: [pull_request]
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hola
YML

cat >"$FIX/pr-write/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  avisar:
    runs-on: ubuntu-latest
    steps:
      - run: echo aviso
YML

cat >"$FIX/pr-write-sin-espacio/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions:
  pull-requests:write
jobs:
  avisar:
    runs-on: ubuntu-latest
    steps:
      - run: echo aviso
YML

cat >"$FIX/write-all/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions: write-all
jobs:
  avisar:
    runs-on: ubuntu-latest
    steps:
      - run: echo aviso
YML

cat >"$FIX/aprueba/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions:
  contents: read
jobs:
  aprobar:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr review 26 --approve
      - run: curl -s -X POST -d '{"event":"APPROVE"}' "$API/pulls/26/reviews"
YML

cat >"$FIX/pr-read/ci.yml" <<'YML'
name: CI
on: [pull_request]
permissions:
  contents: read
  pull-requests: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hola
YML

# --- Falsos negativos que QA reprodujo en la revisión del PR #27 (CIF-106) -------------------

# FN-1: `-a` es el alias corto de `--approve` (`gh pr review --help`).
cat >"$FIX/fn-alias/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions:
  contents: read
jobs:
  aprobar:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr review 26 -a
YML

# FN-2: el evento viaja en una variable de entorno.
cat >"$FIX/fn-variable/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions:
  contents: read
jobs:
  aprobar:
    runs-on: ubuntu-latest
    env:
      REVIEW_EVENT: APPROVE
    steps:
      - run: gh api -X POST "repos/o/r/pulls/26/reviews" -f "event=$REVIEW_EVENT"
YML

# FN-3: el evento se calcula dentro del propio step.
cat >"$FIX/fn-calculado/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions:
  contents: read
jobs:
  aprobar:
    runs-on: ubuntu-latest
    steps:
      - run: |
          EVENT=$(echo APPROVE)
          gh api -X POST "repos/o/r/pulls/26/reviews" -f "event=${EVENT}"
YML

# Limitación declarada: si el evento sale de un secreto no hay nada léxico que leer. Lo contiene la
# mitad dinámica (`can_approve_pull_request_reviews=false` impide aprobar al GITHUB_TOKEN), no el
# tripwire. El test fija ese comportamiento para que la limitación sea explícita.
cat >"$FIX/fn-secreto/approve.yml" <<'YML'
name: revision
on: [pull_request]
permissions:
  contents: read
jobs:
  aprobar:
    runs-on: ubuntu-latest
    steps:
      - run: gh api -X POST "repos/o/r/pulls/26/reviews" -f "event=${{ secrets.REVIEW_EVENT }}"
YML

# La extensión `.yaml` también se lee.
cat >"$FIX/yaml-ext/approve.yaml" <<'YML'
name: revision
on: [pull_request]
permissions:
  pull-requests: write
YML

echo '== casos estáticos'

run --static-only --workflows-dir "$FIX/ok"
assert_eq 'workflow limpio: sin hallazgos' 0 "$RC"
assert_contains 'workflow limpio: lo dice' 'sin hallazgos'

run --static-only --workflows-dir "$FIX/pr-read"
assert_eq 'pull-requests: read no es violación' 0 "$RC"

run --static-only --workflows-dir "$FIX/pr-write"
assert_eq 'pull-requests: write falla' 1 "$RC"
assert_contains 'señala la regla de permisos de PR' "permisos-pr-write $FIX/pr-write/approve.yml:5"

run --static-only --workflows-dir "$FIX/pr-write-sin-espacio"
assert_eq 'pull-requests:write (sin espacio) falla' 1 "$RC"
assert_contains 'señala la regla sin espacio' 'permisos-pr-write'

run --static-only --workflows-dir "$FIX/write-all"
assert_eq 'permissions: write-all falla' 1 "$RC"
assert_contains 'señala la regla write-all' "permisos-write-all $FIX/write-all/approve.yml:3"

run --static-only --workflows-dir "$FIX/aprueba"
assert_eq 'workflow que aprueba falla' 1 "$RC"
assert_contains 'señala la regla de aprobación' "aprobacion-desde-actions $FIX/aprueba/approve.yml:9"
assert_contains 'señala también el curl con APPROVE' "aprobacion-desde-actions $FIX/aprueba/approve.yml:10"
assert_not_contains 'no reproduce la línea ni el evento' 'APPROVE'
assert_not_contains 'no reproduce el fragmento de gh' '--approve'

run --static-only --workflows-dir "$FIX/fn-alias"
assert_eq 'FN-1 (gh pr review -a) falla' 1 "$RC"
assert_contains 'FN-1: señala la línea del alias' "aprobacion-desde-actions $FIX/fn-alias/approve.yml:9"
assert_not_contains 'FN-1: no reproduce la línea' 'gh pr review 26 -a'

run --static-only --workflows-dir "$FIX/fn-variable"
assert_eq 'FN-2 (evento en variable) falla' 1 "$RC"
assert_contains 'FN-2: señala la línea de la variable' "aprobacion-desde-actions $FIX/fn-variable/approve.yml:9"
assert_not_contains 'FN-2: no reproduce la línea' 'REVIEW_EVENT: APPROVE'

run --static-only --workflows-dir "$FIX/fn-calculado"
assert_eq 'FN-3 (evento calculado) falla' 1 "$RC"
assert_contains 'FN-3: señala la línea del cálculo' "aprobacion-desde-actions $FIX/fn-calculado/approve.yml:10"
# El literal con $( ) es justo lo que no debe aparecer en la salida del tripwire.
# shellcheck disable=SC2016
assert_not_contains 'FN-3: no reproduce la línea' 'EVENT=$(echo APPROVE)'

run --static-only --workflows-dir "$FIX/fn-secreto"
assert_eq 'limitación declarada: el evento desde un secreto se le escapa al tripwire' 0 "$RC"

run --static-only --workflows-dir "$FIX/yaml-ext"
assert_eq 'la extensión .yaml también se analiza' 1 "$RC"
assert_contains 'señala la regla en el .yaml' "permisos-pr-write $FIX/yaml-ext/approve.yaml:4"

run --static-only --workflows-dir "$FIX/vacio"
assert_eq 'directorio sin workflows falla' 1 "$RC"
assert_contains 'señala la regla de directorio vacío' 'sin-workflows'

run --workflows-dir "$FIX/no-existe"
assert_eq 'directorio inexistente: error de uso' 2 "$RC"

echo '== mitad dinámica (token)'

run --static-only --workflows-dir "$FIX/ok"
assert_eq 'static-only no necesita token' 0 "$RC"

GH_TOKEN='' GITHUB_DEVOPS_TOKEN='' run --workflows-dir "$FIX/ok"
assert_eq 'sin token: no falla, lo omite' 0 "$RC"
assert_contains 'sin token: lo dice' 'OMITIDO'

GH_TOKEN='' GITHUB_DEVOPS_TOKEN='' run --require-api --workflows-dir "$FIX/ok"
assert_eq 'sin token con --require-api: falla' 1 "$RC"
assert_contains 'sin token con --require-api: regla' 'api-no-verificable'

cat >"$FIX/server.py" <<'PY'
import http.server, socketserver, sys

body = open(sys.argv[1], 'rb').read()
status = int(sys.argv[2])


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class Server(socketserver.TCPServer):
    allow_reuse_address = True


server = Server(('127.0.0.1', 0), Handler)
print(server.server_address[1], flush=True)
server.serve_forever()
PY

start_server() { # start_server <cuerpo-json> <estado-http> -> API_BASE
  printf '%s' "$1" >"$FIX/body.json"
  python3 "$FIX/server.py" "$FIX/body.json" "$2" >"$FIX/port.txt" 2>/dev/null &
  SERVER_PID=$!
  local port=''
  for _ in $(seq 1 50); do
    port="$(cat "$FIX/port.txt" 2>/dev/null || true)"
    [[ -n "$port" ]] && break
    sleep 0.1
  done
  [[ -n "$port" ]] || { echo 'no arrancó el servidor de prueba' >&2; exit 69; }
  echo "http://127.0.0.1:$port"
}

API_BIEN="$(start_server '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}' 200)"
DUMMY_TOKEN='token-de-prueba-no-real'
OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --require-api --api-base "$API_BIEN" --workflows-dir "$FIX/ok" 2>&1)"
RC=$?
assert_eq 'ajustes correctos: sin hallazgos' 0 "$RC"
assert_contains 'confirma el ajuste de aprobación' 'can_approve_pull_request_reviews=false'
assert_contains 'confirma el permiso por defecto' 'default_workflow_permissions=read'
assert_not_contains 'no imprime el token' "$DUMMY_TOKEN"
kill "$SERVER_PID" 2>/dev/null

API_MAL="$(start_server '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}' 200)"
OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --require-api --api-base "$API_MAL" --workflows-dir "$FIX/ok" 2>&1)"
RC=$?
assert_eq 'ajuste de aprobación activado: falla' 1 "$RC"
assert_contains 'señala el ajuste peligroso' 'ajuste-aprobacion-bot'
kill "$SERVER_PID" 2>/dev/null

API_PERMS="$(start_server '{"default_workflow_permissions":"write","can_approve_pull_request_reviews":false}' 200)"
OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --require-api --api-base "$API_PERMS" --workflows-dir "$FIX/ok" 2>&1)"
RC=$?
assert_eq 'permisos por defecto de escritura: falla' 1 "$RC"
assert_contains 'señala los permisos' 'ajuste-workflow-permissions'
kill "$SERVER_PID" 2>/dev/null

API_403="$(start_server '{"message":"Resource not accessible by integration"}' 403)"
OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --api-base "$API_403" --workflows-dir "$FIX/ok" 2>&1)"
RC=$?
assert_eq 'API no accesible sin --require-api: no falla' 0 "$RC"
assert_contains 'API no accesible: lo omite' 'OMITIDO'

OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --require-api --api-base "$API_403" --workflows-dir "$FIX/ok" 2>&1)"
RC=$?
assert_eq 'API no accesible con --require-api: falla' 1 "$RC"
assert_contains 'API no accesible: regla' 'api-no-verificable'
assert_not_contains 'no imprime el token (403)' "$DUMMY_TOKEN"
kill "$SERVER_PID" 2>/dev/null

OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --api-base "$API_403" --workflows-dir "$FIX/ok" 2>&1)"
assert_contains '403: explica que falta Administration: read' 'Administration: read'
assert_contains '403: distingue el token del revisor' 'cifucorp-review-bot'

API_SIN_CLAVE="$(start_server '{"default_workflow_permissions":"read"}' 200)"
OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --api-base "$API_SIN_CLAVE" --workflows-dir "$FIX/ok" 2>&1)"
RC=$?
assert_eq '200 sin can_approve_pull_request_reviews: no falla sin --require-api' 0 "$RC"
assert_contains '200 sin la clave: lo dice' 'respuesta sin can_approve_pull_request_reviews'

OUT="$(cd "$ROOT" && GH_TOKEN="$DUMMY_TOKEN" bash "$GUARD" --require-api --api-base "$API_SIN_CLAVE" --workflows-dir "$FIX/ok" 2>&1)"
RC=$?
assert_eq '200 sin can_approve_pull_request_reviews: falla con --require-api' 1 "$RC"
assert_contains '200 sin la clave: regla' 'api-no-verificable'
kill "$SERVER_PID" 2>/dev/null

echo '== los workflows reales del repositorio'
run --static-only
assert_eq 'los workflows de main pasan la guardia' 0 "$RC"

echo
if [[ "$failures" -gt 0 ]]; then
  printf 'Guardia de aprobación (test): %d de %d comprobaciones fallidas.\n' "$failures" "$checks"
  exit 1
fi
printf 'Guardia de aprobación (test): %d comprobaciones correctas.\n' "$checks"
