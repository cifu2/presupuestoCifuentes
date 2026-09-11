# ADR-0011 — Política de madurez de versiones (pnpm `minimumReleaseAge` y cooldown de Dependabot)

- **Fecha:** 2026-09-11
- **Estado:** Aceptado
- **Decide:** CTO (fijado al cerrar CIF-29; documenta DevOps)
- **Ámbito:** resolución del lockfile en local, en CI y en el updater de Dependabot

## Contexto

El updater de Dependabot (`dynamic/dependabot/dependabot-updates`, job `npm_and_yarn in /. - Update`)
fallaba al resolver el lockfile de `main` y dejaba el CI en rojo (CIF-29). La causa era un choque de
políticas de madurez de versiones, no un error del código:

- **pnpm 10** —el que fija `packageManager` y usa local y CI— tenía `minimumReleaseAge` por defecto a
  `0`, así que ninguna versión quedaba vetada por su fecha de publicación.
- **pnpm 11** —el que trae preinstalado el contenedor del updater— aplica **24 h** por defecto.
- **Dependabot** aplicaba además su propio _cooldown_ de **3 días** y lo traducía a
  `--config.minimumReleaseAge=4320` (minutos) sobre sus comandos de pnpm. Ese flag **gana** al ajuste
  del repositorio, de modo que la resolución abortaba con `ERR_PNPM_NO_MATURE_MATCHING_VERSION` en
  cuanto el lockfile contenía versiones más jóvenes que la ventana.

Los dos ajustes que gobiernan esa resolución son `pnpm-workspace.yaml` y `.github/dependabot.yml`, y
hasta ahora contaban políticas distintas sin que nadie las hubiera fijado de forma explícita.
`package.json` **no** es una vía válida: pnpm 11 dejó de leer su campo `pnpm`.

El arreglo ya está en `main`: PR #5 (`e3ac3ce`) fija `minimumReleaseAge: 0` en `pnpm-workspace.yaml` y
PR #8 (`012233a`) añade `cooldown.exclude: ['*']` a la entrada `npm` de Dependabot. El job dinámico
volvió a verde (run `34630768704` sobre `012233a`). Faltaba registrar la decisión.

## Decisión

1. **La política vigente es 0 días de ventana de madurez**: cualquier versión que pnpm resuelva puede
   entrar en el lockfile el mismo día de su publicación, sin período de observación. Era el
   comportamiento efectivo de pnpm 10; se fija de forma explícita para que no dependa de la versión de
   pnpm del entorno que ejecuta.
2. **`pnpm-workspace.yaml` declara `minimumReleaseAge: 0`.** Es la única fuente de verdad de los
   ajustes de pnpm, no el campo `pnpm` de `package.json` (que pnpm 11 ya no lee). Sin este valor,
   pnpm 11 aplicaría 24 h y el updater volvería a fallar.
3. **`.github/dependabot.yml` declara `cooldown.exclude: ['*']`** en la entrada `npm`, para que
   Dependabot no inyecte su cooldown por defecto como `--config.minimumReleaseAge=4320` y deje mandar
   la política del repositorio.
4. **Los dos ajustes se mueven juntos.** Cualquier cambio de política exige tocar
   `pnpm-workspace.yaml`, `.github/dependabot.yml` y sus guardas en el mismo commit; cambiar solo uno
   deja a local/CI y al updater con políticas distintas, que es exactamente lo que rompió CIF-29. La
   guarda `src/config/pnpm-settings.test.ts` falla si falta cualquiera de los dos.
5. **La política de madurez no relaja la puerta de calidad:** los PRs de Dependabot siguen pasando
   por los checks requeridos `calidad` y `e2e` (ADR-0006), igual que cualquier otro cambio.
6. **Reevaluación diferida:** con el MVP en producción se revisará si conviene una ventana real
   (punto siguiente).

## Consecuencias

- El updater de Dependabot vuelve a resolver y las actualizaciones semanales no se quedan bloqueadas;
  el CI deja de estar en rojo por esta causa.
- La política es única, explícita y versionada con el repositorio: no depende del default de la
  versión de pnpm que resuelva ni de la configuración implícita de Dependabot.
- **Coste asumido:** se acepta incorporar versiones recién publicadas sin período de madurez. La red
  de seguridad es la puerta `calidad` + `e2e` de cada PR, no una espera temporal; un release roto
  upstream se detecta en el PR de la actualización, no antes.
- Cualquier cambio futuro de la ventana obliga a actualizar los dos ajustes y sus guardas, y a
  comprobar que el lockfile no conserva versiones por debajo de la nueva ventana.
- El procedimiento operativo (cómo comprobar que el updater sigue verde y cómo reproducirlo en local
  con pnpm 11) vive en `docs/despliegue.md`, apartado 7.

## Alternativas consideradas

- **Ventana de madurez real (p. ej. 3 días).** Descartada _por ahora_, no para siempre. Exigiría
  fijar `cooldown` de Dependabot y `minimumReleaseAge` de pnpm a los **mismos minutos** (3 días = 4320) y retirar del lockfile las versiones que quedaran por debajo de la ventana, con el coste de
  retrasar parches de seguridad. Se reevaluará cuando el MVP esté en producción y haya tráfico real
  que justifique el período de observación.
- **No fijar nada y confiar en los valores por defecto.** Descartada: el comportamiento depende de la
  versión de pnpm (10 → 0; 11 → 24 h) y Dependabot inyecta su propio flag, que gana al del
  repositorio. Es el escenario que rompió CIF-29.
