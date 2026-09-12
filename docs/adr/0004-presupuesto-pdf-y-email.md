# ADR-0004 — Presupuesto en PDF y por email

- **Fecha:** 2026-09-11
- **Estado:** Aceptado e implementado (CIF-173); remitente, buzón y datos fiscales pendientes de
  confirmar por el propietario (CIF-13, hoy CIF-14)
- **Decide:** CTO
- **Ámbito:** generación de documentos y envío de correo

## Contexto

El MVP debe entregar el presupuesto en PDF y por email, en el idioma del configurador, sin perderse
si falla la generación o el envío. El plan deja abierto "¿PDF, email o ambos?".

## Decisión

1. **Ambos, y por defecto los dos:** el PDF se genera siempre y se ofrece descarga inmediata; el
   email es un paso explícito del flujo (al cliente y aviso interno al comercial).
2. **El documento es un tipo del dominio** (`QuoteDocument`): referencia, fecha, validez, líneas del
   desglose, totales con IVA, condiciones, idioma. El PDF y el email son **adaptadores** que
   consumen ese tipo: `QuotePdfRenderer` y `EmailSender` (puertos en `src/application/ports`).
3. **PDF con `@react-pdf/renderer` en el servidor**, dentro de un route handler. Es JavaScript puro
   (sin binarios ni navegador) y funciona en el entorno serverless de Vercel. La plantilla se
   testea renderizando un documento de ejemplo y comprobando el tamaño y el texto extraído.
4. **Email con Resend** detrás del puerto `EmailSender`. El adapter se puede sustituir sin tocar el
   dominio. En desarrollo se usa un adaptador de consola para no enviar correo real.
5. **Orden a prueba de fallos:** primero se persiste el presupuesto emitido (con su precio
   congelado), después se genera el PDF y después se envía el email. Un fallo de PDF o de email
   **no pierde** el presupuesto: queda registrado como envío pendiente y se puede reintentar.
6. **Envío idempotente y reintentable**: cada envío guarda una clave de idempotencia
   (`quoteId + versión + destinatario`) y su estado; reintentar no duplica correos.
7. **Sin filtrar datos personales a terceros innecesarios**: el PDF se genera en nuestra
   infraestructura; al proveedor de email solo viajan los datos imprescindibles del envío.

## Consecuencias

- Idiomas: el PDF se renderiza en el idioma guardado en el presupuesto (ver ADR-0005).
- Hay que fijar la plantilla del presupuesto (referencia, condiciones legales, validez, datos
  fiscales) con el propietario antes de la demo final.
- Si el propietario quiere firma digital o pago, se aborda en la fase siguiente; el tipo
  `QuoteDocument` está preparado para añadirlo.

## Implementación (CIF-173)

La entrega está construida y probada; **solo faltan valores del propietario, y esos son
configuración**. Lo que la implementación fija:

1. **La entrega es una fila con estado** (`quote_delivery`): presupuesto, versión del documento,
   destinatario, audiencia (cliente o interno), estado (`pending`/`sent`/`failed`), intentos,
   identificador del proveedor y motivo del último fallo. Se escribe **antes** de renderizar: si algo
   falla, el presupuesto queda con un envío pendiente visible y no se pierde.
2. **La versión del documento empieza en 1** y entra en la clave de idempotencia
   (`quoteId + versión + destinatario`, única en la base). Reenviar el mismo documento al mismo
   destinatario es el mismo registro; una entrega ya enviada nunca se reenvía.
3. **Los valores del propietario son entorno, no código**: `RESEND_FROM` (remitente verificado),
   `QUOTE_INTERNAL_RECIPIENTS` (buzón del comercial y copias), `QUOTE_ISSUER_*` (datos fiscales) y
   `QUOTE_CONDITIONS_ES` / `QUOTE_CONDITIONS_EN` (condiciones, una por línea). Sin remitente
   configurado se usa el **adaptador de consola**: no se envía correo real. Mientras falte un dato,
   el PDF imprime `[pendiente de configurar]` y un aviso en la cabecera.
4. **Las condiciones son por idioma** con reserva al idioma por defecto: si falta la traducción se
   imprime la del idioma por defecto y el aviso de pendiente lo dice.
5. **La descarga del PDF es pública y de solo lectura** (`GET /api/quotes/:reference/pdf`); **la
   entrega por email va detrás de la guarda provisional del API del panel** (`ADMIN_API_TOKEN`,
   CIF-9/CIF-14), porque enviar correo tiene coste y superficie de abuso. Cuando el propietario
   decida quién puede lanzarla, se cambia la guarda sin tocar los casos de uso.
6. **Los datos del cliente viajan con la entrega**, no se guardan en el presupuesto: el configurador
   los envía en la petición de entrega y la entrega los conserva para el reintento.
7. **Reintento sin duplicar** (`POST /api/quotes/:reference/delivery/retry`): reintenta solo las
   entregas pendientes o fallidas de la versión pedida; si no queda ninguna, no renderiza nada.

## Pendiente de negocio (CIF-13, hoy CIF-14)

- Dominio remitente verificado (registros DNS en el proveedor del dominio) y buzón de aviso al
  comercial.
- ¿Quién recibe el email: el cliente, el comercial o ambos? ¿Con copia al propietario?
- Datos fiscales y condiciones que deben aparecer en el PDF.

Mientras no haya respuesta, rigen los valores por defecto de la implementación: adaptador de consola
si no hay `RESEND_FROM`, destinatarios = cliente que pide el presupuesto + `QUOTE_INTERNAL_RECIPIENTS`,
y datos fiscales con marcador explícito más aviso en el PDF.

## Alternativas consideradas

- **HTML → PDF con Playwright/Chromium en producción:** descartado por peso, arranque en frío y
  coste en serverless.
- **Servicio externo de PDF (DocRaptor y similares):** descartado de momento por coste y por sacar
  datos del cliente a un tercero.
