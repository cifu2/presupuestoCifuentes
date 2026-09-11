# ADR-0014 — Manejo, barrido y rotación de secretos de operación

- **Fecha:** 2026-09-11
- **Estado:** Aceptado (CTO, a raíz del incidente del run `c7f69293` de CIF-88)
- **Decide:** CTO
- **Ámbito:** secretos de operación (GitHub, Vercel, Neon, panel), scripts de operación, CI y
  procedimiento de rotación

## Contexto

En el run `c7f69293-4093-47e1-aff5-ad54f2adeee9` (CIF-88) un barrido de secretos sobre lo publicado
en el PR #25 hizo su trabajo —0 coincidencias—, pero un `echo` del bucle de depuración imprimió los
patrones ya expandidos: los valores de `GITHUB_DEVOPS_TOKEN`, `VERCEL_DEVOPS_TOKEN` y
`PAPERCLIP_API_KEY` quedaron escritos en el stdout del run y, por tanto, en su log persistente. No
hubo fuga en el repositorio, en los PR, en los comentarios ni en la documentación. El repositorio es
**público** (docs/despliegue.md, apartado 6.1), así que un token de escritura en un log es un
hallazgo de severidad alta: obliga a rotar credenciales de larga duración que solo se emiten desde la
interfaz de GitHub y de Vercel, es decir, cuesta una interrupción del operador.

El estándar anterior (docs/variables-entorno.md, apartados 2.5 y 5.5) decía "no imprimir valores",
pero no definía **cómo** puede una herramienta inspeccionar secretos (recuentos y ubicaciones frente a
contenido) ni el orden de una rotación. Un barrido bien intencionado rompió la regla sin que nada lo
detectara.

## Decisión

1. **Dónde viven los valores.** Solo en el gestor de secretos de Paperclip (cifrado, metadatos
   visibles) o en `.env.local` no versionado. Nunca en el repositorio, la documentación, los ADR, los
   tests, los PR, los comentarios de tarea, las capturas ni los logs (refuerza ADR-0007 y la DoD).
2. **Contrato de redacción.** Cualquier herramienta o agente que inspeccione secretos puede imprimir
   el identificador de la regla, la ruta, la línea y el recuento; **nunca** el valor, el texto
   coincidente ni el patrón expandido. Quedan prohibidos `echo`/`printf`/`set -x` sobre variables con
   credenciales y `curl -v`/`-i` con cabeceras de autorización.
3. **Barrido canónico.** `scripts/secret-scan.sh` implementa ese contrato: sin dependencias, con
   catálogo de patrones de alta confianza (PAT de GitHub clásico y fino, tokens de app, claves de
   API, JWT firmado, clave privada PEM y URL de PostgreSQL con credenciales) y con modo
   `--values-stdin`, que busca valores concretos **sin pasarlos por `argv`** (no aparecen en `ps` ni
   en el historial del shell) y sin imprimirlos. Con `--history` recorre todas las ramas del
   historial de git. Los ficheros `--allowlist` justifican las excepciones.
4. **Test del contrato.** `scripts/secret-scan.test.sh` comprueba, entre otras cosas, que la salida
   no contiene ni el valor ni el patrón. El CI ejecuta barrido y test en la puerta `calidad`, así que
   la regla deja de depender de la disciplina.
5. **Rotación obligatoria.** Un valor que aparece en un log, una captura, un comentario o un
   transcript de run se considera filtrado y se rota en su origen, aunque el log parezca de acceso
   restringido. Además, las credenciales de larga duración se rotan cada **≤ 90 días** (alineado con
   la caducidad del PAT, docs/variables-entorno.md 5.3).
6. **Orden de rotación.** (1) emitir la credencial nueva; (2) registrarla en el gestor de secretos
   mediante propuesta de secreto y aprobación del consejo —los agentes **no** pueden crear ni
   actualizar secretos de empresa—; (3) verificar que el consumidor funciona con la nueva;
   (4) revocar la vieja; (5) verificar que la vieja ya no sirve; (6) anotar el incidente sin
   reproducir ningún valor. Sin el paso 5 no hay cierre.
7. **Tokens de run.** `PAPERCLIP_API_KEY` es un JWT por run: caduca con el run y no se rota a mano.
   Se verifica su caducidad y se anota en el incidente; si alguna vez fuese un token de larga
   duración, se trata como credencial de larga duración.
8. **Historial de git.** Un valor que haya estado alguna vez en un fichero versionado se rota; no se
   reescribe el historial, que en un repositorio público no es una contención fiable y rompería el
   historial de todos los agentes.

## Consecuencias

- **Mejora:** el barrido es reproducible en local y en CI, sin dependencias, y su contrato de
  seguridad está cubierto por tests; los incidentes dejan rastro sin valores.
- **Mejora:** `--values-stdin` permite responder "¿está esta credencial en el repositorio o en su
  historial?" sin exponerla en `argv`, en el shell history ni en la salida.
- **Empeora:** el catálogo de patrones es propio y hay que mantenerlo. Cualquier adopción futura de
  otra herramienta debe pasar el test de redacción y la puerta de CI.
- **Empeora:** los falsos positivos exigen una lista de permitidos justificada (`--allowlist`), no un
  `grep -v` ad hoc.
- **Coste:** ~1 s en el job `calidad`.

## Alternativas consideradas

- **gitleaks / trufflehog:** detección por entropía más potente, pero son binarios externos y por
  defecto **imprimen el valor** en su informe (`--redact` es opcional), lo que repite el fallo del run
  `c7f69293` si alguien olvida la bandera. Se descartan como puerta obligatoria.
- **GitHub push protection / secret scanning:** solo cubre el push, no los barridos manuales, los logs
  ni los ADR, y depende de plan o de activación por el propietario.
- **Guardar el catálogo de patrones en un fichero y `echo`arlo al depurar:** es exactamente el fallo
  del incidente. Descartado.
- **Reescribir el historial de git tras una fuga:** no contiene nada en un repositorio público y
  rompe el historial compartido. Se prefiere rotar.
