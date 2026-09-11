#!/usr/bin/env bash
#
# Crea el repositorio en GitHub, sube `main` y deja `main` protegida con la puerta de calidad.
# Procedimiento: docs/despliegue.md, apartado 6.
#
# Uso:   scripts/github-bootstrap.sh <org>/<repo>
#        REPO_VISIBILITY=private scripts/github-bootstrap.sh cifucorp/presupuestos
#        REPO_REQUIRED_APPROVALS=1 scripts/github-bootstrap.sh cifucorp/presupuestos
#
# Visibilidad: **pública** por defecto (decisión del propietario; docs/despliegue.md, apartado 6.1).
# Revisiones obligatorias: **ninguna** por defecto. Mientras el autor del PR y el dueño del token
# sean la misma cuenta de GitHub, exigir aprobaciones bloquearía todas las fusiones; cuando exista un
# segundo colaborador, `REPO_REQUIRED_APPROVALS=1` vuelve a activarlas (docs/despliegue.md, 2.2).
#
# Credenciales: `gh auth login`, o las variables GH_TOKEN / GITHUB_DEVOPS_TOKEN (secreto de
# Paperclip). El token no se imprime ni se guarda. Necesita el alcance `workflow` para poder subir
# .github/workflows/: un PAT clásico con solo `repo` rechaza el push entero y el error de git no lo
# explica.
set -euo pipefail

# El secreto de Paperclip llega como GITHUB_DEVOPS_TOKEN; se respeta el nombre corto si ya existe.
export GH_TOKEN="${GH_TOKEN:-${GITHUB_DEVOPS_TOKEN:-}}"

REPO="${1:-}"
VISIBILITY="${REPO_VISIBILITY:-public}"
REQUIRED_APPROVALS="${REPO_REQUIRED_APPROVALS:-0}"

if [[ -z "$REPO" || "$REPO" != */* ]]; then
  echo "uso: $0 <org>/<repo>" >&2
  exit 64
fi

if [[ ! "$REQUIRED_APPROVALS" =~ ^[0-9]+$ ]]; then
  echo "REPO_REQUIRED_APPROVALS debe ser un entero >= 0" >&2
  exit 64
fi

command -v git >/dev/null 2>&1 || { echo "falta git" >&2; exit 69; }
command -v gh >/dev/null 2>&1 || {
  echo "falta la CLI de GitHub (gh). Instálala y autentícate antes de seguir." >&2
  exit 69
}
gh auth status >/dev/null 2>&1 || {
  echo "gh no está autenticado. Ejecuta 'gh auth login' o define GH_TOKEN / GITHUB_DEVOPS_TOKEN." >&2
  exit 69
}

# Aviso temprano del alcance. Los PAT finos no anuncian alcances: solo se comprueba si hay cabecera.
scopes="$(gh api -i user 2>/dev/null | tr -d '\r' | awk 'tolower($1) == "x-oauth-scopes:" { $1 = ""; print }' || true)"
if [[ -n "$scopes" && "$scopes" != *workflow* ]]; then
  echo "el token no tiene el alcance 'workflow': no se puede subir .github/workflows/." >&2
  echo "Añádelo en GitHub (Settings -> Developer settings -> Tokens) y actualiza el secreto." >&2
  exit 77
fi

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
# gh actúa como ayudante de credenciales: el push usa el token del entorno sin guardarlo en disco.
git -c credential.helper= -c credential.helper='!gh auth git-credential' push -u origin main

echo "== 3/4 ajustes del repositorio (auto-merge, borrado de rama al fusionar)"
gh api -X PATCH "repos/${REPO}" \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F has_issues=true \
  -F has_wiki=false >/dev/null

# El payload de protección debe reproducir el estado verificado de `main`: con 0 aprobaciones se
# envía `null` (sin revisiones obligatorias); con REPO_REQUIRED_APPROVALS>0 se exigen esas
# aprobaciones. Todo lo demás es idéntico en ambos casos.
if (( REQUIRED_APPROVALS > 0 )); then
  reviews_json="{
    \"dismiss_stale_reviews\": true,
    \"require_code_owner_reviews\": false,
    \"required_approving_review_count\": ${REQUIRED_APPROVALS}
  }"
else
  reviews_json="null"
fi

echo "== 4/4 protección de main (checks requeridos: calidad y e2e; aprobaciones: ${REQUIRED_APPROVALS})"
gh api -X PUT "repos/${REPO}/branches/main/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "calidad (formato · lint · tipos · unitarios)",
      "e2e (puerta obligatoria)"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": ${reviews_json},
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
