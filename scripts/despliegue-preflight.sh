#!/usr/bin/env bash
#
# Comprobación de solo lectura de la puesta en marcha del despliegue (CIF-11, docs/despliegue.md 6).
#
# No crea, no modifica ni borra nada y no imprime ningún valor secreto: solo metadatos (usuario,
# repositorio, proyecto, nombres de variables). Funciona sin las CLI de GitHub y de Vercel, así que
# sirve también dentro del entorno del agente; aquí no hay ninguna credencial en texto claro.
#
# Credenciales por entorno, con el nombre corto o el del secreto de Paperclip:
#   GH_TOKEN | GITHUB_DEVOPS_TOKEN
#   VERCEL_TOKEN | VERCEL_DEVOPS_TOKEN
#   PRODUCTION_DATABASE_URL | NEON_PRODUCTION_DATABASE_URL
#
# Uso:    scripts/despliegue-preflight.sh
# Salida: informe en texto. Código 0 si todo está listo, 1 si queda algo pendiente.
set -uo pipefail

REPO="${REPO:-cifu2/presupuestoCifuentes}"
VERCEL_PROJECT="${VERCEL_PROJECT:-presupuesto-cifuentes}"
VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-team_EVTEUDmv7ZCk4Aas3NA5EjTF}"

GH_TOKEN_RESOLVED="${GH_TOKEN:-${GITHUB_DEVOPS_TOKEN:-}}"
VERCEL_TOKEN_RESOLVED="${VERCEL_TOKEN:-${VERCEL_DEVOPS_TOKEN:-}}"
DB_URL="${PRODUCTION_DATABASE_URL:-${NEON_PRODUCTION_DATABASE_URL:-}}"

pending=0
ok() { printf '  OK        %s\n' "$1"; }
ko() { printf '  PENDIENTE %s\n' "$1"; pending=1; }

command -v curl >/dev/null 2>&1 || { echo "falta curl" >&2; exit 69; }
command -v python3 >/dev/null 2>&1 || { echo "falta python3" >&2; exit 69; }

TMP="$(mktemp -d)"
trap 'find "$TMP" -type f -delete 2>/dev/null; rmdir "$TMP" 2>/dev/null' EXIT

api() { # api <url> <token> <fichero-salida>  -> imprime el código HTTP
  curl -sS -o "$3" -w '%{http_code}' -H "Authorization: Bearer $2" -H 'Accept: application/json' "$1" 2>/dev/null
}

field() { # field <fichero-json> <clave>
  python3 -c 'import json,sys
try: d = json.load(open(sys.argv[1]))
except Exception: print(""); raise SystemExit
v = d.get(sys.argv[2])
print(v if isinstance(v, (str, int, bool)) else ("" if v is None else json.dumps(v, ensure_ascii=False)))' "$1" "$2"
}

echo "== 1/6 GitHub: token"
if [[ -z "$GH_TOKEN_RESOLVED" ]]; then
  ko "no hay GH_TOKEN ni GITHUB_DEVOPS_TOKEN en el entorno"
else
  code="$(curl -sS -D "$TMP/gh.h" -o "$TMP/gh.json" -w '%{http_code}' \
    -H "Authorization: Bearer $GH_TOKEN_RESOLVED" -H 'Accept: application/vnd.github+json' \
    https://api.github.com/user 2>/dev/null)"
  if [[ "$code" == "200" ]]; then
    ok "token válido (usuario $(field "$TMP/gh.json" login))"
    scopes="$(tr -d '\r' < "$TMP/gh.h" | awk 'tolower($1) == "x-oauth-scopes:" { $1 = ""; print }')"
    if [[ -n "$scopes" ]]; then
      if [[ "$scopes" == *workflow* ]]; then
        ok "alcances del token:$scopes"
      else
        ko "el token no tiene el alcance 'workflow': no se podrá subir .github/workflows/ (push rechazado)"
      fi
    else
      echo "  INFO      PAT fino (sin cabecera de alcances): verifica a mano 'workflows: write'"
    fi
  else
    ko "el token de GitHub no responde 200 (HTTP $code)"
  fi
fi

echo "== 2/6 GitHub: repositorio $REPO"
if [[ -z "$GH_TOKEN_RESOLVED" ]]; then
  ko "sin token no se puede comprobar el repositorio"
else
  code="$(api "https://api.github.com/repos/$REPO" "$GH_TOKEN_RESOLVED" "$TMP/repo.json")"
  if [[ "$code" == "200" ]]; then
    ok "existe (privado=$(field "$TMP/repo.json" private), rama por defecto=$(field "$TMP/repo.json" default_branch))"
    admin="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("permissions",{}).get("admin"))' "$TMP/repo.json")"
    [[ "$admin" == "True" ]] && ok "el token tiene administración (puede aplicar la protección de main)" \
                             || ko "el token no es administrador del repositorio: no podrá proteger main"
  else
    ko "no accesible con este token (HTTP $code)"
  fi
fi

echo "== 3/6 GitHub: protección de main"
if [[ -n "$GH_TOKEN_RESOLVED" ]]; then
  code="$(api "https://api.github.com/repos/$REPO/branches/main/protection" "$GH_TOKEN_RESOLVED" "$TMP/prot.json")"
  if [[ "$code" == "200" ]]; then
    checks="$(python3 -c 'import json,sys;print(", ".join(json.load(open(sys.argv[1])).get("required_status_checks",{}).get("contexts",[])))' "$TMP/prot.json")"
    ok "activa; checks requeridos: ${checks:-ninguno}"
  else
    ko "sin protección en main (HTTP $code): falta aplicar scripts/github-bootstrap.sh"
  fi
fi

echo "== 4/6 Vercel: token"
if [[ -z "$VERCEL_TOKEN_RESOLVED" ]]; then
  ko "no hay VERCEL_TOKEN ni VERCEL_DEVOPS_TOKEN en el entorno"
else
  code="$(api https://api.vercel.com/v2/user "$VERCEL_TOKEN_RESOLVED" "$TMP/vc.json")"
  if [[ "$code" == "200" ]]; then
    ok "token válido (usuario $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["user"]["username"])' "$TMP/vc.json"))"
  else
    ko "el token de Vercel no responde 200 (HTTP $code)"
  fi
fi

echo "== 5/6 Vercel: proyecto $VERCEL_PROJECT"
if [[ -n "$VERCEL_TOKEN_RESOLVED" ]]; then
  code="$(api "https://api.vercel.com/v9/projects/$VERCEL_PROJECT?teamId=$VERCEL_TEAM_ID" "$VERCEL_TOKEN_RESOLVED" "$TMP/proj.json")"
  if [[ "$code" == "200" ]]; then
    ok "existe (id $(field "$TMP/proj.json" id), framework $(field "$TMP/proj.json" framework))"
    linked="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("link",{}).get("repo",""))' "$TMP/proj.json")"
    [[ -n "$linked" ]] && ok "enlazado al repositorio $linked" \
                       || ko "sin integración Git: instala la GitHub App de Vercel en el repositorio y enlaza el proyecto"
    code="$(api "https://api.vercel.com/v9/projects/$VERCEL_PROJECT/env?teamId=$VERCEL_TEAM_ID" "$VERCEL_TOKEN_RESOLVED" "$TMP/env.json")"
    if [[ "$code" == "200" ]]; then
      keys="$(python3 -c 'import json,sys
e = json.load(open(sys.argv[1])).get("envs", [])
print(", ".join(sorted({x["key"] for x in e if "production" in (x.get("target") or [])})))' "$TMP/env.json")"
      ok "variables de Production definidas: ${keys:-ninguna}"
      [[ "$keys" == *DATABASE_URL* ]] || ko "falta DATABASE_URL en Production"
    else
      ko "no se pudo listar las variables (HTTP $code)"
    fi
  else
    ko "no existe o no es accesible (HTTP $code)"
  fi
fi

echo "== 6/6 Base de datos gestionada"
if [[ -z "$DB_URL" ]]; then
  ko "no hay PRODUCTION_DATABASE_URL ni NEON_PRODUCTION_DATABASE_URL en el entorno"
else
  hostport="$(python3 -c 'import sys,urllib.parse as u
p = u.urlparse(sys.argv[1]); print(f"{p.hostname} {p.port or 5432}")' "$DB_URL")"
  host="${hostport%% *}"; port="${hostport##* }"
  if timeout 10 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then
    ok "la base de datos de producción acepta conexión TCP ($host:$port)"
  else
    ko "no se pudo abrir conexión TCP a $host:$port"
  fi
fi

echo
if command -v gh >/dev/null 2>&1 && command -v vercel >/dev/null 2>&1; then
  echo "CLI de GitHub y de Vercel disponibles: los scripts de bootstrap pueden ejecutarse aquí."
else
  echo "INFO: faltan las CLI 'gh' o 'vercel'; los scripts de bootstrap necesitan una máquina con ambas"
  echo "      (o ejecutarse desde el puesto de trabajo). Este preflight no las necesita."
fi

echo
if [[ "$pending" -eq 0 ]]; then
  echo "RESULTADO: sin pendientes. La puesta en marcha puede continuar."
  exit 0
fi
echo "RESULTADO: quedan pendientes (ver líneas PENDIENTE)."
exit 1
