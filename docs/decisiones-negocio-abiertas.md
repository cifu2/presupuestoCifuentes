# Decisiones de negocio abiertas (propuesta al CEO y al propietario)

> Estas decisiones **no las toma el CTO**: afectan a precios, catálogo e idiomas y son del
> propietario. Están cerradas técnicamente (el sistema soporta las alternativas sin reescribir
> código) para no bloquear al equipo. Se confirman con el propietario en **CIF-13**.
> Preparado por el CTO el 2026-09-11.

## 1. Idiomas soportados

**Propuesta:** español (`es`, por defecto) e inglés (`en`) en el MVP. Catalán, francés y portugués
quedan preparados y se añaden cuando el propietario lo decida.

**Por qué:** la web actual solo publica en español; el inglés cubre clientes internacionales y sirve
para validar el flujo completo. Con `next-intl` (ADR-0005), añadir un idioma es un fichero de
mensajes más las traducciones del catálogo, sin tocar código.

**Necesitamos del propietario:** confirmar la lista (¿alguno más desde el principio?) y quién
traduce los textos comerciales y legales de cada idioma.

## 2. Política de precios

**Propuesta:** el motor soporta tres estrategias por serie —precio por m², tabla por bandas de
medida y precio fijo por modelo— más modificadores (acabado, color, accesorios, herrajes,
instalación, portes, urgencia, descuentos). El propietario elige la estrategia de cada serie en el
panel y mantiene varias versiones de tarifa con fecha de vigencia (ADR-0003).

**Por qué:** no hay que decidir una única fórmula para todo el catálogo, y el precio de un
presupuesto ya enviado queda congelado con la versión de tarifa que se usó.

**Necesitamos del propietario (CIF-13):**

- Tarifas vigentes y fecha de entrada en vigor, con la estrategia de cada serie.
- **Tamaño máximo por serie** (y qué excepciones pasan a presupuesto manual).
- Redondeo de superficie (propuesta: m² al alza con 3 decimales).
- IVA aplicable, y si portes e instalación entran en el precio o van aparte.
- Validez del presupuesto (propuesta: 30 días) y política de descuentos.

## 3. Presupuesto en PDF y por email

**Propuesta:** los dos. El PDF se descarga siempre y el email se envía al cliente con aviso al
comercial. Orden a prueba de fallos: se guarda el presupuesto, se genera el PDF y se envía; si algo
falla, el presupuesto no se pierde y el envío se reintenta sin duplicar (ADR-0004).

**Necesitamos del propietario:**

- Dominio remitente (p. ej. `presupuestos@puertascifuentes.com`) y acceso al DNS para verificarlo,
  o autorización para que lo configure quien gestione el dominio.
- Buzón del comercial que recibe los avisos de presupuesto manual.
- ¿El email va al cliente, al comercial o a ambos?
- Datos fiscales y condiciones que deben aparecer en el PDF.

## 4. Decisiones ya cerradas por el CTO (no requieren al propietario)

- Stack y versiones: ADR-0002.
- Estructura del repositorio y límites de capas: ADR-0001.
- Motor de precios versionado y precio congelado: ADR-0003.
- PDF con `@react-pdf/renderer` y email con Resend tras puertos propios: ADR-0004.
- i18n con `next-intl` y dos capas de traducción: ADR-0005.
- Calidad: Vitest + Playwright con puerta E2E obligatoria: ADR-0006.
- Despliegue en Vercel desde GitHub: ADR-0007.
