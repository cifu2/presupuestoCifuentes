# ADR-0003 — Motor de precios con tarifas versionadas y precio congelado

- **Fecha:** 2026-09-11
- **Estado:** Aceptado (la política comercial por serie la confirma el propietario, CIF-13)
- **Decide:** CTO
- **Ámbito:** dominio de precios y presupuestos

## Contexto

El plan deja abierto si el precio se calcula por m² + extras o con una tabla por modelo/medida +
extras. Además, el propietario debe poder cambiar precios sin tocar código, y un presupuesto ya
enviado no puede cambiar cuando se actualicen las tarifas.

## Decisión

1. **Modelo de tarifa versionada con vigencia.** Cada serie tiene una o varias versiones de tarifa
   con `validFrom`, `validUntil` (opcional) y estado (borrador/publicada/archivada). En cada momento
   hay como máximo una versión vigente por serie.
2. **El motor soporta las tres estrategias y se elige por serie** (así la decisión de negocio no
   condiciona el código):
   - precio base por m² × superficie,
   - tabla de precios por bandas de medida (ancho × alto),
   - precio fijo por modelo/medida.
     Sobre el precio base se aplican **modificadores**: acabado, color, accesorios, herrajes,
     instalación, portes, urgencia y descuentos, cada uno con su regla (importe fijo, porcentaje o
     precio por unidad).
3. **El cálculo es una función pura del dominio** (`src/domain/pricing`): recibe configuración,
   tarifa vigente y fecha, y devuelve un **desglose de líneas** con subtotal, impuestos y total. Es
   determinista y se testea con tabla de casos, sin base de datos ni framework.
4. **Nunca se inventa un precio.** Si falta tarifa vigente, la combinación no está cubierta o la
   medida supera el **tamaño máximo de la serie**, el resultado es `manual_quote_required` con el
   motivo, y el configurador pasa a solicitar presupuesto manual avisando al comercial.
5. **Redondeo explícito y testeado:** superficie en m² con 3 decimales redondeando **al alza**
   (siempre a favor del cálculo definido por el propietario) e importes en céntimos con redondeo
   _half-up_ mediante el objeto de valor `Money` (`bigint`, nunca `number`).
6. **Precio congelado.** Al emitir un presupuesto se guardan: `tariffVersionId`, el _snapshot_ de la
   configuración de entrada, el desglose y los totales. Un cambio posterior de tarifas no altera
   ningún presupuesto emitido.
7. **Dinero siempre en `Money`** (céntimos enteros). Prohibido `number` para importes y `float` para
   porcentajes; los porcentajes se convierten a fracción exacta.

## Consecuencias

- El propietario actualiza precios publicando una versión de tarifa nueva con su fecha de vigencia;
  el configurador usa siempre la vigente y los presupuestos antiguos quedan intactos.
- El IVA se calcula y se muestra explícitamente (desglose base + cuota), configurable por tarifa.
- Se necesitan tests unitarios de la tabla de decisión (una prueba por estrategia, por modificador,
  por redondeo y por los caminos de "a consultar").

## Pendiente de negocio (CIF-13)

- Qué estrategia usa cada serie y las tarifas vigentes con su fecha de entrada en vigor.
- Tamaño máximo por serie, regla de redondeo de m², IVA aplicable, portes/instalación incluidos o
  no, validez del presupuesto y política de descuentos.

## Alternativas consideradas

- **Precio calculado en el cliente (frontend):** rechazado por seguridad y porque el precio debe ser
  único y auditable; el cliente solo muestra el resultado que devuelve el servidor.
- **Tarifas en fichero de configuración del repo:** rechazado; el propietario debe poder cambiarlas
  desde el panel sin depender de nadie técnico.
