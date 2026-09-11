# ADR-0004 — Presupuesto en PDF y por email

- **Fecha:** 2026-09-11
- **Estado:** Aceptado (remitente y destinatarios pendientes de confirmar, CIF-13)
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

## Pendiente de negocio (CIF-13)

- Dominio remitente verificado (registros DNS en el proveedor del dominio) y buzón de aviso al
  comercial.
- ¿Quién recibe el email: el cliente, el comercial o ambos? ¿Con copia al propietario?
- Datos fiscales y condiciones que deben aparecer en el PDF.

## Alternativas consideradas

- **HTML → PDF con Playwright/Chromium en producción:** descartado por peso, arranque en frío y
  coste en serverless.
- **Servicio externo de PDF (DocRaptor y similares):** descartado de momento por coste y por sacar
  datos del cliente a un tercero.
