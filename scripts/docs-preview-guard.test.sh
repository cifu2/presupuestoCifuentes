#!/usr/bin/env bash
#
# Tests de `scripts/docs-preview-guard.sh` (CIF-155, ADR-0019).
#
# Contrato que se prueba: una rama `docs/**` puede prescindir del preview de Vercel (`vercel.json`)
# **solo** si su diff contra la base toca exclusivamente `docs/**` y ficheros `*.md`. La guardia tiene
# que morder cuando se cuela código, nombrar el fichero y decir cómo recuperar el preview.
#
# Todo se ejecuta sobre un repositorio git efímero en un directorio temporal: no se toca el
# repositorio real, no se llama a ninguna API y no se usa ninguna credencial.
#
# Uso:   scripts/docs-preview-guard.test.sh
# Salida: una línea por caso. Código 0 si todo pasa, 1 si algo falla.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="$SCRIPT_DIR/docs-preview-guard.sh"

fallos=0
pasa() { printf 'ok    %s\n' "$1"; }
falla() {
  printf 'FALLO %s\n' "$1"
  fallos=$((fallos + 1))
}

if [[ ! -f "$GUARD" ]]; then
  echo "no encuentro $GUARD" >&2
  exit 69
fi
command -v git >/dev/null 2>&1 || {
  echo "falta git" >&2
  exit 69
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/docs-guard-test.XXXXXX")"
chmod 700 "$TMP"
CASE_DIR="$TMP/casos"
mkdir -p "$CASE_DIR"
trap 'rm -rf "$TMP"' EXIT

REPO="$TMP/repo"
git init -q --initial-branch=main "$REPO"
git -C "$REPO" config user.email "guardia@test.invalid"
git -C "$REPO" config user.name "Guardia de preview"
git -C "$REPO" config commit.gpgsign false
mkdir -p "$REPO/docs/adr" "$REPO/src" "$REPO/.github/workflows"
printf 'base\n' > "$REPO/README.md"
printf 'base\n' > "$REPO/docs/guia.md"
printf 'base\n' > "$REPO/src/app.ts"
printf 'base\n' > "$REPO/.github/workflows/ci.yml"
printf '{}\n' > "$REPO/vercel.json"
git -C "$REPO" add -A
git -C "$REPO" commit -qm "base"
BASE="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" update-ref refs/remotes/origin/main "$BASE"

preparar_rama() { # preparar_rama <rama>
  git -C "$REPO" checkout -qf main
  git -C "$REPO" checkout -qf -B "$1" main
}

commit_cambio() { # commit_cambio <fichero> <contenido>
  printf '%s\n' "$2" > "$REPO/$1"
  git -C "$REPO" add -- "$1"
  git -C "$REPO" commit -qm "cambio en $1"
}

ejecutar_guardia() { # ejecutar_guardia <rama> -> código; salida en $CASE_DIR/salida
  (cd "$REPO" && GITHUB_HEAD_REF="$1" GITHUB_BASE_REF=main bash "$GUARD") > "$CASE_DIR/salida" 2>&1
}

echo "== ramas que conservan preview =="

# Caso 1: una rama con código no entra en la guardia (conserva su preview).
preparar_rama ci/cif155-prueba
commit_cambio src/app.ts "codigo"
if ejecutar_guardia ci/cif155-prueba; then
  pasa "una rama ci/** con cambio de codigo no es asunto de la guardia (codigo 0)"
else
  falla "la guardia bloqueo una rama ci/** con cambio de codigo"
fi

# Caso 2: push a main (sin GITHUB_HEAD_REF) -> no hay nada que comprobar.
if ejecutar_guardia ""; then
  pasa "sin GITHUB_HEAD_REF (push a main) la guardia sale con codigo 0"
else
  falla "la guardia fallo sin GITHUB_HEAD_REF"
fi

# Caso 3: docs/** que solo toca docs/**.
preparar_rama docs/cif155-solo-docs
commit_cambio docs/adr/0020-prueba.md "adr"
if ejecutar_guardia docs/cif155-solo-docs; then
  pasa "una rama docs/** que solo toca docs/** pasa (codigo 0)"
else
  falla "la guardia bloqueo una rama docs/** que solo toca docs/**"
fi

# Caso 4: docs/** que toca un Markdown fuera de docs/** (permitido por **/*.md).
preparar_rama docs/cif155-readme
commit_cambio README.md "readme"
if ejecutar_guardia docs/cif155-readme; then
  pasa "una rama docs/** puede tocar Markdown fuera de docs/** (codigo 0)"
else
  falla "la guardia bloqueo un .md fuera de docs/**"
fi

# Caso 5: docs/** sin cambios.
preparar_rama docs/cif155-sin-cambios
if ejecutar_guardia docs/cif155-sin-cambios; then
  pasa "una rama docs/** sin cambios pasa (codigo 0)"
else
  falla "la guardia fallo en una rama docs/** sin cambios"
fi

echo
echo "== ramas docs/** que tienen que morder =="

# Caso 6: docs/** que cuela código de la aplicación.
preparar_rama docs/cif155-cola-codigo
commit_cambio src/app.ts "codigo colado"
if ejecutar_guardia docs/cif155-cola-codigo; then
  falla "la guardia acepto una rama docs/** que toca src/app.ts"
else
  pasa "una rama docs/** que toca src/app.ts se bloquea (codigo 1)"
fi
if grep -q 'src/app.ts' "$CASE_DIR/salida"; then
  pasa "el mensaje nombra el fichero que rompe el contrato"
else
  falla "el mensaje no nombra src/app.ts"
fi
if grep -q 'Renombra la rama' "$CASE_DIR/salida"; then
  pasa "el mensaje dice como recuperar el preview (renombrar la rama)"
else
  falla "el mensaje no indica renombrar la rama"
fi

# Caso 7: docs/** que toca un workflow de CI.
preparar_rama docs/cif155-cola-workflow
commit_cambio .github/workflows/ci.yml "workflow"
if ejecutar_guardia docs/cif155-cola-workflow; then
  falla "la guardia acepto una rama docs/** que toca .github/"
else
  pasa "una rama docs/** que toca .github/ se bloquea (codigo 1)"
fi

# Caso 8: docs/** que toca configuración de la raíz.
preparar_rama docs/cif155-cola-vercel
commit_cambio vercel.json '{"git":{}}'
if ejecutar_guardia docs/cif155-cola-vercel; then
  falla "la guardia acepto una rama docs/** que toca vercel.json"
else
  pasa "una rama docs/** que toca vercel.json se bloquea (codigo 1)"
fi

echo
echo "== mutacion: la guardia tiene que morder =="

# Mutante: la misma guardia con la lista de rutas permitidas neutralizada (`docs/* | *.md` -> `*`).
MUTANTE="$TMP/docs-preview-guard-mutante.sh"
sed 's#docs/\* | \*.md)#*)#' "$GUARD" > "$MUTANTE"
if ! grep -qF 'docs/* | *.md)' "$MUTANTE"; then
  pasa "el mutante neutraliza la comprobacion de contenido"
else
  falla "no se pudo construir el mutante (revisar el sed)"
fi

preparar_rama docs/cif155-mutante
commit_cambio src/app.ts "codigo colado"
(cd "$REPO" && GITHUB_HEAD_REF=docs/cif155-mutante GITHUB_BASE_REF=main bash "$MUTANTE") > "$CASE_DIR/salida-mutante" 2>&1
codigo_mutante=$?
(cd "$REPO" && GITHUB_HEAD_REF=docs/cif155-mutante GITHUB_BASE_REF=main bash "$GUARD") > /dev/null 2>&1
codigo_real=$?
if [[ "$codigo_mutante" -eq 0 && "$codigo_real" -eq 1 ]]; then
  pasa "el test mata la mutacion: el mutante acepta (0) y la guardia real bloquea (1)"
else
  falla "mutacion no matada (mutante=$codigo_mutante, guardia=$codigo_real)"
fi

echo
if [[ "$fallos" -eq 0 ]]; then
  echo "Todo correcto."
  exit 0
fi
echo "Fallos: $fallos"
exit 1
