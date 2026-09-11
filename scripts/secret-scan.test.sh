#!/usr/bin/env bash
#
# Tests del contrato de seguridad de `scripts/secret-scan.sh` (CIF-92; ADR-0014).
#
# El contrato que se prueba es el que falló en el run c7f69293: un barrido puede inspeccionar
# credenciales, pero **no puede escribir ni el valor ni el patrón** en su salida. Todos los valores
# que se usan aquí son sintéticos y se generan en cada ejecución; ninguno es una credencial real.
#
# Uso:   scripts/secret-scan.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER="$SCRIPT_DIR/secret-scan.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -x "$SCANNER" ]]; then
  echo "no encuentro $SCANNER" >&2
  exit 69
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/scan-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"

fallos=0
ok() { printf '  ok    %s\n' "$1"; }
ko() {
  printf '  FALLO %s\n' "$1"
  fallos=$((fallos + 1))
}
comprobar() { # comprobar <descripción> <condición...>
  local descripcion="$1"
  shift
  if "$@"; then ok "$descripcion"; else ko "$descripcion"; fi
}
# Se invocan indirectamente desde `comprobar`; shellcheck no lo ve.
# shellcheck disable=SC2317
contiene() { grep -qF -- "$2" "$1"; }
# shellcheck disable=SC2317
no_contiene() { ! grep -qF -- "$2" "$1"; }

# PAT clásico de GitHub sintético: 36 caracteres alfanuméricos tras el prefijo.
fake_gh="ghp_$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' | cut -c1-36)"
fake_valor_ausente="valor-que-no-esta-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"

limpio="$TMP/limpio"
fuga="$TMP/fuga"
mkdir -p "$limpio/src" "$fuga/src"
printf 'export const saludo = "hola"\n' > "$limpio/src/limpio.ts"
printf 'const token = "%s";\n' "$fake_gh" > "$fuga/src/token-expuesto.ts"

# --- Caso 1: directorio limpio -> sin hallazgos ------------------------------
salida="$TMP/s1.txt"
codigo=0
"$SCANNER" --path "$limpio" > "$salida" 2>&1 || codigo=$?
comprobar "directorio limpio: código 0" test "$codigo" -eq 0
comprobar "directorio limpio: ni un patrón en la salida" no_contiene "$salida" 'ghp_' 

# --- Caso 2: fuga detectada, valor nunca impreso -----------------------------
salida="$TMP/s2.txt"
codigo=0
"$SCANNER" --path "$fuga" > "$salida" 2>&1 || codigo=$?
comprobar "fuga: código 1" test "$codigo" -eq 1
comprobar "fuga: localiza el fichero" contiene "$salida" 'token-expuesto.ts' 
comprobar "fuga: no imprime el valor" no_contiene "$salida" "$fake_gh"
comprobar "fuga: no imprime el patrón" no_contiene "$salida" 'ghp_' 

# --- Caso 3: --values-stdin encuentra un valor conocido sin imprimirlo -------
salida="$TMP/s3.txt"
codigo=0
printf '%s\n' "$fake_gh" | "$SCANNER" --path "$fuga" --values-stdin > "$salida" 2>&1 || codigo=$?
comprobar "valor conocido: código 1" test "$codigo" -eq 1
comprobar "valor conocido: localiza el fichero" contiene "$salida" 'token-expuesto.ts' 
comprobar "valor conocido: no imprime el valor" no_contiene "$salida" "$fake_gh"

# --- Caso 4: valor ausente -> sin hallazgos y sin eco ------------------------
salida="$TMP/s4.txt"
codigo=0
printf '%s\n' "$fake_valor_ausente" | "$SCANNER" --path "$limpio" --values-stdin > "$salida" 2>&1 || codigo=$?
comprobar "valor ausente: código 0" test "$codigo" -eq 0
comprobar "valor ausente: no imprime el valor" no_contiene "$salida" "$fake_valor_ausente"

# --- Caso 5: la lista de permitidos silencia un fichero concreto -------------
printf 'src/token-expuesto.ts\n' > "$TMP/permitidos.txt"
salida="$TMP/s5.txt"
codigo=0
"$SCANNER" --path "$fuga" --allowlist "$TMP/permitidos.txt" > "$salida" 2>&1 || codigo=$?
comprobar "lista de permitidos: código 0" test "$codigo" -eq 0
comprobar "lista de permitidos: no imprime el valor" no_contiene "$salida" "$fake_gh"

# --- Caso 6: el repositorio real (modo git) y su historial -------------------
salida="$TMP/s6.txt"
codigo=0
printf 'CATALOG_DEMO_MODE\n' | "$SCANNER" --path "$REPO_ROOT" --no-patterns --values-stdin > "$salida" 2>&1 || codigo=$?
comprobar "modo git: encuentra un valor real del repo" test "$codigo" -eq 1
comprobar "modo git: localiza la ruta" contiene "$salida" '.env.example' 
comprobar "modo git: no imprime el valor" no_contiene "$salida" 'CATALOG_DEMO_MODE' 

# --- Caso 7: los errores de uso no reproducen el argumento -------------------
salida="$TMP/s7.txt"
codigo=0
"$SCANNER" --path "$TMP/no-existe" > "$salida" 2>&1 || codigo=$?
comprobar "directorio inexistente: código 2" test "$codigo" -eq 2

salida="$TMP/s8.txt"
codigo=0
"$SCANNER" "--$fake_gh" > "$salida" 2>&1 || codigo=$?
comprobar "argumento no reconocido: código 2" test "$codigo" -eq 2
comprobar "argumento no reconocido: no reproduce el argumento" no_contiene "$salida" "$fake_gh"

# --- Caso 8: no deja ficheros temporales con valores -------------------------
restos="$(find "${TMPDIR:-/tmp}" -maxdepth 1 -name 'secret-scan.*' 2>/dev/null | wc -l | tr -d ' ')"
comprobar "sin ficheros temporales con valores" test "$restos" -eq 0

if [[ "$fallos" -eq 0 ]]; then
  echo "secret-scan.test: todos los casos en verde"
  exit 0
fi
echo "secret-scan.test: $fallos caso(s) en rojo" >&2
exit 1
