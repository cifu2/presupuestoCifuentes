# ADR-0016 — Alcance de tipos de puerta del MVP en el configurador 2D

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (revisión del modelo 2D v4, CIF-115)
- **Ámbito:** catálogo de tipos de puerta del MVP, configurador 2D y disparo del presupuesto manual

## Contexto

Revisión del CTO del modelo 2D v4 (CIF-115), que contrasta por primera vez la especificación con el
catálogo público real de Puertas Cifuentes (CIF-5).

## Decisión

1. El configurador del MVP pinta exactamente **5 tipos**: `abatible-1-hoja`, `abatible-2-hojas`,
   `entrada-acorazada`, `pivotante-1-hoja`, `pivotante-2-hojas`.
2. Los tres tipos de **garaje** (`seccional`, `basculante`, `enrollable`) van a **presupuesto manual** y
   **no se pintan**: el paso a manual se dispara por medida superior al máximo de la serie, nunca por tipo
   de producto, y el motor y las guías quedan fuera del MVP.
3. **`corredera`** y **`abatible-4-hojas`** quedan en `confirmar`: no se publican ni se implementan hasta
   que el propietario confirme que se fabrican (corredera) o cómo se compone la Pola de 4 hojas con fijos.
   Si confirma, entran por un ADR posterior que supersede a este.
4. El lado del eje de giro de las pivotantes es un atributo de pedido y debe poder reflejarse en la vista
   previa (hallazgo H9 de CIF-115).

## Consecuencias

- CIF-6 no implementa `garaje-*` ni `corredera`: alcance y caso peor de rendimiento recortados.
- El catálogo real (series, acabados, colores, herrajes) sigue pendiente del propietario (CIF-13).
- Este ADR se supersede si el propietario confirma corredera o la Pola de 4 hojas.

## Alternativas consideradas

- **Pintar los tres tipos de garaje en el MVP:** descartado; exige motor y guías, que quedan fuera del
  MVP, y no hay confirmación del propietario sobre esas series.
- **Disparar el presupuesto manual por tipo de producto:** descartado; el disparador es la medida
  superior al máximo de la serie, que es verificable y no depende del tipo.
- **Publicar `corredera` y `abatible-4-hojas` desde ya:** descartado; primero el propietario confirma que
  se fabrican y cómo se compone la Pola de 4 hojas con fijos. Entrarían por un ADR posterior.
