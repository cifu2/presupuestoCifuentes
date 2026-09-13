#!/usr/bin/env bash
#
# Tests de `scripts/vercel-consumo.sh` (CIF-537, ADR-0019 §6).
#
# Contrato que se prueba: la medición de consumo agrupa por clase de rama (`meta.githubCommitRef`) y
# por entorno (`target`), respeta la ventana de horas, sigue la paginación `until`, usa **solo `GET`**
# y no imprime la credencial. Se prueba contra un `curl` de mentira y fixtures locales: no se llama a
# la API de Vercel, no hace falta red y no se usa ninguna credencial real.
#
# Uso:   scripts/vercel-consumo.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDIDOR="$SCRIPT_DIR/vercel-consumo.sh"

fallos=0
pasa() { printf 'ok    %s\n' "$1"; }
falla() {
  printf 'FALLO %s\n' "$1"
  fallos=$((fallos + 1))
}

if [[ ! -f "$MEDIDOR" ]]; then
  echo "no encuentro $MEDIDOR" >&2
  exit 69
fi
for herramienta in jq curl; do
  command -v "$herramienta" >/dev/null 2>&1 || {
    echo "falta $herramienta" >&2
    exit 69
  }
done

# Instante de referencia fijo: sin esto la medición dependería del reloj y el test sería inestable.
AHORA=1700000000000
TOKEN_FALSO="token-de-prueba-no-real"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/vercel-consumo-test.XXXXXX")"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

FIXTURES="$TMP/fixtures"
BIN="$TMP/bin"
mkdir -p "$FIXTURES" "$BIN"

# --- fixtures -------------------------------------------------------------------------------------
# 8 despliegues: dos páginas, ventanas de 24 h y 72 h, ambos entornos, una rama sin referencia,
# una clase con jerarquía (`feat/**`) y uno fuera de las dos ventanas (100 h) que no debe contarse.
dep() { # dep <uid> <horas-antes> <target|""> [rama]
  local target_json='null'
  [[ -n "$3" ]] && target_json="\"$3\""
  jq -nc --arg uid "$1" --argjson created "$((AHORA - $2 * 3600000))" \
    --argjson target "$target_json" --arg rama "${4:-}" \
    '{uid: $uid, name: "presupuesto-cifuentes", created: $created, target: $target,
      state: "READY", meta: (if $rama == "" then {} else {githubCommitRef: $rama} end)}'
}

{
  printf '{"deployments":['
  dep dpl-main-a 1 production main
  printf ','
  dep dpl-main-b 2 production main
  printf ','
  dep dpl-feat 3 "" feat/cif514-tarifa-borrador
  printf ','
  dep dpl-sinref 5 ""
  printf ','
  dep dpl-fix 30 "" fix/cif525-guardia
  printf '],"pagination":{"count":5,"next":"cursor1","prev":null}}\n'
} > "$FIXTURES/pagina0.json"

{
  printf '{"deployments":['
  dep dpl-docs 50 "" docs/cif536-escalada
  printf ','
  dep dpl-qa 70 "" qa/cif525-guarda-destino-e2e
  printf ','
  dep dpl-main-viejo 100 production main
  printf '],"pagination":{"count":3,"next":null,"prev":null}}\n'
} > "$FIXTURES/pagina1.json"

printf '{"error":{"code":"forbidden"}}\n' > "$FIXTURES/sin-despliegues.json"

# --- curl de mentira -------------------------------------------------------------------------------
# Registra la invocación (método y URL, nunca la cabecera de credencial) y sirve la página que toca
# según el cursor `until`. Cualquier intento de otra cosa que no sea GET revienta.
cat > "$BIN/curl" <<'STUB'
#!/usr/bin/env bash
set -uo pipefail
registro="${CURL_STUB_REGISTRO:?falta CURL_STUB_REGISTRO}"
fixtures="${CURL_STUB_FIXTURES:?falta CURL_STUB_FIXTURES}"
modo="${CURL_STUB_MODO:-ok}"

metodo="GET"
url=""
for arg in "$@"; do
  case "$arg" in
    -X | --request | -X* | --request=*) metodo="EXPLICITO" ;;
    --data | --data-* | -d | -d* | -F | -F* | --form* | -T | --upload-file* | --json*) metodo="ESCRITURA" ;;
    http*) url="$arg" ;;
  esac
done
printf '%s %s\n' "$metodo" "$url" >> "$registro"

if [[ "$metodo" != "GET" ]]; then
  echo "stub-curl: esta medicion no puede usar '$metodo'" >&2
  exit 90
fi
if [[ "$modo" == "sin-despliegues" ]]; then
  cat "$fixtures/sin-despliegues.json"
  exit 0
fi
case "$url" in
  *until=cursor1*) cat "$fixtures/pagina1.json" ;;
  *until=*) echo "stub-curl: cursor desconocido: $url" >&2; exit 91 ;;
  *) cat "$fixtures/pagina0.json" ;;
esac
STUB
chmod 755 "$BIN/curl"

# --- utilidades del test ---------------------------------------------------------------------------
salida=""
codigo=0
ejecutar() { # ejecutar [entorno...]
  salida="$(env PATH="$BIN:$PATH" \
    CURL_STUB_REGISTRO="$TMP/registro" CURL_STUB_FIXTURES="$FIXTURES" \
    VERCEL_CONSUMO_AHORA_MS="$AHORA" "$@" bash "$MEDIDOR" 2>&1)"
  codigo=$?
}

bloque() { # bloque <horas> -> solo la tabla de esa ventana
  printf '%s\n' "$salida" | awk -v h="$1" '
    /^# ventana de / {
      dentro = (index($0, "# ventana de " h " h:") == 1)
      next
    }
    /^#/ { dentro = 0; next }
    dentro { print }
  '
}

celda() { # celda <horas> <clase> <entorno> -> "despliegues<TAB>tasa_dia"
  bloque "$1" | awk -F'\t' -v c="$2" -v e="$3" '$1 == c && $2 == e { print $3 "\t" $4 }'
}

igual() { # igual <esperado> <real> <etiqueta>
  if [[ "$1" == "$2" ]]; then
    pasa "$3"
  else
    falla "$3 (esperado '$1', obtenido '$2')"
  fi
}

echo "== medición por clase y entorno =="

: > "$TMP/registro"
ejecutar VERCEL_DEVOPS_TOKEN="$TOKEN_FALSO" VERCEL_TEAM_ID=team_de_prueba VERCEL_PROJECT_ID=prj_de_prueba

igual "0" "$codigo" "la medición termina con código 0"
igual "2" "$(printf '%s\n' "$salida" | grep -c '^clase	entorno	despliegues	tasa_dia$')" \
  "emite una tabla por ventana (24 h y 72 h)"

# Se guarda la medición en verde: los casos de fallo cerrado pisan `salida` más abajo.
SALIDA_REAL="$salida"

igual "2	2" "$(celda 24 main production)" "agrupa main/production en la ventana de 24 h (2 despliegues, 2/día)"
igual "1	1" "$(celda 24 'feat/**' preview)" "clasifica feat/** por su prefijo (1 despliegue, 1/día)"
igual "1	1" "$(celda 24 '(sin-ref)' preview)" "una rama sin meta.githubCommitRef cae en (sin-ref)"
igual "4	4" "$(celda 24 TOTAL -)" "el total de 24 h es 4 despliegues (4/día)"
igual "" "$(celda 24 'fix/**' preview)" "la ventana de 24 h deja fuera lo de hace 30 h"

igual "1	0.33" "$(celda 72 'fix/**' preview)" "la ventana de 72 h incluye lo de hace 30 h (0,33/día)"
igual "1	0.33" "$(celda 72 'docs/**' preview)" "la ventana de 72 h incluye docs/** (0,33/día)"
igual "1	0.33" "$(celda 72 'qa/**' preview)" "la ventana de 72 h incluye qa/** (0,33/día)"
igual "7	2.33" "$(celda 72 TOTAL -)" "el total de 72 h es 7 despliegues (2,33/día)"
igual "2	0.67" "$(celda 72 main production)" "main/production baja a 0,67/día al diluirse en 72 h"

inicio_24="$(jq -nr --argjson ms "$((AHORA - 24 * 3600000))" '($ms / 1000 | floor | todate)')"
inicio_72="$(jq -nr --argjson ms "$((AHORA - 72 * 3600000))" '($ms / 1000 | floor | todate)')"
if printf '%s\n' "$salida" | grep -qF "# ventana de 72 h: de $inicio_72"; then
  pasa "la cabecera declara el inicio real de la ventana de 72 h"
else
  falla "la cabecera no declara el inicio de la ventana de 72 h (se esperaba $inicio_72)"
fi
if printf '%s\n' "$salida" | grep -qF "# ventana de 24 h: de $inicio_24"; then
  pasa "la cabecera declara el inicio real de la ventana de 24 h"
else
  falla "la cabecera no declara el inicio de la ventana de 24 h (se esperaba $inicio_24)"
fi
if [[ "$(printf '%s\n' "$salida" | grep -c 'dpl-main-viejo')" -eq 0 ]]; then
  pasa "no cuenta el despliegue de hace 100 h en ninguna ventana"
else
  falla "contó el despliegue de hace 100 h, fuera de las dos ventanas"
fi
if printf '%s\n' "$salida" | grep -q '^#        del contador del limite'; then
  pasa "advierte de que el recuento es una cota inferior del contador del límite"
else
  falla "no advierte de la cota inferior del contador del límite"
fi

echo
echo "== solo GET, paginación y credencial =="

igual "2" "$(grep -c '^GET ' "$TMP/registro")" "sigue la paginación: dos GET, uno por página"
igual "0" "$(grep -vc '^GET ' "$TMP/registro")" "no emite ninguna petición que no sea GET"
if grep -q 'until=cursor1' "$TMP/registro"; then
  pasa "pagina con el cursor 'until' que devuelve la API"
else
  falla "no usó el cursor 'until' de la paginación"
fi
if printf '%s' "$salida" | grep -q "$TOKEN_FALSO"; then
  falla "la salida imprime la credencial"
else
  pasa "la salida no contiene la credencial"
fi
igual "listados=8 paginas=2" "$(printf '%s\n' "$salida" | sed -n '1s/.*\(listados=[^ ]* paginas=[^ ]*\).*/\1/p')" \
  "la cabecera resume lo listado y las páginas seguidas"

echo
echo "== fallos cerrados =="

: > "$TMP/registro"
ejecutar VERCEL_DEVOPS_TOKEN="" VERCEL_TEAM_ID=team_de_prueba VERCEL_PROJECT_ID=prj_de_prueba
igual "2" "$codigo" "sin credencial falla con código 2"
if printf '%s' "$salida" | grep -q 'VERCEL_DEVOPS_TOKEN'; then
  pasa "el fallo nombra la variable que falta"
else
  falla "el fallo no nombra VERCEL_DEVOPS_TOKEN"
fi
igual "0" "$(grep -c '^GET ' "$TMP/registro")" "sin credencial no llega a hacer la petición"

ejecutar VERCEL_DEVOPS_TOKEN="$TOKEN_FALSO" VERCEL_TEAM_ID=team_de_prueba VERCEL_PROJECT_ID=prj_de_prueba \
  VERCEL_CONSUMO_VENTANAS="veinticuatro"
igual "2" "$codigo" "una ventana que no es un número de horas falla con código 2"

salida="$(env PATH="$BIN:$PATH" CURL_STUB_REGISTRO="$TMP/registro" CURL_STUB_FIXTURES="$FIXTURES" \
  CURL_STUB_MODO=sin-despliegues VERCEL_CONSUMO_AHORA_MS="$AHORA" \
  VERCEL_DEVOPS_TOKEN="$TOKEN_FALSO" VERCEL_TEAM_ID=team_de_prueba VERCEL_PROJECT_ID=prj_de_prueba \
  bash "$MEDIDOR" 2>&1)"
codigo=$?
igual "3" "$codigo" "una respuesta sin lista de despliegues falla con código 3"

echo
echo "== mutación: el agrupado por entorno tiene que morder =="

# Mutante: los despliegues de `target: production` dejan de contarse como producción.
MUTANTE="$TMP/vercel-consumo-mutante.sh"
sed 's#"production" then "production"#"production" then "preview"#' "$MEDIDOR" > "$MUTANTE"
if ! grep -qF '"production" then "production"' "$MUTANTE"; then
  pasa "el mutante neutraliza la clasificación por entorno"
else
  falla "no se pudo construir el mutante (revisar el sed)"
fi
salida_mutante="$(env PATH="$BIN:$PATH" CURL_STUB_REGISTRO="$TMP/registro" CURL_STUB_FIXTURES="$FIXTURES" \
  VERCEL_CONSUMO_AHORA_MS="$AHORA" VERCEL_DEVOPS_TOKEN="$TOKEN_FALSO" VERCEL_TEAM_ID=team_de_prueba \
  VERCEL_PROJECT_ID=prj_de_prueba bash "$MUTANTE" 2>&1)"
salida="$SALIDA_REAL"
real_main="$(celda 24 main production)"
salida="$salida_mutante"
mutante_main="$(celda 24 main production)"
if [[ -z "$mutante_main" && "$real_main" == "2	2" ]]; then
  pasa "el test mata la mutación: el mutante pierde main/production y el medidor real lo conserva"
else
  falla "mutación no matada (mutante='$mutante_main', real='$real_main')"
fi

echo
if [[ "$fallos" -eq 0 ]]; then
  echo "Todo correcto."
  exit 0
fi
echo "Fallos: $fallos"
exit 1
