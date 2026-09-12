# ADR-0024 — Autenticación del panel: sesión firmada con la credencial del propietario en entorno

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** Backend (CIF-241), a partir de ADR-0023 §5/§7; revisión independiente de otro agente (DoD #3)
- **Ámbito:** acceso a `/[locale]/admin/**` y al API de administración; no toca el modelo de catálogo (ADR-0017) ni los casos de uso

## Contexto

1. **El panel vive en el mismo despliegue de producción que la web** (ADR-0007): `/[locale]/admin/**`
   no puede quedar públicamente accesible (ADR-0023 §5) ni siquiera antes de que exista la escritura
   de catálogo (fase 3, ADR-0023 §7).
2. **Hoy solo hay una credencial de operación para el API**: `ADMIN_API_TOKEN` (bearer compartido,
   CIF-9/CIF-14/CIF-86). No hay sesión de interfaz, y un navegador no puede manejar ese token sin
   exponerlo. Sin esta pieza, la fase 3 del panel no se puede construir.
3. **La protección de despliegue de Vercel está desactivada a propósito desde el 2026-09-11**
   (`docs/despliegue.md` §1): Vercel traía activada la autenticación SSO para todos los despliegues,
   lo que dejaba el configurador público y las URLs de preview detrás de un inicio de sesión de
   Vercel. Retomarla cambiaría ese equilibrio y es lo primero que hay que justificar si se elige.
4. **Un único propietario, sin usuarios ni roles** (restricción de CIF-241): no hay tabla de usuarios,
   ni invitaciones, ni permisos por sección. Cualquier modelo con más de una cuenta exige escalar al
   CTO antes de implementarlo.
5. **El shell de fase 1 (CIF-101) ya trae su propia guarda de entorno** (§5 de ADR-0023:
   `ADMIN_PANEL_ENABLED`/catálogo demo, layout de `/[locale]/admin`). Es independiente y se conserva:
   las dos guardas **suman**, no se sustituyen.

## Decisión

1. **Cookie de sesión firmada emitida por una página de acceso.** El mecanismo es una cookie
   `admin_session` con valor versionado `v1.<payload base64url>.<firma HMAC-SHA256>`, payload
   `{ iat, exp }` y vigencia de **8 h** (`ADMIN_SESSION_TTL_SECONDS`).
2. **La credencial vive en el entorno, nunca en el repositorio**: `ADMIN_PANEL_PASSWORD` (credencial
   del propietario) y `ADMIN_SESSION_SECRET` (clave de firma). Se declaran en
   `docs/variables-entorno.md` y se marcan como _Sensitive_ en Vercel (ADR-0014).
3. **La clave de firma se deriva del secreto y de la credencial vigente**
   (`HMAC(SECRET, "v1\n" + PASSWORD)`). Rotar cualquiera de las dos invalida **todas** las sesiones
   emitidas, sin lista de revocación ni tabla de sesiones.
4. **La sesión se emite y se borra por API**, no por variables de plantilla:
   `POST /api/admin/session` con `{ "password": "…" }` responde `200` y `Set-Cookie`
   (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=28800`, `Secure` cuando la petición llega por
   HTTPS); `DELETE /api/admin/session` la borra. La comparación de la credencial es en tiempo
   constante y solo ocurre en el servidor. Al leer la cookie se prueban **todas** las que lleven el
   nombre (no solo la primera): una copia sembrada desde un subdominio con `Domain=` no puede dejar
   inservible la sesión real, y falsificarla exige igualmente la clave de firma.
5. **La guarda vive en el borde**: `src/proxy.ts` (Proxy de Next.js 16, runtime de Node por defecto)
   redirige toda petición a `/[locale]/admin/**` sin sesión válida a
   `/[locale]/acceso?next=<destino>`, con `X-Robots-Tag: noindex` (también cuando la sesión es
   válida, para que el panel no se indexe), **sin renderizar nada del panel**.
   - **La decisión se toma sobre la ruta normalizada** (revisiones de CIF-246, B1/B1′): se decodifica
     cada segmento (también la doble codificación), se recortan los espacios ASCII de los extremos —el
     router de Next los recorta al casar la ruta, así que `/es/admin%20` sirve `/[locale]/admin`—, se
     colapsan barras duplicadas y se resuelven `.`/`..`, que es lo que hace Next al servir.
     `/es/%61dmin`, `/es/ad%6din`, `/es/admin%00` y `/es/admin%20` son `/[locale]/admin` y la guarda
     los deniega igual; una ruta que no se puede normalizar (escape inválido, carácter de control)
     también se deniega (falla cerrado).
   - **El `matcher` cubre todo lo que no sea API o estáticos de Next/Vercel** (B2/B1′): la entrada de
     i18n se saltaba cualquier camino con `.`, y la guarda no puede depender de una coincidencia
     literal porque Next casa variantes decodificadas o con espacios recortados
     (`/es/admin%20/series/x.y`, `/es/%61dmin/x.y`). El Proxy corre también en esas rutas, decide con
     la ruta normalizada y devuelve `next()` sin i18n para las rutas con punto, de modo que el sitio
     público (activos estáticos) se comporta igual que antes.
   - **El destino de `next` se normaliza y solo admite volver al panel propio** (nada de URLs
     absolutas, `//host`, esquemas ni `..`); si no vale, se vuelve a `/[locale]/admin`, no al
     formulario de acceso. No hay lógica de acceso en componentes ni en el cliente.
6. **Página de acceso propia y fuera del panel**: `/[locale]/acceso`, i18n es/en, `robots: noindex`,
   sin secretos en el cliente. Vive fuera de `/[locale]/admin/**` para poder mostrarse sin sesión y
   no depende del shell de fase 1.
7. **El API de administración acepta dos credenciales**: `Authorization: Bearer <ADMIN_API_TOKEN>`
   (operación) o la cookie de sesión del panel (propietario en la interfaz). Si **ninguna** de las dos
   está configurada responde `503 ADMIN_API_DISABLED`; si no hay credencial válida, `401 UNAUTHORIZED`.
8. **Falla cerrado sin configuración**: si falta el secreto, falta la credencial, o son más cortos
   que 32 y 16 caracteres respectivamente, no se emite sesión (`503 ADMIN_ACCESS_DISABLED`), el panel
   queda denegado y **el sitio público sigue funcionando** (el mínimo se aplica en la guarda, no en el
   esquema de entorno, para no tumbar el despliegue entero por una variable del panel).
9. **Sin datos personales y sin trazabilidad de personas**: no se registra quién accede ni su IP; los
   intentos fallidos responden `401` genérico (mensaje único) y no se registra la credencial probada.
10. **Un solo propietario.** No se crean usuarios, roles ni sesiones por usuario. Más de una cuenta
    exige un ADR nuevo y aprobación del CTO.

## Consecuencias

- **Mejora:** el panel deja de ser una superficie pública sin autenticación; el propietario entra con
  una credencial propia y la interfaz puede llamar al API sin manejar el token de operación; rotar la
  credencial cierra todas las sesiones; el configurador público no se ve afectado.
- **Coste asumido (sesión sin estado):** el cierre de sesión borra la cookie del navegador, pero una
  copia de la cookie seguiría siendo válida hasta su caducidad (8 h); la revocación global es rotar
  `ADMIN_SESSION_SECRET` o `ADMIN_PANEL_PASSWORD`. Es el precio de no tener almacén de sesiones.
- **Coste asumido (sin límite de intentos propio):** no hay contador de intentos por IP en la
  aplicación (el despliegue es serverless sin estado compartido). Se mitiga exigiendo una credencial
  de ≥ 16 caracteres y confiando en la protección de red de Vercel; añadir un límite real exige un
  almacén externo y es trabajo propio si el riesgo lo pide.
- **Trabajo que genera:** DevOps debe inyectar `ADMIN_SESSION_SECRET` y `ADMIN_PANEL_PASSWORD` en
  _Production_ (y, si se quiere probar el acceso en preview, en _Preview_) y ampliar
  `scripts/despliegue-preflight.sh` para avisar si faltan, igual que ya hace con `ADMIN_API_TOKEN`.
  Prueba de regresión de esta decisión: los tests de `admin-session`, `admin-guard` y `admin-auth`, y
  el E2E `e2e/admin-auth.spec.ts` en `chromium` y `movil`.
- **Endurecimiento pendiente (no bloqueante):** la cookie no usa el prefijo `__Host-` porque en local
  sirve por `http://127.0.0.1` sin `Secure` y el navegador la descartaría; con dominio propio y HTTPS
  en todos los entornos es un cambio de una línea que cierra el _cookie tossing_ antes incluso de
  probar la firma. Se valoró junto a los arreglos de la revisión de CIF-246.

## Alternativas consideradas

- **Delegar en la protección de despliegue de Vercel (Vercel Authentication / password).**
  Descartada, y no por insegura: la protección es **por proyecto y por entorno**, así que aplica a
  todo el despliegue —configurador público incluido—, que es exactamente el motivo por el que se
  desactivó el 2026-09-11 (`docs/despliegue.md` §1). No se puede limitar a `/[locale]/admin/**`, y
  retomarla dejaría la web pública detrás de un login de Vercel o exigiría un segundo proyecto con su
  propio dominio. Si algún día se retoma (por ejemplo, con dominios separados), habrá que justificarlo
  en un ADR que supersede a este.
- **HTTP Basic en el Proxy.** Credencial en cada petición, sin estado y sin fricción de
  implementación, pero sin cierre de sesión real (el navegador la cachea), con diálogo nativo no
  traducible, y sin forma de que la interfaz autentique las llamadas al API sin repetir la credencial
  en cada una. Peor experiencia para el propietario sin ganar seguridad apreciable.
- **Sesiones en base de datos (tabla + puerto + adaptador).** Permitiría revocación por sesión y
  auditoría de accesos, pero añade migración, puerto, adaptador y casos de uso para un MVP con un
  único dueño. Se pospone hasta que haya más de una cuenta o un requisito de auditoría.
- **Guardar la credencial como hash (scrypt/argon2) en el entorno.** El secreto seguiría viviendo en
  el mismo sitio (variable _Sensitive_ de Vercel) y no cambia el modelo de amenaza, pero obliga al
  propietario (no técnico) a generar el hash con una herramienta. Migrar a hash es compatible con la
  guarda actual: basta con que la variable contenga el hash y que la comparación lo entienda.
- **JWT con una librería.** Innecesario: el token no lo consume ningún tercero, no hay _claims_ que
  negociar y la firma HMAC con `node:crypto` cabe en un módulo pequeño, versionado y testeado.
