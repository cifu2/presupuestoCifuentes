#!/usr/bin/env bash
#
# Guardia de contenido de las ramas `docs/**` (ADR-0019, CIF-155).
#
# `vercel.json` apaga el preview de las ramas `docs/**` para no gastar cuota de despliegues. Eso solo
# es seguro si una rama `docs/**` no puede colar cambios de código que se quedarían sin preview, así
# que esta guardia falla cuando el diff de la rama toca algo fuera de `docs/**` y de `**/*.md`.
#
# Entradas (las rellena GitHub Actions en un evento `pull_request`; también se pueden pasar a mano):
#   GITHUB_HEAD_REF  rama del PR (vacía en un push a `main`)
#   GITHUB_BASE_REF  rama base del PR (por defecto `main`)
#
# Uso:   GITHUB_HEAD_REF=docs/x GITHUB_BASE_REF=main scripts/docs-preview-guard.sh
# Salida: 0 si la rama puede prescindir del preview, 1 si toca código, 2 si no se puede comparar.
set -uo pipefail

branch="${GITHUB_HEAD_REF:-}"
base_ref="${GITHUB_BASE_REF:-main}"

if [[ -z "$branch" ]]; then
  echo "INFO docs-preview-guard: sin GITHUB_HEAD_REF (push a main, no es un PR): nada que comprobar."
  exit 0
fi

if [[ "$branch" != docs/* ]]; then
  echo "OK docs-preview-guard: la rama '$branch' no es docs/**; conserva su preview de Vercel."
  exit 0
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR docs-preview-guard: no estamos dentro de un repositorio git." >&2
  exit 2
fi

base=""
for candidate in "origin/$base_ref" "$base_ref"; do
  if git rev-parse --verify --quiet "$candidate^{commit}" >/dev/null 2>&1; then
    base="$candidate"
    break
  fi
done

if [[ -z "$base" ]]; then
  echo "ERROR docs-preview-guard: no encuentro la rama base '$base_ref' (ni 'origin/$base_ref')." >&2
  echo "       El checkout de CI necesita 'fetch-depth: 0' para tener la base del PR." >&2
  exit 2
fi

if ! merge_base="$(git merge-base "$base" HEAD)"; then
  echo "ERROR docs-preview-guard: no hay base común entre '$base' y HEAD." >&2
  exit 2
fi

# `-z` entrega las rutas tal cual (separadas por NUL, sin citar): con el citado por defecto de git
# (`core.quotePath`), un fichero como `docs/diseño.md` llegaría como `"docs/dise\303\261o.md"` y la
# guardia lo marcaría como violación. `-z` evita además cualquier problema con espacios o saltos.
changed=()
while IFS= read -r -d '' file; do
  changed+=("$file")
done < <(git diff --name-only -z --no-renames "$merge_base" HEAD)

violations=()
if ((${#changed[@]} > 0)); then
  for file in "${changed[@]}"; do
    case "$file" in docs/* | *.md) ;; *) violations+=("$file") ;; esac
  done
fi

if ((${#violations[@]} == 0)); then
  echo "OK docs-preview-guard: la rama '$branch' solo toca docs/** y *.md; puede ir sin preview."
  exit 0
fi

echo "VIOLACION docs-preview-guard: la rama '$branch' no recibe preview de Vercel (vercel.json)," >&2
echo "pero su diff contra '$base' toca ficheros fuera de docs/** y **/*.md:" >&2
for file in "${violations[@]}"; do
  echo "  - $file" >&2
done
echo >&2
echo "Renombra la rama a feat/**, fix/**, ci/** o chore/** para recuperar el preview," >&2
echo "o mueve esos cambios a otra rama: un cambio de codigo no puede viajar en docs/**." >&2
exit 1
