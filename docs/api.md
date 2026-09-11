# API de catálogo y presupuestos (CIF-4)

Contrato público que consumen el configurador (CIF-7) y el panel (CIF-9). Implementación:
route handlers de `src/app/api/**` → casos de uso de `src/application/use-cases` → dominio.
Decisiones de precio: [ADR-0003](adr/0003-motor-de-precios.md) y
[ADR-0011](adr/0011-tarifas-modificadores-y-presupuestos.md).

## Convenciones

- Todas las respuestas son JSON y usan **camelCase**.
- Los importes viajan como **cadena decimal exacta** con su moneda:
  `{ "amount": "914.76", "currency": "EUR" }`. Nunca como número en coma flotante.
- Las fechas son ISO 8601 en UTC.
- Las medidas son milímetros enteros (1–10000).
- El `locale` (`es` | `en`) se pasa por query (`?locale=en`) o en el cuerpo. Los textos sin traducción
  caen al idioma por defecto del catálogo.
- Errores con forma estable:

```json
{ "error": { "code": "NOT_FOUND", "message": "No existe ninguna serie publicada con slug \"x\"" } }
```

En errores de validación se añade `issues: [{ "path": "widthMm", "message": "…" }]`.

### Códigos de error

| `code`                            | HTTP | Cuándo                                                   |
| --------------------------------- | ---- | -------------------------------------------------------- |
| `VALIDATION_ERROR`                | 400  | El cuerpo o el `locale` no cumple el contrato (Zod)      |
| `INVALID_JSON`                    | 400  | El cuerpo no es JSON                                     |
| `INVALID_VALUE`                   | 400  | Regla del dominio incumplida (configuración incoherente) |
| `INVALID_MEASUREMENT`             | 400  | Medida fuera de 1–10000 mm                               |
| `INVALID_SIZE_RANGE`              | 400  | Rango de medidas incoherente                             |
| `INVALID_CATALOG_VALUE`           | 400  | Código, slug o dato de catálogo con formato inválido     |
| `INVALID_CATALOG_TEXT`            | 400  | Texto de catálogo sin el idioma por defecto              |
| `UNSUPPORTED_LOCALE`              | 400  | Idioma guardado no soportado                             |
| `INVALID_VALIDITY_PERIOD`         | 400  | Vigencia de tarifa incoherente                           |
| `INVALID_TARIFF`                  | 400  | Tabla de precios incoherente (bandas solapadas, etc.)    |
| `INVALID_MANUAL_QUOTE_REQUEST`    | 400  | Solicitud manual incompleta                              |
| `INVALID_QUOTE`                   | 400  | Presupuesto con desglose incoherente                     |
| `INVALID_QUOTE_REFERENCE`         | 400  | Referencia con formato distinto de `PC-AAAA-NNNNNN`      |
| `NOT_FOUND`                       | 404  | Serie o presupuesto inexistente                          |
| `AMBIGUOUS_TARIFF`                | 409  | Más de una tarifa vigente para la misma serie            |
| `INVALID_CATALOG_TRANSITION`      | 409  | Transición de estado no permitida en el catálogo         |
| `INVALID_SERIES_TRANSITION`       | 409  | Transición de estado no permitida en una serie           |
| `INVALID_MANUAL_QUOTE_TRANSITION` | 409  | Transición no permitida en una solicitud manual          |
| `INVALID_QUOTE_TRANSITION`        | 409  | Transición de estado no permitida en un presupuesto      |
| `INTERNAL_ERROR`                  | 500  | Error inesperado (nunca se devuelve el detalle)          |

## Modos de ejecución

- **`prisma`**: con `DATABASE_URL` configurada, los datos viven en PostgreSQL.
- **`demo`**: sin `DATABASE_URL` o con `CATALOG_DEMO_MODE=true`, la API sirve un catálogo de
  demostración **inventado** desde adaptadores en memoria (desarrollo, E2E y demo sin base de datos).
  Los presupuestos y solicitudes no se persisten entre reinicios.

`GET /api/catalog/series` devuelve `meta.mode` para hacerlo visible.

---

## GET /api/catalog/series

Series publicadas, ordenadas por `sortOrder`.

| Query    | Tipo     | Por defecto | Descripción          |
| -------- | -------- | ----------- | -------------------- |
| `locale` | `es\|en` | `es`        | Idioma de los textos |

```json
{
  "data": [
    {
      "id": "…",
      "code": "CI-100",
      "slug": "ci-100",
      "name": "Serie CI-100",
      "description": "Puerta de paso interior con acabado a elegir",
      "sizeRange": {
        "minWidthMm": 600,
        "maxWidthMm": 1000,
        "minHeightMm": 1800,
        "maxHeightMm": 2200
      },
      "allowedFinishIds": ["…"],
      "allowedAccessoryIds": ["…"]
    }
  ],
  "meta": { "locale": "es", "mode": "prisma" }
}
```

## GET /api/catalog/series/:slug

Ficha de una serie publicada: acabados con sus colores publicados y accesorios compatibles. Los
elementos retirados del catálogo no aparecen. `404 NOT_FOUND` si el slug no existe o la serie no
está publicada.

```json
{
  "data": {
    "series": { "…": "igual que en el listado" },
    "finishes": [
      {
        "id": "…",
        "code": "LACADO",
        "name": "Lacado",
        "description": null,
        "colors": [{ "id": "…", "code": "RAL-9010", "name": "Blanco puro", "hex": "#F1EDE1" }]
      }
    ],
    "accessories": [
      {
        "id": "…",
        "code": "MANILLA-A",
        "name": "Manilla de acero",
        "description": null,
        "category": "hardware"
      }
    ]
  },
  "meta": { "locale": "es", "mode": "prisma" }
}
```

---

## POST /api/quotes/price

Precio en vivo del configurador. El cálculo lo hace **siempre el servidor**; el cliente solo pinta
la respuesta.

Cuerpo:

| Campo          | Tipo                                    | Obligatorio | Descripción                          |
| -------------- | --------------------------------------- | ----------- | ------------------------------------ |
| `seriesSlug`   | string                                  | sí          | Slug de la serie (`ci-100`)          |
| `widthMm`      | entero 1–10000                          | sí          | Ancho en mm                          |
| `heightMm`     | entero 1–10000                          | sí          | Alto en mm                           |
| `finishId`     | string \| null                          | no (`null`) | Acabado elegido                      |
| `colorId`      | string \| null                          | no (`null`) | Color; exige `finishId`              |
| `accessoryIds` | string[]                                | no (`[]`)   | Accesorios; sin repetidos            |
| `extras`       | `installation`\|`shipping`\|`urgency`[] | no (`[]`)   | Extras contratados                   |
| `discountCode` | string \| null                          | no (`null`) | Código de descuento (`PROMO10`)      |
| `locale`       | `es\|en`                                | no (`es`)   | Idioma del desglose y de los motivos |

Respuesta con precio (`200`):

```json
{
  "status": "priced",
  "series": { "id": "…", "code": "CI-100", "slug": "ci-100", "name": "Serie CI-100" },
  "tariff": {
    "id": "…",
    "versionNumber": 1,
    "validFrom": "2026-01-01T00:00:00.000Z",
    "validUntil": null
  },
  "breakdown": {
    "currency": "EUR",
    "lines": [
      {
        "code": "base",
        "label": null,
        "kind": "base",
        "units": 1,
        "unitAmount": { "amount": "718.20", "currency": "EUR" },
        "amount": { "amount": "718.20", "currency": "EUR" }
      }
    ],
    "basePrice": { "amount": "718.20", "currency": "EUR" },
    "subtotal": { "amount": "718.20", "currency": "EUR" },
    "taxRatePercent": "21.00",
    "taxAmount": { "amount": "150.82", "currency": "EUR" },
    "total": { "amount": "869.02", "currency": "EUR" }
  }
}
```

Respuesta sin precio automático (`200`), con el paso a presupuesto manual:

```json
{
  "status": "manual_quote_required",
  "seriesId": "…",
  "seriesCode": "CI-100",
  "reason": "size_exceeds_series_max",
  "detail": "La medida 1500×2100 mm supera el máximo de la serie \"CI-100\" (1000×2200 mm)"
}
```

| `reason`                  | Significado                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `size_exceeds_series_max` | La medida supera el tamaño máximo (o el mínimo) de la serie    |
| `no_tariff_in_force`      | La serie no tiene tarifa publicada vigente o le faltan precios |
| `uncovered_configuration` | Acabado, color, accesorio o banda no cubiertos por la serie    |
| `customer_requested`      | El cliente pide expresamente que le llamen                     |

### Reglas de cálculo

1. **Medida**: por encima del máximo (o por debajo del mínimo) de la serie → presupuesto manual
   (`size_exceeds_series_max` para el máximo, `uncovered_configuration` para el mínimo).
2. **Compatibilidad**: acabado, color y accesorios deben estar permitidos por la serie; el color debe
   pertenecer al acabado elegido.
3. **Precio base** según la estrategia de la tarifa vigente: por m² (`precio × superficie`), por
   bandas de medida (ancho × alto) o fijo.
4. **Superficie**: mm² → m² redondeando **al alza** a tres decimales (`333×333 mm = 0,111 m²`).
5. **Adiciones**: acabado, color, accesorios, instalación, portes y urgencia. `fixed` = importe una
   vez; `per_unit` = importe × unidades; `percentage` = porcentaje sobre el **precio base**.
6. **Descuentos**: `fixed` o `percentage`; el porcentual se aplica sobre el acumulado (base +
   adiciones). Ningún descuento deja el subtotal por debajo de cero.
7. **Impuestos**: `taxAmount = subtotal × taxRatePercent` y `total = subtotal + taxAmount`, con
   redondeo _half-up_ a céntimos.

## POST /api/quotes

Emite un presupuesto con el **precio congelado**. Mismo cuerpo que `/api/quotes/price`.

- `201` con `{ "status": "issued", "quote": { … } }` cuando hay precio.
- `200` con `{ "status": "manual_quote_required", "reason": "…" }` cuando hay que pasar a manual.
- Si existe una tarifa vigente pero la configuración no está cubierta, responde igualmente con el
  motivo; no se emite ningún presupuesto.

```json
{
  "status": "issued",
  "quote": {
    "id": "…",
    "reference": "PC-2026-000001",
    "status": "issued",
    "locale": "en",
    "seriesId": "…",
    "tariffVersionId": "…",
    "validUntil": "2026-10-11T10:00:00.000Z",
    "createdAt": "2026-09-11T10:00:00.000Z",
    "updatedAt": "2026-09-11T10:00:00.000Z",
    "configuration": {
      "seriesId": "…",
      "widthMm": 900,
      "heightMm": 2100,
      "finishId": null,
      "colorId": null,
      "accessoryIds": [],
      "extras": [],
      "discountCode": null
    },
    "totals": {
      "subtotal": { "amount": "718.20", "currency": "EUR" },
      "taxAmount": { "amount": "150.82", "currency": "EUR" },
      "total": { "amount": "869.02", "currency": "EUR" }
    },
    "breakdown": { "…": "mismo desglose que /api/quotes/price" }
  }
}
```

El presupuesto guarda `tariffVersionId`, la configuración y el desglose: publicar tarifas nuevas no
altera ningún presupuesto ya emitido (ADR-0003). El precio se recalcula en el servidor al emitir,
nunca se acepta el que envíe el cliente.

## GET /api/quotes/:reference

Presupuesto emitido por su referencia (`PC-2026-000001`). Los textos se devuelven en el idioma
**guardado** en el presupuesto. `404 NOT_FOUND` si no existe.

## POST /api/manual-quote-requests

Registra la solicitud para que el comercial contacte al cliente. El **motivo lo deriva el servidor**
volviendo a calcular el precio; solo se acepta `customer_requested` sin recálculo.

| Campo                                                                     | Tipo           | Obligatorio  | Descripción                                  |
| ------------------------------------------------------------------------- | -------------- | ------------ | -------------------------------------------- |
| `seriesSlug`                                                              | string \| null | según caso   | Obligatorio salvo `customerRequested: true`  |
| `widthMm`/`heightMm`                                                      | entero \| null | según caso   | Obligatorios salvo `customerRequested: true` |
| `finishId`, `colorId`, `accessoryIds`, `extras`, `discountCode`, `locale` | —              | no           | Igual que en el precio                       |
| `customerRequested`                                                       | booleano       | no (`false`) | El cliente pide que le llamen sin configurar |
| `contact.name`                                                            | string 2–120   | sí           |                                              |
| `contact.email`                                                           | email          | sí           |                                              |
| `contact.phone`                                                           | string \| null | no           |                                              |
| `contact.message`                                                         | string \| null | no           |                                              |

- `201` `{ "status": "created", "request": { "id", "reason", "status": "pending", "createdAt" } }`
- `200` `{ "status": "price_available", "seriesId", "seriesCode", "breakdown": { … } }` si la
  configuración sí tenía precio (el cliente debería haber pedido presupuesto normal).

Datos personales mínimos (nombre, email y, si se deja, teléfono) con la única finalidad de
contactar; no se registran en logs.

---

## Cómo probarlo

```bash
CATALOG_DEMO_MODE=true pnpm dev
curl -s 'http://localhost:3000/api/catalog/series?locale=en' | jq '.data[0].name'
curl -s -X POST http://localhost:3000/api/quotes/price \
  -H 'content-type: application/json' \
  -d '{"seriesSlug":"ci-100","widthMm":900,"heightMm":2100}' | jq '.breakdown.total'
```

Tests: unitarios del dominio y la aplicación en `src/domain/**/*.test.ts` y
`src/application/**/*.test.ts`; integración del borde en `src/app/api/**/*.test.ts`; integración de
los adaptadores Prisma en `src/infrastructure/persistence/prisma/repositories.test.ts`
(requiere `TEST_DATABASE_URL`); E2E en `e2e/catalog-api.spec.ts`.
