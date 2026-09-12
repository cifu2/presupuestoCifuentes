# ADR-0020 — El configurador es data-driven: el contenido de catálogo no es un gate de diseño

- **Fecha:** 2026-09-12
- **Estado:** Aceptado
- **Decide:** CTO (decisión de tablero registrada en CIF-182)
- **Ámbito:** configurador público (CIF-7), panel de administración (CIF-9), relación con el diseño (CIF-5)

## Contexto

CIF-5 (sistema de diseño, modelo visual 2D y prototipos) quedó en `in_review` con una única vía viva: la
interacción `design-validation-v2b` (`ask_user_questions`, `human_only`) con el propietario. Sus 6
preguntas son **contenido de catálogo editable** (tipos, acabados, identidad visual, mano por defecto y
mensaje de presupuesto manual), no trabajo de diseño ni de arquitectura.

El material visual ya está congelado y en producción: modelo 2D v5.1 (5 tipos, CIF-131 aprobada),
sistema de diseño rev 2, 42 tokens en `globals.css` (CIF-117), vista previa 2D (CIF-6) y API pública con
modo `demo` (CIF-4). Sin embargo CIF-7 colgaba de CIF-5 como bloqueante de dependencia dura, de modo que
el configurador no se podía ni `checkout` hasta que el propietario respondiera. CIF-9 colgaba del mismo
edge, aunque su restricción real es otra.

## Decisión

1. El contenido de catálogo (tipos de puerta, acabados, colores, accionamientos, medidas máximas, textos
   del paso a presupuesto manual) es **dato, no código**: entra por API o por datos sembrados y se
   administra desde el panel. Ningún cambio de contenido exige desplegar ni tocar el diseño.
2. El diseño congelado (modelo 2D v5.1, sistema de diseño rev 2, tokens) es la referencia visual. Las
   respuestas del propietario se incorporan como datos; si alguna exige un token o un tipo 2D nuevo, se
   abre su propio cambio con su revisión.
3. **Se retira el edge CIF-5 → CIF-7.** El gate de diseño no bloquea construir el configurador. CIF-5
   sigue siendo la fuente del contrato visual, pero su cierre depende solo de la respuesta del propietario.
4. El gate de CIF-9 se corrige a su dependencia real: **CIF-126** (modelo de escritura de catálogo /
   importador), que a su vez está bloqueada a propósito por la decisión de negocio **CIF-114** (escalada
   en CIF-168). El diseño no es lo que ata al panel.
5. Mientras no exista catálogo real validado, la implementación y los E2E corren contra el dataset
   `demo`/semilla provisional. Está prohibido fijar contenido de catálogo en el código del configurador.

## Consecuencias

- CIF-7 arranca ya, sin esperar al propietario; el coste de espera habría sido el MVP completo.
- El propietario puede seguir respondiendo sin prisa: sus respuestas entran como datos por el panel /
  importador, no como reapertura de diseño ni de implementación.
- Riesgo asumido: si el propietario responde con tipos o acabados que el modelo 2D v5.1 no cubre, hará
  falta un cambio acotado en el modelo 2D (con su ADR y su revisión de Diseño). El paso "medida máxima
  por serie → presupuesto manual" ya absorbe los casos fuera de catálogo.
- Obliga a mantener la separación hexagonal: el configurador consume puertos de catálogo/precio, y el
  dataset demo es una implementación más de esos puertos.

## Alternativas consideradas

- **Mantener el edge y entregar CIF-7 por hijas sin bloqueantes** (lo intentado hasta ahora): deja CIF-7
  y CIF-9 en `blocked` sin serlo, esconde la ruta real y depende de que cada agente recuerde el atajo.
- **Esperar a la respuesta del propietario antes de implementar**: el contenido pendiente es dato
  editable; esperar bloquea el MVP por una decisión que no cambia ni arquitectura ni diseño.
- **Retirar el edge CIF-5 → CIF-9 sin sustituirlo**: dejaría el panel desbloqueado antes de existir los
  puertos de escritura de catálogo (CIF-126), con el riesgo de construir sobre un contrato inexistente.
