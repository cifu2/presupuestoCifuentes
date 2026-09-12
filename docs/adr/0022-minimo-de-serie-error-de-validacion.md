# ADR-0022 — Por debajo del mínimo de la serie es un error de validación, no presupuesto manual

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (decisión registrada en CIF-216), a partir de la regla de diseño D1
  (`modelo-visual-2d` §6 B2, aprobada en CIF-44/CIF-46)
- **Ámbito:** contrato público de `POST /api/quotes/price`, `POST /api/quotes` y
  `POST /api/manual-quote-requests`; motor de precios y configurador público

## Contexto

La regla de diseño vigente separa dos caminos para una medida fuera de rango:

- por **debajo del mínimo** → error inline del campo, sin precio y **sin** CTA de presupuesto manual;
- por **encima del máximo** → presupuesto manual con el motivo real.

El dominio ya la reflejaba (`SizeRange.assess`: `requiresManualQuote` solo es `true` con violaciones
`*_above_maximum`). Sin embargo, `calculateQuotePrice` devolvía `size_below_series_min` con
`manual_quote_required` → `uncovered_configuration`, y `docs/api.md` lo documentaba así. La vista, en
consecuencia, ofrecía el formulario de presupuesto manual ante una medida por debajo del mínimo.

La revisión de conformidad de CIF-7 (`conformidad-configurador` rev 2 §6, hallazgo 1) marcó la
divergencia como **Alta**: el contrato del API contradecía la regla de diseño y el propio dominio.

## Decisión

1. Una configuración cuyo único problema de tamaño es **no llegar al mínimo** de la serie no es un
   presupuesto manual: es una **medida inválida para esa serie**.
2. `calculateQuotePrice` lanza `InvalidMeasurementError` en ese caso y el borde HTTP responde
   **`400 INVALID_MEASUREMENT`**. No se emite precio ni presupuesto manual.
3. Por **encima del máximo** se mantiene `manual_quote_required` con `size_exceeds_series_max`. Si
   coexisten ambos sentidos, **prevalece el máximo** (el motivo nombra solo la medida que lo supera) y
   la vista muestra además el error inline del mínimo.
4. El hecho `size_below_series_min` **desaparece** del vocabulario de presupuesto manual (dominio,
   `ManualQuoteReasons` de `messages/<locale>.json` y tests): ya no es un caso de presupuesto manual.
5. El configurador valida el mínimo **en local** con las mismas invariantes (`SizeRange.assess`) y ni
   siquiera pide precio; el 400 del API queda como red de seguridad para otros consumidores.

## Consecuencias

- El cliente ve un error accionable bajo el campo y no un formulario de contacto que no puede resolver
  su caso.
- **Cambio incompatible del contrato**: una petición que antes recibía `200 manual_quote_required`
  con `uncovered_configuration` ahora recibe `400 INVALID_MEASUREMENT`. En el MVP no hay consumidores
  externos del API, solo el configurador (que ya valida en local).
- El mínimo de serie deja de necesitar traducción como motivo de presupuesto manual.
- El caso mixto (un eje por encima del máximo y otro por debajo del mínimo) mantiene el presupuesto
  manual y añade el error inline del eje por debajo.

## Alternativas consideradas

- **Mantener el contrato y cambiar la regla de diseño**: descartado; la regla D1 está aprobada y el
  dominio ya codificaba lo contrario al motor.
- **`200` con un estado propio `measurement_below_minimum`**: descartado por ampliar el contrato sin
  necesidad. Una entrada inválida para la serie es un `400`, y el configurador ya valida en local.
- **Reutilizar `uncovered_configuration` con otro código HTTP**: descartado; mantendría el mismo
  motivo para dos caminos distintos y la ambigüedad que originó el hallazgo.
