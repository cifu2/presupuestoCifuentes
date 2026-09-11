#!/usr/bin/env bash
#
# Crea el repositorio en GitHub, sube `main` y deja `main` protegida con la puerta de calidad.
# Procedimiento: docs/despliegue.md, apartado 6.
#
# Uso:   scripts/github-bootstrap.sh <org>/<repo>
#        REPO_VISIBILITY=private scripts/github-bootstrap.sh cifucorp/presupuestos
#
# Credenciales: usa `gh auth login` o la variable GH_TOKEN. El token no se imprime ni se guarda.
set -euo pipefail

REPO="${1:-}"
VISIBILITY="${REPO_VISIBILITY:-private}"

if [[ -z "$REPO" || "$REPO" != */* ]]; then
  echo "uso: $0 <org>/<repo>" >&2
  exit 64
fi

command -v git >/dev/null 2>&1 || { echo "falta git" >&2; exit 69; }
command -v gh >/dev/null 2>&1 || {
  echo "falta la CLI de GitHub (gh). Instálala y autentícate antes de seguir." >&2
  exit 69
}
gh auth status >/dev/null 2>&1 || {
  echo "gh no está autenticado. Ejecuta 'gh auth login' o exporta GH_TOKEN." >&2
  exit 69
}

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "== 1/4 repositorio"
if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "   $REPO ya existe"
else
  gh repo create "$REPO" "--${VISIBILITY}" --disable-wiki \
    --description 'Software de presupuestos a medida para Puertas Cifuentes (MVP)'
fi

echo "== 2/4 remoto origin y push de main"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/${REPO}.git"
else
  git remote add origin "https://github.com/${REPO}.git"
fi
git push -u origin main

echo "== 3/4 ajustes del repositorio (auto-merge, borrado de rama al fusionar)"
gh api -X PATCH "repos/${REPO}" \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F has_issues=true \
  -F has_wiki=false >/dev/null

echo "== 4/4 protección de main (checks requeridos: calidad y e2e)"
gh api -X PUT "repos/${REPO}/branches/main/protection" --input - >/dev/null <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "calidad (formato · lint · tipos · unitarios)",
      "e2e (puerta obligatoria)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# Las alertas de vulnerabilidad no están disponibles en todos los planes: no bloquean la puesta a punto.
gh api -X PUT "repos/${REPO}/vulnerability-alerts" >/dev/null 2>&1 || \
  echo "   aviso: no se pudieron activar las alertas de vulnerabilidad (plan o permisos)"

echo "listo: https://github.com/${REPO}"
