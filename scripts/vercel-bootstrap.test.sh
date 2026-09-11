#!/usr/bin/env bash
#
# Tests de `scripts/vercel-bootstrap.sh` (CIF-113; ADR-0015 §4).
#
# Comprueba que `DATABASE_URL` es configuración por entorno y que no puede volver a compartirse
# entre _Production_, _Preview_ y _Development_: cada sufijo inyecta `DATABASE_URL` solo en su
# entorno y con `--sensitive`, un `DATABASE_URL` sin sufijo aborta sin tocar Vercel y el resto de
# variables siguen inyectándose en los tres entornos.
#
# La CLI `vercel` se sustituye por una de mentira en PATH que registra solo los argumentos (nunca los
# valores, que llegan por stdin). Todos los valores de este fichero son sintéticos: no hay
# credenciales reales ni llamadas a Vercel o a Neon.
#
# Uso:   scripts/vercel-bootstrap.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/vercel-bootstrap.sh"

if [[ ! -x "$BOOTSTRAP" ]]; then
  echo "no encuentro $BOOTSTRAP" >&2
  exit 69
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/vercel-bootstrap-test.XXXXXX")"
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
# shellcheck disable=SC2317
lineas() { wc -l < "$1" | tr -d '[:space:]'; }

# --- CLI de Vercel de mentira -------------------------------------------------
# Registra cada invocación (solo argumentos, separados por espacios) y descarta la entrada estándar:
# el valor de cada variable viaja por stdin y no puede acabar en el registro.
FAKE_BIN="$TMP/bin"
LOG="$TMP/vercel.log"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/vercel" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'call'
  for argument in "$@"; do printf ' %s' "$argument"; done
  printf '\n'
} >> "$FAKE_VERCEL_LOG"
# Consume los valores que llegan por stdin sin escribirlos en ningún sitio.
while IFS= read -r descartado || [[ -n "$descartado" ]]; do :; done
FAKE
chmod +x "$FAKE_BIN/vercel"

# Directorio de trabajo con el proyecto ya enlazado: así el script no llama a `vercel link` y el
# registro contiene solo las inyecciones.
TRABAJO="$TMP/trabajo"
mkdir -p "$TRABAJO/.vercel"
printf '{}\n' > "$TRABAJO/.vercel/project.json"

lanzar() { # lanzar <fichero-de-valores> <fichero-de-salida>
  : > "$LOG"
  ( cd "$TRABAJO" && PATH="$FAKE_BIN:$PATH" FAKE_VERCEL_LOG="$LOG" \
      "$BOOTSTRAP" "$1" > "$2" 2>&1 </dev/null )
}

# --- Caso 1: DATABASE_URL sin sufijo -> aborta sin tocar Vercel ---------------
# Va en la última línea a propósito: el fallo debe ser anterior a cualquier escritura, no puede
# inyectar las variables que ya ha leído.
valores="$TMP/caso1.env"
cat > "$valores" <<'ENV'
NEXT_PUBLIC_SITE_URL=https://ejemplo.invalid
DATABASE_URL=postgresql://sintetico-sin-sufijo@ejemplo.invalid/base
ENV
salida="$TMP/caso1.txt"
codigo=0
lanzar "$valores" "$salida" || codigo=$?
comprobar "DATABASE_URL sin sufijo: el script falla" test "$codigo" -ne 0
comprobar "DATABASE_URL sin sufijo: ninguna llamada a Vercel" test ! -s "$LOG"
comprobar "DATABASE_URL sin sufijo: nombra el sufijo que falta" contiene "$salida" 'DATABASE_URL__PRODUCTION'
comprobar "DATABASE_URL sin sufijo: no imprime el valor" no_contiene "$salida" 'sintetico-sin-sufijo'

# --- Caso 2: cada sufijo -> DATABASE_URL solo en su entorno y --sensitive ----
for caso in 'PRODUCTION production' 'PREVIEW preview' 'DEVELOPMENT development'; do
  sufijo="${caso%% *}"
  entorno="${caso##* }"
  valores="$TMP/caso2-$entorno.env"
  printf 'DATABASE_URL__%s=postgresql://sintetico-%s@ejemplo.invalid/base\n' "$sufijo" "$entorno" > "$valores"
  salida="$TMP/caso2-$entorno.txt"
  codigo=0
  lanzar "$valores" "$salida" || codigo=$?
  comprobar "DATABASE_URL__$sufijo: el script termina bien" test "$codigo" -eq 0
  comprobar "DATABASE_URL__$sufijo: una sola inyección" test "$(lineas "$LOG")" -eq 1
  comprobar "DATABASE_URL__$sufijo: inyecta DATABASE_URL con --sensitive en $entorno" \
    contiene "$LOG" "call env add DATABASE_URL $entorno --sensitive --force"
  comprobar "DATABASE_URL__$sufijo: no se imprime el valor" no_contiene "$salida" "sintetico-$entorno"
done

# --- Caso 3: variable normal -> los tres entornos ----------------------------
valores="$TMP/caso3.env"
cat > "$valores" <<'ENV'
# Un comentario y una línea en blanco no cuentan como variables.

NEXT_PUBLIC_SITE_URL=https://ejemplo.invalid
ADMIN_API_TOKEN=sintetico-no-es-un-token
ENV
salida="$TMP/caso3.txt"
codigo=0
lanzar "$valores" "$salida" || codigo=$?
comprobar "variable normal: el script termina bien" test "$codigo" -eq 0
comprobar "variable normal: seis inyecciones (2 x 3 entornos)" test "$(lineas "$LOG")" -eq 6
for entorno in production preview development; do
  comprobar "NEXT_PUBLIC_SITE_URL: $entorno sin --sensitive" \
    contiene "$LOG" "call env add NEXT_PUBLIC_SITE_URL $entorno --force"
  comprobar "ADMIN_API_TOKEN: $entorno con --sensitive" \
    contiene "$LOG" "call env add ADMIN_API_TOKEN $entorno --sensitive --force"
done

# --- Caso 4: sufijo desconocido -> aborta sin tocar Vercel -------------------
valores="$TMP/caso4.env"
printf 'DATABASE_URL__STAGING=postgresql://sintetico-staging@ejemplo.invalid/base\n' > "$valores"
salida="$TMP/caso4.txt"
codigo=0
lanzar "$valores" "$salida" || codigo=$?
comprobar "sufijo desconocido: el script falla" test "$codigo" -ne 0
comprobar "sufijo desconocido: ninguna llamada a Vercel" test ! -s "$LOG"
comprobar "sufijo desconocido: explica los sufijos válidos" contiene "$salida" 'DATABASE_URL__DEVELOPMENT'

# --- Caso 5: línea sin KEY=VALOR -> aborta sin imprimir el contenido ---------
# Simula una credencial pegada por error sin `=`: no puede acabar en la salida del script.
valores="$TMP/caso5.env"
printf 'sinteticoCredencialPegadaSinFormato\n' > "$valores"
salida="$TMP/caso5.txt"
codigo=0
lanzar "$valores" "$salida" || codigo=$?
comprobar "línea sin KEY=VALOR: el script falla" test "$codigo" -ne 0
comprobar "línea sin KEY=VALOR: ninguna llamada a Vercel" test ! -s "$LOG"
comprobar "línea sin KEY=VALOR: no imprime el contenido" no_contiene "$salida" 'sinteticoCredencialPegadaSinFormato'

# --- Caso 6: sufijo y variable normal en el mismo fichero --------------------
valores="$TMP/caso6.env"
cat > "$valores" <<'ENV'
NEXT_PUBLIC_SITE_URL=https://ejemplo.invalid
DATABASE_URL__PREVIEW=postgresql://sintetico-preview@ejemplo.invalid/base
ENV
salida="$TMP/caso6.txt"
codigo=0
lanzar "$valores" "$salida" || codigo=$?
comprobar "mezcla: el script termina bien" test "$codigo" -eq 0
comprobar "mezcla: cuatro inyecciones (3 + 1)" test "$(lineas "$LOG")" -eq 4
comprobar "mezcla: DATABASE_URL solo en preview" \
  contiene "$LOG" "call env add DATABASE_URL preview --sensitive --force"
comprobar "mezcla: DATABASE_URL no va a producción" no_contiene "$LOG" "call env add DATABASE_URL production"
comprobar "mezcla: DATABASE_URL no va a desarrollo" no_contiene "$LOG" "call env add DATABASE_URL development"
comprobar "mezcla: NEXT_PUBLIC_SITE_URL sigue en los tres entornos" \
  test "$(grep -cF 'call env add NEXT_PUBLIC_SITE_URL' "$LOG")" -eq 3

# --- Caso 7: la familia DATABASE_URL__* se reconoce sin importar mayúsculas ---
# `database_url__production` no puede colarse como variable normal en los tres entornos, y el nombre
# inyectado es el canónico `DATABASE_URL`.
valores="$TMP/caso7.env"
printf 'database_url__production=postgresql://sintetico-produccion@ejemplo.invalid/base\n' > "$valores"
salida="$TMP/caso7.txt"
codigo=0
lanzar "$valores" "$salida" || codigo=$?
comprobar "minúsculas con sufijo: el script termina bien" test "$codigo" -eq 0
comprobar "minúsculas con sufijo: una sola inyección" test "$(lineas "$LOG")" -eq 1
comprobar "minúsculas con sufijo: inyecta DATABASE_URL --sensitive en production" \
  contiene "$LOG" "call env add DATABASE_URL production --sensitive --force"
comprobar "minúsculas con sufijo: no inyecta el nombre literal" \
  no_contiene "$LOG" "database_url__production"
comprobar "minúsculas con sufijo: no se imprime el valor" no_contiene "$salida" 'sintetico-produccion'

# --- Caso 8: DATABASE_URL en minúsculas y sin sufijo -> aborta igual ----------
valores="$TMP/caso8.env"
printf 'database_url=postgresql://sintetico-minusculas@ejemplo.invalid/base\n' > "$valores"
salida="$TMP/caso8.txt"
codigo=0
lanzar "$valores" "$salida" || codigo=$?
comprobar "minúsculas sin sufijo: el script falla" test "$codigo" -ne 0
comprobar "minúsculas sin sufijo: ninguna llamada a Vercel" test ! -s "$LOG"
comprobar "minúsculas sin sufijo: nombra el sufijo que falta" contiene "$salida" 'DATABASE_URL__PRODUCTION'
comprobar "minúsculas sin sufijo: no imprime el valor" no_contiene "$salida" 'sintetico-minusculas'

# --- Resultado ---------------------------------------------------------------
echo
if [[ "$fallos" -gt 0 ]]; then
  echo "vercel-bootstrap.test: $fallos comprobación(es) fallida(s)"
  exit 1
fi
echo "vercel-bootstrap.test: todas las comprobaciones pasan"
