# ADR-0005 — Idiomas soportados y arquitectura de i18n

- **Fecha:** 2026-09-11
- **Estado:** Aceptado (lista definitiva de idiomas pendiente del propietario, CIF-13)
- **Decide:** CTO
- **Ámbito:** multi-idioma del configurador, panel, presupuesto, PDF y email

## Contexto

El propietario pidió multi-idioma. La web actual (`puertascifuentes.com`) solo publica en español,
así que el inglés es el candidato natural para clientes internacionales. Hay que decidir la librería,
las URLs y —lo más importante— cómo se traduce el **texto del catálogo que escribe el propietario**.

## Decisión

1. **Idiomas del MVP: `es` (por defecto) e `en`.** Añadir idiomas después es barato con este diseño.
2. **`next-intl`** como librería: es nativa del App Router, funciona en componentes de servidor y
   cliente, y mantiene los diccionarios en el repositorio. Alternativa descartada: diccionarios
   caseros con contexto propio (más código que mantener) y `next-i18next` (pensado para Pages
   Router).
3. **URLs con prefijo de idioma**: `/es/...` y `/en/...`, con `es` como idioma por defecto y
   redirección desde la raíz. Cada página declara `hreflang` y su `lang`.
4. **Dos capas de traducción, y hay que cubrir las dos:**
   - **Textos de interfaz** (botones, etiquetas, mensajes de validación): ficheros
     `messages/<locale>.json` versionados en el repo.
   - **Textos de catálogo escritos por el propietario** (nombre y descripción de series, acabados,
     colores, accesorios, condiciones del presupuesto): viven en la base de datos, con una tabla de
     traducciones por locale y **fallback a `es`**. El panel muestra aviso del texto que falta traducir.
5. **El presupuesto recuerda su idioma**: se guarda `locale` al emitirlo y el PDF y el email salen
   en ese idioma, aunque el usuario cambie de idioma después.
6. **Sin literales de interfaz hardcodeados** en componentes: es un punto de la Definition of Done y
   se revisa en el PR. Un idioma nuevo = nuevo fichero de mensajes + filas de traducción, sin tocar
   código.

## Consecuencias

- Los tests E2E deben cubrir al menos un flujo completo en `es` y comprobar que `en` no tiene claves
  sin traducir (test de paridad de diccionarios).
- QA añade un test que falla si un idioma soportado tiene claves ausentes o vacías.
- Los textos legales del presupuesto necesitan una revisión humana por idioma: los agentes no
  sustituyen a un traductor profesional para contenido comercial.

## Implementación

Cómo se aplica esta decisión (capas, URLs, contratos de presupuesto/panel y cómo añadir un idioma):
[docs/i18n.md](../i18n.md).

## Pendiente de negocio (CIF-13)

- Confirmar la lista (propuesta: español + inglés) y si hace falta catalán, francés o portugués.
- Quién traduce los textos de catálogo y las condiciones legales de cada idioma.
