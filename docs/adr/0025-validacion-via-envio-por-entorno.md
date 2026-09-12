# ADR-0025 — Validación de la entrega del presupuesto por entorno (preview sin credenciales)

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (CIF-331), a partir de la validación NO PASA de CIF-329
- **Ámbito:** alcance de la validación de la entrega del presupuesto (PDF y email) por entorno y
  puerta de calidad de los PR. No cambia el diseño de la entrega ([ADR-0004](0004-presupuesto-pdf-y-email.md))
  ni decide sobre la sesión de la interfaz del panel ([ADR-0024](0024-autenticacion-panel-sesion-firmada.md)),
  cuyas variables sí pueden desplegarse en _Preview_ si se quiere probar el acceso.

## Contexto

1. **CIF-329 devolvió NO PASA al validar en el preview del PR #39 la entrega del presupuesto**
   (emitir, reintentar, PDF y email), con dos hallazgos de entorno:
   - **F2.** `POST /api/quotes/<ref>/delivery` y `POST /api/quotes/<ref>/delivery/retry` responden
     `503 ADMIN_API_DISABLED`: `ADMIN_API_TOKEN` no se despliega en _Preview_ (`docs/variables-entorno.md` §1)
     y QA no puede ni debe usar credenciales reales, así que el flujo protegido no es ejercitable ahí.
   - **F3.** El head desplegado (`baf75e2`) no contenía el arreglo de CIF-186 porque el preview
     validado era el del PR #39 y ese arreglo entra por el PR #42.
2. **Hay que elegir entre dos vías** para esa validación: **solo CI** (servidor de administración de
   la propia suite, token de pruebas del repositorio) o **_Preview_ con un token no sensible**
   dedicado y documentado. La elección condiciona la [Definition of Done](../definition-of-done.md) y
   el [playbook E2E](../e2e-playbook.md), que hoy exigen que QA valide el flujo en el preview del PR.
3. **Restricciones que acotan la decisión:**
   - [ADR-0014](0014-manejo-y-rotacion-de-secretos.md): mínimo privilegio y rotación; cada credencial
     de más es superficie y trabajo.
   - [ADR-0007](0007-despliegue-vercel-github.md) y [ADR-0019](0019-cuota-despliegues-vercel.md): los
     secretos viven en Vercel por entorno; los previews son públicos y consumen la cuota de despliegues.
   - [ADR-0004](0004-presupuesto-pdf-y-email.md) §4: sin `RESEND_FROM` y `RESEND_API_KEY` la
     aplicación usa el **adaptador de consola**; en _Preview_ esas variables no están desplegadas.
   - `docs/despliegue.md` §1: la protección de despliegue de Vercel está desactivada a propósito, así
     que **cualquier URL de preview es pública**.

## Decisión

1. **La validación del flujo de entrega con credencial de administración es solo de CI.** La cubren
   `e2e/quote-delivery.spec.ts` —sobre el servidor de administración de la suite, con el token de
   pruebas del repositorio, catálogo de demostración y adaptador de email de consola— y los tests
   unitarios y de borde. Es la puerta de fusión del flujo (DoD, punto 2).
2. **El preview de un PR valida del flujo de entrega solo el camino público:** emisión (`201`),
   descarga del PDF (`200`, `application/pdf`, cuerpo que empieza por `%PDF-`) y el **cierre en
   falso** (`503 ADMIN_API_DISABLED` con la credencial sin desplegar), que es una propiedad de
   seguridad y conviene ver en vivo.
3. **`ADMIN_API_TOKEN` no se despliega en _Preview_.** Sigue siendo un secreto **opcional** de
   _Production_ (automatización) y un valor de desarrollo en local y CI.
4. **Se descarta el `ADMIN_API_TOKEN` propio de _Preview_ (opción b).** No validaría lo que promete
   —sin las claves de Resend el contenedor elige el adaptador de consola, así que no sale ningún
   correo— y a cambio abriría el API de administración de **todos** los previews (URLs públicas),
   exigiría rotarlo y repartirlo, y añadiría una credencial que custodiar a cambio de una cobertura
   que el CI ya da de forma determinista, repetible y sin depender de una base de datos compartida.
5. **La validación del envío real de correo es una comprobación de producción**, cuando el propietario
   entregue el remitente verificado y el buzón interno (CIF-14): un smoke controlado al buzón del
   propietario tras el release. Es una decisión de negocio, así que la convoca el CEO; producción no
   se usa como banco de pruebas de E2E ni con datos de cliente.
6. **El estado terminal de CIF-186 se prueba en CI** (unitarios y tests de borde: `200
attempts_exhausted` al agotar el tope, `in_progress` mientras el intento sigue en vuelo) y en el
   preview del PR #42 se comprueba solo que **la superficie desplegada contiene el arreglo**.
   Reproducir el agotamiento en vivo exigiría 100 envíos fallidos y, con el adaptador de consola, el
   envío nunca falla: el acta de validación debe distinguir «contiene el arreglo» de «reproduce el
   estado».
7. **Esta política vincula a la [Definition of Done](../definition-of-done.md) y al
   [playbook E2E](../e2e-playbook.md)**, que fijan el alcance por entorno. Cambiarla exige un ADR nuevo.

## Consecuencias

- **Mejora:** el flujo de entrega se valida en cada PR con un resultado determinista; no se añaden
  secretos, no se amplía la superficie de los previews y la validación no depende del estado de una
  base de datos de preview compartida.
- **Empeora:** QA no puede «ver» el correo en el preview de un PR. El hueco se cubre con el CI y con
  el smoke de producción de CIF-14.
- **Riesgo aceptado y vigilado:** en _Production_, mientras falten `RESEND_FROM` y `RESEND_API_KEY`,
  la entrega se marca enviada con el adaptador de consola (traza en el log, sin correo real). Lo
  cierran el aviso `PENDIENTE` de `scripts/despliegue-preflight.sh` y la entrega del propietario en
  CIF-14; si esa configuración se retrasara más allá del MVP, se abre un ADR para que la entrega falle
  en cerrado en _Production_ en vez de declararse enviada.
- **Trabajo que genera:** este ADR, el alcance por entorno en `docs/e2e-playbook.md` y
  `docs/definition-of-done.md`, y la nota de alcance en el acta de validación de CIF-204 (preview del
  PR #42).

## Alternativas consideradas

- **`ADMIN_API_TOKEN` propio de _Preview_, rotable (opción b):** descartada por la decisión 4.
- **Ejecutar el E2E de entrega contra producción:** descartada; usaría datos de cliente y haría de
  producción un banco de pruebas (ADR-0007, RGPD).
- **Publicar un preview con el entorno de la suite (tercer servidor con el token de pruebas):** no
  aplica; el preview es un despliegue de Vercel y no admite inyectar el entorno efímero de Playwright.
