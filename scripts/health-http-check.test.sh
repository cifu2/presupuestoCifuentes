#!/usr/bin/env bash
#
# Tests de `scripts/health-http-check.sh` (CIF-456).
#
# Contrato que se prueba: el script arranca la build de producción una vez por estado del borde y
# solo da un caso por bueno si coinciden **código, `status` y `database`**. Una regresión de los 503
# (el punto ciego que dejó CIF-453: el E2E hermético solo cubre `unconfigured`) tiene que salir en
# rojo, y el informe no puede filtrar la contraseña de la base (ADR-0014).
#
# `pnpm` y `curl` se sustituyen por dobles: no se compila nada, no se abre ningún puerto de verdad y
# no se toca ninguna base de datos. La cadena de conexión es sintética y se arma por piezas para que
# el fichero no contenga una cadena con forma de credencial (el barrido `scripts/secret-scan.sh` es
# una puerta de CI).
#
# Uso:   scripts/health-http-check.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK="$SCRIPT_DIR/health-http-check.sh"

if [[ ! -x "$CHECK" ]]; then
  echo "no encuentro $CHECK" >&2
  exit 69
fi

command -v python3 >/dev/null 2>&1 || {
  echo "falta python3" >&2
  exit 69
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/salud-http-test.XXXXXX")"
chmod 700 "$TMP"
mkdir -p "$TMP/bin" "$TMP/state" "$TMP/repo"
trap 'rm -rf "$TMP"' EXIT

# Credencial sintética, nunca real: sirve para comprobar que el informe no la imprime. El separador
# se monta en tiempo de ejecución para no dejar una cadena con forma de credencial en el fichero
# (`postgres-con-credenciales`, ADR-0014), como en `seed-preview-catalogo.test.sh`.
SENTINEL_USER='sonda-qa'
SENTINEL_PASSWORD='centinela-qa-sin-credencial-real'
SENTINEL_HOST='127.0.0.1'
DOS_PUNTOS=':'
SENTINEL="$(printf 'postgresql://%s%s%s@%s:5432/cifuentes_test' "$SENTINEL_USER" "$DOS_PUNTOS" "$SENTINEL_PASSWORD" "$SENTINEL_HOST")"

cat > "$TMP/bin/pnpm" <<'FAKE'
#!/usr/bin/env bash
# Doble de `pnpm`: `build` deja una build marcada y `start` registra el caso que le toca según el
# entorno con el que el script lo arranca, para que el doble de `curl` responda como el borde real.
set -uo pipefail
case "${1:-}" in
  build)
    mkdir -p "$FAKE_REPO/.next"
    printf 'build-del-doble' > "$FAKE_REPO/.next/BUILD_ID"
    printf 'compilada' > "$FAKE_STATE/built"
    ;;
  start)
    port="$3"
    case "${CATALOG_DEMO_MODE:-}|${DATABASE_URL:-}" in
      'true|') kind='unconfigured' ;;
      *'options='*) kind='unmigrated' ;;
      *':1/sonda') kind='unreachable' ;;
      *) kind='ok' ;;
    esac
    printf '%s\n' "$kind" > "$FAKE_STATE/kind-$port"
    # `definida` distingue la variable ausente de la vacía: el estado `unconfigured` del contrato es
    # el de la variable **ausente** (una cadena vacía no pasa la validación del entorno y da 500).
    printf '%s|%s\n' "${CATALOG_DEMO_MODE:-}" "${DATABASE_URL+definida}" > "$FAKE_STATE/env-$kind"
    # El servidor "se para" cuando el grupo de procesos recibe la señal, como el real.
    trap 'rm -f "$FAKE_STATE/kind-$port"' TERM EXIT
    # Fuga deliberada: prueba que la guardia de higiene del informe ve la contraseña en el log.
    if [[ "${FAKE_LEAK_PASSWORD:-0}" == "1" ]]; then
      printf 'arrancando con %s\n' "${DATABASE_URL:-}"
    fi
    sleep 300
    ;;
esac
FAKE
chmod +x "$TMP/bin/pnpm"

cat > "$TMP/bin/curl" <<'FAKE'
#!/usr/bin/env bash
# Doble de `curl`: responde el contrato canónico del caso al que pertenece el puerto, salvo que el
# test haya dejado un fichero de sobrerrespuesta (`override-<caso>`) para simular una regresión.
set -uo pipefail
body=''
url=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      body="${2:-}"
      shift 2
      ;;
    -w) shift 2 ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

port="${url##*:}"
port="${port%%/*}"
kind="$(cat "$FAKE_STATE/kind-$port" 2>/dev/null || printf 'desconocido')"
override="$FAKE_STATE/override-$kind"

if [[ -f "$override" ]]; then
  read -r code status database < "$override"
else
  case "$kind" in
    unconfigured)
      code=200
      status='ok'
      database='unconfigured'
      ;;
    ok)
      code=200
      status='ok'
      database='ok'
      ;;
    unmigrated)
      code=503
      status='degraded'
      database='unmigrated'
      ;;
    unreachable)
      code=503
      status='degraded'
      database='unreachable'
      ;;
    *)
      code=000
      status=''
      database=''
      ;;
  esac
fi

if [[ -n "$body" ]]; then
  printf '{"status":"%s","service":"cifuentes-presupuestos","environment":"production","database":"%s","checkedAt":"2026-01-01T00:00:00.000Z"}' \
    "$status" "$database" > "$body"
fi
printf '%s' "$code"
FAKE
chmod +x "$TMP/bin/curl"

fallos=0
last_status=0
ok() { printf '  ok    %s\n' "$1"; }
ko() {
  printf '  ko    %s\n' "$1"
  fallos=1
}

reset_state() {
  rm -f "$TMP/state"/override-* "$TMP/state"/kind-* "$TMP/state"/env-* "$TMP/state"/built
}

run_check() { # run_check <nombre>  -> deja el código de salida en last_status
  PATH="$TMP/bin:$PATH" \
    FAKE_REPO="$TMP/repo" \
    FAKE_STATE="$TMP/state" \
    TEST_DATABASE_URL="$SENTINEL" \
    "$CHECK" >"$TMP/$1.out" 2>&1
  last_status=$?
}

informe() { # informe <nombre>  -> imprime el informe de la última ejecución
  cat "$TMP/$1.out"
}

# --- Caso 1: los cuatro estados del contrato en verde ---------------------------
reset_state
run_check verde
if [[ "$last_status" -eq 0 ]] &&
  grep -q '4/4 estados del contrato en verde' "$TMP/verde.out" &&
  [[ "$(grep -c '^  OK' "$TMP/verde.out")" -eq 4 ]]; then
  ok 'los cuatro estados del contrato pasan (200/200/503/503)'
else
  ko "el caso verde no pasa (código $last_status)"
  informe verde
fi

if [[ -f "$TMP/state/built" ]]; then
  ok 'compila la build de producción antes de sondear el borde'
else
  ko 'no se compiló la build: el borde se probaría contra un bundle viejo'
fi

if [[ "$(cat "$TMP/state/env-unconfigured" 2>/dev/null)" == 'true|' ]] &&
  [[ "$(cat "$TMP/state/env-ok" 2>/dev/null)" == 'false|definida' ]] &&
  [[ "$(cat "$TMP/state/env-unmigrated" 2>/dev/null)" == 'false|definida' ]] &&
  [[ "$(cat "$TMP/state/env-unreachable" 2>/dev/null)" == 'false|definida' ]]; then
  ok 'cada estado se sondea con su entorno (DATABASE_URL ausente, migrada, sin esquema y caída)'
else
  ko 'el entorno de algún caso no es el del contrato'
  for caso in unconfigured ok unmigrated unreachable; do
    printf '      %s: %s\n' "$caso" "$(cat "$TMP/state/env-$caso" 2>/dev/null)"
  done
fi

if grep -qE 'postgres(ql)?://' "$TMP/verde.out"; then
  ko 'el informe imprime una cadena de conexión (ADR-0014)'
else
  ok 'el informe no imprime ninguna cadena de conexión'
fi

# --- Caso 2: regresión del 503 `unmigrated` ------------------------------------
reset_state
printf '200 ok unmigrated\n' > "$TMP/state/override-unmigrated"
run_check unmigrated_roto
if [[ "$last_status" -eq 1 ]] &&
  grep -q 'KO   unmigrated' "$TMP/unmigrated_roto.out" &&
  grep -q 'esperado  HTTP 503' "$TMP/unmigrated_roto.out"; then
  ok 'un «unmigrated» que responde 200 sale en rojo y dice lo esperado'
else
  ko "la regresión de «unmigrated» no se detecta (código $last_status)"
  informe unmigrated_roto
fi

# --- Caso 3: el 503 `unreachable` que hoy no vería ninguna puerta --------------
reset_state
printf '200 ok ok\n' > "$TMP/state/override-unreachable"
run_check unreachable_roto
if [[ "$last_status" -eq 1 ]] && grep -q 'KO   unreachable' "$TMP/unreachable_roto.out"; then
  ok 'un «unreachable» que responde 200 sale en rojo'
else
  ko "la regresión de «unreachable» no se detecta (código $last_status)"
  informe unreachable_roto
fi

# --- Caso 4: código correcto, campo equivocado --------------------------------
reset_state
printf '200 ok unreachable\n' > "$TMP/state/override-ok"
run_check campo_roto
if [[ "$last_status" -eq 1 ]] && grep -q 'KO   ok' "$TMP/campo_roto.out"; then
  ok 'no basta el código: un «database» equivocado sale en rojo'
else
  ko "un campo equivocado con el código correcto no se detecta (código $last_status)"
  informe campo_roto
fi

# --- Caso 5: sin base de test no hay contrato que comprobar --------------------
reset_state
PATH="$TMP/bin:$PATH" FAKE_REPO="$TMP/repo" FAKE_STATE="$TMP/state" \
  env -u TEST_DATABASE_URL -u HEALTH_CHECK_DATABASE_URL "$CHECK" >"$TMP/sin_base.out" 2>&1
last_status=$?
if [[ "$last_status" -eq 69 ]] && grep -q 'HEALTH_CHECK_DATABASE_URL' "$TMP/sin_base.out"; then
  ok 'sin base de test falla cerrado (69) en vez de dar el contrato por bueno'
else
  ko "sin base de test no falla cerrado (código $last_status)"
  informe sin_base
fi

# --- Caso 6: la contraseña de la base no puede acabar en el informe ------------
reset_state
PATH="$TMP/bin:$PATH" FAKE_REPO="$TMP/repo" FAKE_STATE="$TMP/state" FAKE_LEAK_PASSWORD=1 \
  TEST_DATABASE_URL="$SENTINEL" "$CHECK" >"$TMP/fuga.out" 2>&1
last_status=$?
if [[ "$last_status" -eq 1 ]] &&
  grep -q 'KO   higiene' "$TMP/fuga.out" &&
  ! grep -qF "$SENTINEL_PASSWORD" "$TMP/fuga.out"; then
  ok 'una fuga de la contraseña en el log del servidor sale en rojo y no se reproduce'
else
  ko "la fuga de credencial no se detecta o se imprime (código $last_status)"
  informe fuga
fi

if [[ "$fallos" -eq 0 ]]; then
  printf '\nhealth-http-check.test.sh: todo en verde\n'
  exit 0
fi

printf '\nhealth-http-check.test.sh: hay fallos\n' >&2
exit 1
