#!/usr/bin/env bash
#
# Tests de `scripts/seed-preview-catalogo.sh` (CIF-330).
#
# Contrato que se prueba, sin tocar ninguna base de datos real: la guarda de destino tiene que
# **morder** (código 78) cuando falta la cadena, cuando el nombre de la base menciona producción y
# cuando no lleva «preview»; en esos casos no puede llegar a invocar `psql`. Con una base de preview,
# el script pasa el SQL de siembra a `psql` por la entrada estándar.
#
# `psql` se sustituye por un doble de prueba en un directorio temporal: no se usa ninguna credencial,
# no se abre ninguna conexión y no se escribe en ningún repositorio.
#
# Uso:   scripts/seed-preview-catalogo.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED="$SCRIPT_DIR/seed-preview-catalogo.sh"

fallos=0
pasa() { printf 'ok    %s\n' "$1"; }
falla() {
  printf 'FALLO %s\n' "$1"
  fallos=$((fallos + 1))
}

if [[ ! -f "$SEED" ]]; then
  echo "no encuentro $SEED" >&2
  exit 69
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/seed-preview-test.XXXXXX")"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

export STUB_LOG="$TMP/psql.calls"
export STUB_SQL="$TMP/psql.stdin"
: > "$STUB_LOG"

# Doble de `psql`: registra la invocación y guarda el SQL que recibe por la entrada estándar.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/psql" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STUB_LOG"
if [[ ! -t 0 ]]; then
  # Se acumula: la segunda invocación (la del recuento) no trae SQL y no puede vaciar el fichero.
  cat >> "$STUB_SQL"
fi
printf '4 3\n'
STUB
chmod +x "$TMP/bin/psql"
PATH="$TMP/bin:$PATH"
export PATH

run_seed() { # run_seed <descripcion> <salida-esperada> <entorno...>
  local descripcion="$1" esperado="$2"
  shift 2
  local salida
  salida="$(env "$@" bash "$SEED" 2>&1)"
  local codigo=$?

  if [[ "$codigo" -ne "$esperado" ]]; then
    falla "$descripcion (código $codigo, esperado $esperado)"
    return 1
  fi

  LAST_OUTPUT="$salida"
  pasa "$descripcion"
}

LAST_OUTPUT=''

# 1. Sin cadena de conexión.
run_seed 'sin PREVIEW_DATABASE_URL ni DATABASE_URL aborta con 78' 78 -u PREVIEW_DATABASE_URL -u DATABASE_URL
case "$LAST_OUTPUT" in
  *'falta la cadena de conexión'*) pasa 'el mensaje dice qué variable falta' ;;
  *) falla 'el mensaje no explica que falta la cadena de conexión' ;;
esac

# 2. Base cuyo nombre menciona producción.
run_seed 'una base de producción se rechaza con 78' 78 \
  PREVIEW_DATABASE_URL='postgresql://usuario:clave@host/presupuesto_production'
case "$LAST_OUTPUT" in
  *'no es una base de preview'*) pasa 'el mensaje nombra el destino rechazado' ;;
  *) falla 'el mensaje de rechazo no es el esperado' ;;
esac
case "$LAST_OUTPUT" in
  *clave*) falla 'el mensaje filtra la credencial de la cadena' ;;
  *) pasa 'el mensaje no imprime la credencial' ;;
esac

# 3. Base con nombre que no permite confirmar el destino.
run_seed 'una base sin «preview» en el nombre se rechaza con 78' 78 \
  PREVIEW_DATABASE_URL='postgresql://usuario:clave@host/cifuentes'
case "$LAST_OUTPUT" in
  *'no lleva «preview»'*) pasa 'el mensaje pide un nombre con «preview»' ;;
  *) falla 'el mensaje del destino no confirmado no es el esperado' ;;
esac

# La guarda tiene que haber parado los tres casos **antes** de llamar a psql.
if [[ -s "$STUB_LOG" ]]; then
  falla 'la guarda llamó a psql en un destino rechazado'
else
  pasa 'la guarda no llama a psql cuando rechaza el destino'
fi

# 4. Base de preview: siembra por la entrada estándar de psql.
run_seed 'una base de preview siembra con 0' 0 \
  PREVIEW_DATABASE_URL='postgresql://usuario:clave@host/presupuesto_preview?sslmode=require'
case "$LAST_OUTPUT" in
  *'sembrado en «presupuesto_preview»: 4 series publicadas, 3 tarifas publicadas'*)
    pasa 'el resumen nombra la base y los recuentos'
    ;;
  *) falla "el resumen no es el esperado: $LAST_OUTPUT" ;;
esac

if [[ -s "$STUB_SQL" ]] && grep -q 'INSERT INTO door_series' "$STUB_SQL"; then
  pasa 'el SQL de siembra llega a psql por la entrada estándar'
else
  falla 'psql no recibió el SQL de siembra'
fi

if grep -q "'ci-100', 'PUBLISHED'" "$STUB_SQL" && grep -q 'INSERT INTO tariff_version' "$STUB_SQL"; then
  pasa 'el SQL publica la serie de referencia y su tarifa'
else
  falla 'el SQL no publica la serie ci-100 con tarifa'
fi

# 5. La URL se pasa a psql tal cual (con credenciales y parámetros), nunca por un fichero temporal.
if [[ "$(head -n 1 "$STUB_LOG")" == *'--dbname=postgresql://usuario:clave@host/presupuesto_preview?sslmode=require'* ]]; then
  pasa 'psql recibe la cadena de conexión completa'
else
  falla 'psql no recibió la cadena de conexión completa'
fi

# 6. Sin cliente psql el script no puede continuar (69).
salida="$(env -i PATH="$TMP/vacio" PREVIEW_DATABASE_URL='postgresql://usuario:clave@host/presupuesto_preview' "$(command -v bash)" "$SEED" 2>&1)"
codigo=$?
if [[ "$codigo" -eq 69 ]]; then
  pasa 'sin psql en el PATH sale con 69'
else
  falla "sin psql en el PATH el código fue $codigo, esperado 69 ($salida)"
fi

if [[ "$fallos" -gt 0 ]]; then
  printf '\n%d caso(s) fallido(s)\n' "$fallos"
  exit 1
fi

echo 'todos los casos pasan'
