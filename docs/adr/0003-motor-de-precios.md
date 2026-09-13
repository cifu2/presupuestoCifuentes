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
   hay como máximo una versión vigente por serie. La versión vigente se cierra automáticamente al
   publicar su sucesora (revisión 2).
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

## Revisión 2 (2026-09-13): publicar cierra la predecesora de vigencia abierta

**Decide:** CTO (CIF-523), a petición de Backend en la revisión del criterio 1 de CIF-9.

La decisión 1 dejaba implícito qué ocurre con la versión que estaba vigente cuando se publica su
sucesora. El caso normal en producción es una versión publicada con **vigencia abierta**
(`validUntil` vacío) y hoy `publishTariffVersion` la rechaza: la candidata se solapa con ella
(`assertNoOverlappingPublishedTariffs` → `409 AMBIGUOUS_TARIFF`) y no existe ningún caso de uso que
la cierre (`TariffVersion.archive()` está en el dominio, pero sin caso de uso, ruta ni botón). Con
la vigencia abierta el propietario **no puede publicar** su versión siguiente, así que el criterio 1
de CIF-9 («cambia un precio y se refleja en el configurador en menos de 5 minutos sin tocar código»)
no se cumple sobre series ya publicadas.

### Decisión

8. **Publicar cierra la predecesora de vigencia abierta.** Al publicar una candidata, el caso de uso
   `publishTariffVersion` cierra —en la **misma escritura atómica**— la versión publicada de la
   misma serie que (i) sigue con vigencia abierta y (ii) empieza antes que la candidata, fijando su
   `validUntil` en el `validFrom` de la candidata. El intervalo es semiabierto, así que no hay hueco
   ni solape: la predecesora deja de estar vigente exactamente cuando entra la sucesora. La
   predecesora **conserva el estado `published`** (es el registro histórico del precio que estuvo
   vigente); no se archiva y no se borra.
9. **Solo se cierra una predecesora, y solo si el cierre es válido.** Siguen fallando cerrado (409
   `AMBIGUOUS_TARIFF`, sin tocar ninguna fila) los casos que hoy fija la invariante: solape con una
   versión publicada de vigencia **cerrada**, candidata con `validFrom` **anterior o igual** al de
   la predecesora abierta (cerrar hacia atrás sería inválido) y más de una versión publicada abierta
   en la misma serie. La decisión no relaja la invariante: la evalúa sobre el conjunto
   **proyectado** (candidata publicada + predecesora cerrada).
10. **Una sola operación de escritura.** El puerto de tarifas gana una operación explícita que
    persiste el cierre y la publicación de forma atómica (nombre a elección de Backend, p. ej.
    `savePublishTransition`), implementada en Prisma con una transacción: si falla, no queda ni el
    cierre ni la publicación a medias. La validación sigue **antes** de escribir (hallazgo N5 de
    CIF-78) y el cierre se calcula en el dominio: `ValidityPeriod` gana el cierre explícito y
    `TariffVersion` el método que lo aplica, solo desde `published` y solo con una fecha posterior a
    su `validFrom`.
11. **Los presupuestos emitidos no cambian.** La decisión 6 sigue intacta: el presupuesto guarda su
    `tariffVersionId` y su instantánea, así que cerrar o publicar tarifas no reescribe precios ya
    emitidos.
12. **El panel dice la verdad.** La confirmación de publicación del panel (CIF-243) anuncia la fecha
    de entrada en vigor de la versión nueva y que la anterior deja de estar vigente en ese instante;
    el aviso de `TARIFF_NOT_EDITABLE` no puede prometer una salida que no exista. Cargar la tabla de
    precios sigue siendo obligatorio antes de publicar (`EmptyPriceTableError`).

### Consecuencias

- El propietario cambia precios en **un solo paso** sobre una serie publicada, sin ventana en la que
  la serie se quede sin tarifa vigente y pase a presupuesto manual.
- `publishTariffVersion` pasa a ser una escritura de dos filas: hay que revisar los tests y el E2E
  que hoy fijan el 409 para el solape con una vigencia abierta (`publish-tariff-version.test.ts`,
  `repositories.test.ts`, `e2e/admin-tariff-publish.spec.ts`) y añadir el caso nuevo: candidata
  sobre predecesora abierta → 200, predecesora cerrada en la fecha de entrada y configurador
  sirviendo el precio nuevo. El catálogo de demo necesita una predecesora abierta para el camino
  feliz.
- La restricción de exclusión de la base (CIF-89) sigue siendo la última red y **no cambia**: el
  rango cerrado ya no solapa con el de la sucesora.

### Alternativas consideradas

- **(b) Caso de uso `archiveTariffVersion` aparte.** Descartada: dos acciones en el panel y una
  ventana en la que la serie no tiene tarifa vigente, de modo que el configurador degrada a
  presupuesto manual entre ambos pasos.
- **(c) Dejar la creación de versiones fuera del MVP.** Descartada: rebaja la promesa del criterio 1
  de CIF-9, que es el objetivo del panel de administración.
