#!/usr/bin/env bash
#
# Comprobación de solo lectura de la puesta en marcha del despliegue (CIF-11, docs/despliegue.md 6).
# Exige que Production defina DATABASE_URL y las dos variables de la sesión del panel
# (ADMIN_SESSION_SECRET y ADMIN_PANEL_PASSWORD): sin estas dos el panel deniega /[locale]/admin/**
# y el propietario no puede entrar (CIF-241). `ADMIN_API_TOKEN` es la credencial **opcional** de
# automatización por `Bearer` (ADR-0024 §7) y no se exige, porque el propietario entra con la sesión
# (CIF-123). Las claves se comparan por nombre exacto, nunca por subcadena (CIF-129). Los avisos de
# esta comprobación se prueban en scripts/despliegue-preflight.test.sh.
#
# Interruptores de la guarda del shell del panel (ADR-0023 §5, CIF-282): bloquea si
# `CATALOG_DEMO_MODE` está activa en Production (sustituye los datos reales por fixtures y abre la
# guarda) e informa del estado de `ADMIN_PANEL_ENABLED`, que es un interruptor legítimo.
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
info() { printf '  INFO      %s\n' "$1"; }

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

tiene_clave() { # tiene_clave <fichero-json> <clave> -> 0 si esa clave exacta está en Production
  python3 -c 'import json,sys
e = json.load(open(sys.argv[1])).get("envs", [])
raise SystemExit(0 if any(x.get("key") == sys.argv[2] and "production" in (x.get("target") or []) for x in e) else 1)' "$1" "$2"
}

valor_produccion() { # valor_produccion <fichero-json> <clave> -> valor legible, vacío si no lo es
  # De Vercel solo llega el valor de las variables no sensibles (`plain`); en las demás viene vacío
  # o ausente, así que el preflight nunca imprime un secreto y solo compara estos dos interruptores.
  python3 -c 'import json,sys
e = json.load(open(sys.argv[1])).get("envs", [])
v = next((x.get("value") for x in e if x.get("key") == sys.argv[2] and "production" in (x.get("target") or [])), None)
print(v if isinstance(v, str) else "")' "$1" "$2"
}

# Los dos interruptores que el código interpreta con `environmentFlag` (booleano textual, CIF-74):
# mismos valores verdaderos y falsos que `z.stringbool()` de Zod 4.6, que pasa el valor a minúsculas
# pero **no lo recorta**. `z.stringbool()` rechaza `"true "`, y con `CATALOG_DEMO_MODE` eso tumba el
# arranque y con `ADMIN_PANEL_ENABLED` la guarda falla en cada petición, así que el preflight no
# puede dar por bueno lo que el código rechaza (CIF-282, hallazgo H5).
interruptor_activo() {
  case "$1" in true | 1 | yes | on | y | enabled) return 0 ;; *) return 1 ;; esac
}
interruptor_inactivo() {
  case "$1" in false | 0 | no | off | n | disabled) return 0 ;; *) return 1 ;; esac
}
normalizar_interruptor() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
# `environmentFlag` recorta solo para decidir si el valor está vacío (`z.preprocess`): un valor con
# únicamente espacios es «ausente» y cae al `false` por defecto, no es un valor ilegible.
interruptor_solo_espacios() { [[ -n "$1" && -z "${1//[[:space:]]/}" ]]; }

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
    if [[ "$admin" == "True" ]]; then
      ok "el token tiene administración (puede aplicar la protección de main)"
    else
      ko "el token no es administrador del repositorio: no podrá proteger main"
    fi
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
    if [[ -n "$linked" ]]; then
      ok "enlazado al repositorio $linked"
    else
      ko "sin integración Git: instala la GitHub App de Vercel en el repositorio y enlaza el proyecto"
    fi
    code="$(api "https://api.vercel.com/v9/projects/$VERCEL_PROJECT/env?teamId=$VERCEL_TEAM_ID" "$VERCEL_TOKEN_RESOLVED" "$TMP/env.json")"
    if [[ "$code" == "200" ]]; then
      keys="$(python3 -c 'import json,sys
e = json.load(open(sys.argv[1])).get("envs", [])
print(", ".join(sorted({x["key"] for x in e if "production" in (x.get("target") or [])})))' "$TMP/env.json")"
      ok "variables de Production definidas: ${keys:-ninguna}"
      # Por nombre exacto: `DATABASE_URL_UNPOOLED` no cubre `DATABASE_URL`, ni
      # `ADMIN_PANEL_PASSWORD_OLD` cubre `ADMIN_PANEL_PASSWORD` (CIF-129).
      tiene_clave "$TMP/env.json" DATABASE_URL || ko "falta DATABASE_URL en Production"
      # Sin ADMIN_SESSION_SECRET/ADMIN_PANEL_PASSWORD la sesión falla cerrada: /[locale]/admin/**
      # queda denegado y /api/admin/session responde 503 ADMIN_ACCESS_DISABLED, así que el
      # propietario no puede entrar al panel (ADR-0024, CIF-241). `ADMIN_API_TOKEN` no se exige:
      # es la credencial opcional de automatización (ADR-0024 §7) y el propietario entra con la
      # sesión (CIF-123).
      tiene_clave "$TMP/env.json" ADMIN_SESSION_SECRET || ko "falta ADMIN_SESSION_SECRET en Production: la sesión del panel falla cerrada y /api/admin/session responde 503 (CIF-241)"
      tiene_clave "$TMP/env.json" ADMIN_PANEL_PASSWORD || ko "falta ADMIN_PANEL_PASSWORD en Production: el propietario no puede canjear la credencial del panel (CIF-241)"

      # Guarda del shell del panel (ADR-0023 §5). `CATALOG_DEMO_MODE` sirve el catálogo en memoria y
      # además abre la guarda en Production: es la configuración del E2E hermético, nunca la de
      # producción, así que su activación bloquea la puesta en marcha. `ADMIN_PANEL_ENABLED` sí es
      # un interruptor legítimo: solo se informa de su estado.
      if tiene_clave "$TMP/env.json" CATALOG_DEMO_MODE; then
        demo_crudo="$(valor_produccion "$TMP/env.json" CATALOG_DEMO_MODE)"
        demo="$(normalizar_interruptor "$demo_crudo")"
        if interruptor_activo "$demo"; then
          ko "CATALOG_DEMO_MODE activa el catálogo de demostración en Production: sirve datos de fixture y abre el shell del panel (ADR-0023 §5). Desactívala y redespliega"
        elif interruptor_inactivo "$demo"; then
          ok "CATALOG_DEMO_MODE desactivado en Production (catálogo real)"
        elif interruptor_solo_espacios "$demo"; then
          ok "CATALOG_DEMO_MODE solo tiene espacios en Production: environmentFlag la recorta y se usa el catálogo real (false por defecto)"
        elif [[ -z "$demo_crudo" ]]; then
          info "CATALOG_DEMO_MODE está definida en Production pero su valor no es legible desde la API: compruébala a mano"
        else
          ko "CATALOG_DEMO_MODE tiene un valor que el arranque rechaza (environmentFlag, CIF-74): el despliegue no arranca hasta corregirlo"
        fi
      else
        ok "CATALOG_DEMO_MODE no está definida en Production (valor por defecto false: catálogo real)"
      fi
      if tiene_clave "$TMP/env.json" ADMIN_PANEL_ENABLED; then
        panel_crudo="$(valor_produccion "$TMP/env.json" ADMIN_PANEL_ENABLED)"
        panel="$(normalizar_interruptor "$panel_crudo")"
        if interruptor_activo "$panel"; then
          ok "ADMIN_PANEL_ENABLED activado en Production: /[locale]/admin/** se sirve detrás de la sesión del propietario (ADR-0024)"
        elif interruptor_inactivo "$panel"; then
          ok "ADMIN_PANEL_ENABLED desactivado en Production: el shell no se sirve (404 con sesión válida)"
        elif interruptor_solo_espacios "$panel"; then
          ok "ADMIN_PANEL_ENABLED solo tiene espacios en Production: environmentFlag lo recorta y el shell queda cerrado (false por defecto)"
        elif [[ -z "$panel_crudo" ]]; then
          info "ADMIN_PANEL_ENABLED está definida en Production pero su valor no es legible desde la API: compruébala a mano"
        else
          ko "ADMIN_PANEL_ENABLED tiene un valor que la guarda rechaza (environmentFlag): /[locale]/admin/** falla en cada petición"
        fi
      else
        ok "ADMIN_PANEL_ENABLED no está definida en Production: shell cerrado por defecto (sin sesión manda el acceso, ADR-0024)"
      fi
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
