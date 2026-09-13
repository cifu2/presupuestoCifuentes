#!/usr/bin/env bash
# Guarda de disco del host del control plane (CIF-585).
#
# Mide el uso del volumen raíz y, si supera el umbral de aviso, reclama espacio con acciones que
# solo tocan material regenerable (cachés y artefactos de build). Nunca borra fuentes, bases de
# datos ni worktrees de issues activos: retirar un worktree cerrado es una decisión humana y está
# en el procedimiento manual de docs/operacion.md, apartado 4.3.
#
# Este fichero es la copia canónica y revisable. En el host se instalan los tres ficheros del
# directorio:
#   install -m 0755 docs/runbooks/disco-guard.sh /usr/local/sbin/paperclip-disco-guard.sh
#   install -m 0644 docs/runbooks/paperclip-disco-guard.service /etc/systemd/system/
#   install -m 0644 docs/runbooks/paperclip-disco-guard.timer   /etc/systemd/system/
#   systemctl daemon-reload && systemctl enable --now paperclip-disco-guard.timer
#
# Umbrales y procedimiento: docs/operacion.md, apartados 3 y 4.3.
# Códigos de salida: 0 normal, 1 aviso (la unidad no se marca failed: `SuccessExitStatus=1`),
# 2 crítico, 3 no se pudo medir el disco.
set -uo pipefail

UMBRAL_AVISO=${UMBRAL_AVISO:-80}
UMBRAL_CRITICO=${UMBRAL_CRITICO:-92}
DIAS_ARTEFACTOS=${DIAS_ARTEFACTOS:-2}
TAG=paperclip-disco-guard
ESTADO_DIR=/var/lib/paperclip-disco-guard
MARCA=$ESTADO_DIR/ALERTA
WORKSPACES=/opt/paperclip-data/instances/default/workspaces
PROYECTOS=/opt/paperclip-data/instances/default/projects

mkdir -p "$ESTADO_DIR"

uso=$(df --output=pcent / | tail -n1 | tr -dc '0-9')
libre=$(df -h --output=avail / | tail -n1 | tr -d ' ')
ts=$(date -Is)

# Si `df` no devuelve un número no se sabe cuánto disco hay: nunca se borra la marca ni se sale 0,
# porque eso silenciaría la alerta justo cuando la medición está rota (fail-closed).
case "$uso" in
  '' | *[!0-9]*)
    logger -t "$TAG" -p daemon.err "no se pudo medir el uso de / (df devolvio '${uso}'); se conserva la marca y se sale con 3"
    exit 3
    ;;
esac

logger -t "$TAG" -p daemon.info "uso raiz ${uso}% (libre ${libre}); umbral aviso ${UMBRAL_AVISO}%, critico ${UMBRAL_CRITICO}%"

if [ "$uso" -ge "$UMBRAL_AVISO" ]; then
  logger -t "$TAG" -p daemon.warning "ALERTA: volumen raiz al ${uso}% (libre ${libre}); arranca saneamiento"
  echo "uso_pct=$uso libre=$libre ts=$ts" > "$MARCA"

  # 1. Caché de metadatos de pnpm y paquetes huérfanos del store compartido. El store en sí NO se
  #    borra: lo comparten todos los workspaces y reconstruirlo cuesta una descarga completa.
  rm -rf /root/.cache/pnpm
  pnpm store prune >/dev/null 2>&1 || true

  # 2. Caché de paquetes .deb. El journal NO se recorta aquí: es el rastro forense del incidente y
  #    este host lo tiene acotado por `SystemMaxUse=200M` (journald.conf). Un recorte del journal es
  #    una decisión humana y consciente, no un efecto colateral de la guarda.
  apt-get clean >/dev/null 2>&1 || true

  # 3. Artefactos de build regenerables con más de $DIAS_ARTEFACTOS días. Solo nombres de
  #    artefacto, nunca fuentes ni bases de datos; el margen de días evita pisar un build en curso.
  #    Un candidato que sea punto de montaje se omite: es el *mismo* directorio que su origen, así
  #    que borrar su contenido vaciaría el origen (pasó el 2026-09-13 con el `node_modules` del
  #    proyecto, montado en varios worktrees; ver docs/operacion.md, 4.3).
  find "$WORKSPACES" -mindepth 1 -maxdepth 6 -type d \
    \( -name .next -o -name coverage -o -name playwright-report -o -name test-results \) \
    -mtime +"$DIAS_ARTEFACTOS" 2>/dev/null | while IFS= read -r artefacto; do
    if [ "$(findmnt -no TARGET --target "$artefacto" 2>/dev/null)" = "$artefacto" ]; then
      logger -t "$TAG" -p daemon.warning "se omite $artefacto: es un punto de montaje"
      continue
    fi
    rm -rf "$artefacto"
  done
  find "$WORKSPACES" -mindepth 1 -maxdepth 6 -type f -name tsconfig.tsbuildinfo \
    -mtime +"$DIAS_ARTEFACTOS" -delete 2>/dev/null || true

  # 4. Metadatos de worktrees cuyo directorio ya no existe.
  for repo in "$PROYECTOS"/*/*/_default; do
    [ -d "$repo/.git" ] || continue
    git -C "$repo" worktree prune >/dev/null 2>&1 || true
  done

  uso_final=$(df --output=pcent / | tail -n1 | tr -dc '0-9')
  libre_final=$(df -h --output=avail / | tail -n1 | tr -d ' ')
  logger -t "$TAG" -p daemon.notice "saneamiento terminado: ${uso}% -> ${uso_final}% (libre ${libre_final})"
  echo "uso_pct=$uso_final libre=$libre_final ts=$ts" > "$MARCA"
fi

if [ "$uso" -ge "$UMBRAL_CRITICO" ]; then
  logger -t "$TAG" -p daemon.err "CRITICO: volumen raiz al ${uso}% (libre ${libre}); escalar a DevOps (docs/operacion.md, 4.3)"
  exit 2
fi
if [ "$uso" -ge "$UMBRAL_AVISO" ]; then
  exit 1
fi
rm -f "$MARCA" 2>/dev/null || true
exit 0
