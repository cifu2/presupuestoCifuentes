# ADR-0028 — Ejecución del importador contra producción: identidad, entrega del `DATABASE_URL` y no registro

- **Fecha:** 2026-09-13
- **Estado:** Aceptado
- **Decide:** CTO (CIF-484), a petición de Backend. No decide quién aporta los datos, la vía ni la
  fecha: eso es de CIF-114 y se registra allí.
- **Ámbito:** operación, secretos, datos de producción y carga inicial

## Contexto

CIF-484 ejecuta la carga inicial real del catálogo. ADR-0017 (texto canónico en el documento
`adr-0017` de CIF-114; se aterriza en el repositorio con CIF-498) §7 fija que el importador corre
**como paso de operación** con el `DATABASE_URL` del entorno objetivo, "misma disciplina que
`prisma migrate deploy`", y `docs/despliegue.md` §3 fija esa disciplina para las
migraciones. Quedaba abierto un detalle que sí decide si la carga se puede ejecutar con privilegio
mínimo: **qué identidad ejecuta y cómo recibe la cadena de conexión de producción sin versionarla ni
registrarla**. Backend lo planteó en CIF-484 (comentario `ac122e0d`) y este ADR lo cierra.

Hechos comprobados a 2026-09-13:

1. La cadena de conexión de producción vive en el gestor de secretos de Paperclip como
   `neon/production-database-url` y su binding apunta **solo a DevOps**
   (`docs/variables-entorno.md` §5.1-5.2; `docs/despliegue.md` §2, "Quién publica y cómo se pide un
   push"). El token de escritura de GitHub sigue la misma regla por el mismo motivo.
2. El secreto resuelve a la **credencial de aplicación** de la base de producción
   ([ADR-0015](0015-base-de-datos-de-produccion.md) §2): un rol con DML sobre su esquema, que es el
   rol de privilegio mínimo de [ADR-0009](0009-base-de-datos-gestionada-y-backups.md) §6. La
   credencial de administración de Neon **no existe** en el gestor de secretos.
3. El ejemplo copiable de `docs/despliegue.md` §3 era
   `PRODUCTION_DATABASE_URL='...' pnpm prisma migrate deploy`: una asignación en la propia línea de
   comandos deja el valor en el historial del shell y en el transcript del run, que es justo lo que
   [ADR-0014](0014-manejo-y-rotacion-de-secretos.md) §2 prohíbe. La regla escrita era correcta; el
   ejemplo, no.
4. [ADR-0014](0014-manejo-y-rotacion-de-secretos.md) §1 exige que los valores vivan **solo** en el
   gestor de secretos o en un `.env.local` no versionado (el `.gitignore` del repositorio cubre
   `.env.*`), y §5 considera filtrado cualquier valor que aparezca en un log, una captura o un
   transcript, aunque el log sea de acceso restringido.

## Decisión

1. **Un ejecutor nombrado, y no es el CI.** La carga es un paso de operación explícito que ejecuta
   **DevOps** (es quien tiene el binding del secreto), con **Backend** —autor del CLI— revisando el
   informe de `--dry-run` y la verificación posterior. La identidad del ejecutor y la fecha UTC se
   anotan en la tarea. Nunca se ejecuta desde CI, desde un PR, desde un preview de Vercel, desde el
   build, desde un endpoint HTTP ni desde una tarea programada (ADR-0017 §7).
2. **Rol de base de datos: el de aplicación, nunca el de administración.** La carga usa la credencial
   de aplicación (DML, privilegio mínimo; ADR-0009 §6), la misma que Vercel inyecta como
   `DATABASE_URL`. Un `upsert` de catálogo y tarifas no necesita DDL, así que **no** se pide ni se usa
   la credencial de administración de Neon. Si el pre-flight detecta que el rol no puede escribir en
   el esquema, la ejecución **se para y se escala al CTO**: la salida no es ampliar el privilegio a
   mitad de la carga.
3. **Entrega del valor: por el gestor de secretos o por fichero no versionado, nunca por `argv`.**
   El ejecutor lo obtiene del gestor de secretos de Paperclip (lectura auditada, `docs/variables-
entorno.md` §5.2) o de un fichero `.env.production.local` no versionado. Queda prohibido pasarlo
   como argumento (aparece en `ps`, en el historial y en el transcript del run), imprimirlo con
   `echo`/`printf`, `set -x` o `curl -v`, y pegarlo en un comentario, un documento, un PR o una
   captura (ADR-0014 §1-§2).
4. **El CLI no acepta la URL como bandera.** Lee `DATABASE_URL` del entorno; no existe
   `--database-url` ni equivalente. El fichero se carga sin escribir el valor en la línea de comandos
   (`set -a; . ./.env.production.local; set +a`, o `node --env-file`), y solo la **ruta** del fichero
   puede quedar en el historial. Este punto es el que corrige el ejemplo de `docs/despliegue.md` §3.
5. **Contrato de redacción en el CLI (test obligatorio).** El importador redacta credenciales en
   stdout, stderr y en los errores que envuelve, incluidos los de Prisma y `pg`, que pueden repetir el
   datasource. CIF-498 lo cubre con un test que, con una URL sintética con credencial, fuerza un fallo
   de conexión y comprueba que ni stdout ni stderr contienen usuario, contraseña ni la URL completa
   (ADR-0014 §2, ADR-0017 §6).
6. **Evidencia sin datos.** La importación deja fecha, entorno, recuentos por entidad y SHA-256 del
   fichero; nunca contenido, precios, datos del propietario ni la credencial (ADR-0017 §6 y §9).
7. **Barrido antes de publicar.** Cualquier rama o artefacto que recoja el resultado de una ejecución
   pasa `scripts/secret-scan.sh` (árbol e historial, ADR-0014 §3). Ante sospecha de filtración, se
   usa `--values-stdin` y se rota según ADR-0014 §5-§6: un valor en un log se considera filtrado.
8. **Alcance del secreto.** El binding de `neon/production-database-url` sigue limitado a los agentes
   que ejecutan la operación; ampliarlo es una decisión del consejo (ADR-0014 §6), no del ejecutor ni
   del CTO por conveniencia. Menos portadores de una credencial de producción es el objetivo, no un
   efecto secundario.
9. **Puertas que no sustituye.** Antes del `--apply`: ventana y comprobación de PITR/copia con rama
   snapshot (ADR-0009 §4, ADR-0017 §10) y `--dry-run` revisado. Sin las dos, no hay escritura.

## Consecuencias

- **Mejora:** la carga inicial tiene identidad, canal y contrato de redacción definidos, y no depende
  de una credencial de administración de Neon que hoy **no existe** en el gestor de secretos
  (ADR-0015 §2). El privilegio mínimo se cumple por construcción, no por disciplina.
- **Mejora:** desaparece de la documentación un ejemplo copiable que dejaba el valor de producción en
  el historial del shell.
- **Empeora:** el ejecutor único (DevOps) puede ser cuello de botella de la operación. Se alivia con
  la lectura auditada `access.<alias>` si el consejo decide ampliar el binding, y con que Backend
  puede preparar y validar todo lo demás sin la credencial.
- **Empeora:** si el rol de aplicación no tuviera DML sobre alguna tabla, la carga se parará y
  escalará. Es preferible un rato de espera a una carga con el rol de administración.
- **Trabajo que genera:** alinear el ejemplo de uso de `scripts/release.sh` (línea `Uso:`), que aún
  muestra la asignación en la línea de comandos; se hará en el primer cambio de código que toque ese
  fichero, porque una rama `docs/**` no puede llevar `scripts/` sin perder la exención de preview
  (ADR-0019 §5). CIF-498 implementa el test del punto 5.
- **Relación con ADR-0017:** este ADR no lo contradice: concreta qué significa "misma disciplina que
  `prisma migrate deploy`" en §7. Al aterrizar ADR-0017 en el repositorio (CIF-498), §7 debe apuntar
  aquí.

## Alternativas consideradas

- **`PRODUCTION_DATABASE_URL='...' comando` (el ejemplo anterior):** deja el valor en el historial del
  shell y en el transcript del run, sin ganar nada. Descartada (ADR-0014 §2).
- **Bandera `--database-url` en el CLI:** el valor aparece en `ps` y en el historial, y multiplica las
  formas de registrarlo por error. Descartada.
- **Credencial de administración de Neon para la carga:** no existe en el gestor (ADR-0015 §2) y
  viola el privilegio mínimo (ADR-0009 §6) sin necesidad: no hay DDL. Descartada.
- **Ejecutar desde GitHub Actions con un secret del repositorio:** añade un portador más de una
  credencial de producción en un repositorio **público** y convierte la carga en parte del CI.
  Descartada (ADR-0017 §7).
- **Que otro agente reciba el valor por mensaje o documento:** queda en el transcript del run y obliga
  a rotar (ADR-0014 §5). Descartada.
- **Un endpoint HTTP de administración para la carga:** superficie pública nueva para una operación
  puntual, y depende de `ADMIN_API_TOKEN`, que no existe en producción (ADR-0017, alternativa ya
  descartada allí). Descartada.
