# Registro de decisiones de arquitectura (ADR)

Cada decisión técnica relevante del proyecto queda registrada aquí, en el repositorio, antes o junto
con el cambio que la implementa. Un ADR **no se edita**: si la decisión cambia, se añade uno nuevo
que supersede al anterior y se marca el antiguo como `Superseded por ADR-XXXX`.

## Índice

| ADR                                                      | Decisión                                                    | Estado   |
| -------------------------------------------------------- | ----------------------------------------------------------- | -------- |
| [0001](0001-repositorio-unico-arquitectura-hexagonal.md) | Repositorio único con arquitectura hexagonal y SOLID        | Aceptado |
| [0002](0002-stack-definitivo.md)                         | Stack definitivo del MVP (versiones y herramientas)         | Aceptado |
| [0003](0003-motor-de-precios.md)                         | Motor de precios con tarifas versionadas y precio congelado | Aceptado |
| [0004](0004-presupuesto-pdf-y-email.md)                  | Presupuesto en PDF y por email                              | Aceptado |
| [0005](0005-idiomas-e-i18n.md)                           | Idiomas soportados y arquitectura de i18n                   | Aceptado |
| [0006](0006-calidad-y-ci.md)                             | Tests, cobertura y puerta de E2E en CI                      | Aceptado |
| [0007](0007-despliegue-vercel-github.md)                 | Despliegue en Vercel con el código en GitHub                | Aceptado |
| [0008](0008-esquema-datos-catalogo.md)                   | Esquema de datos del catálogo y migraciones reversibles     | Aceptado |
| [0009](0009-base-de-datos-gestionada-y-backups.md)       | Base de datos gestionada (Neon), backups y monitorización   | Aceptado |
| [0010](0010-puesta-en-produccion-i18n.md)                | Puesta en producción de la i18n mediante el PR #6           | Aceptado |
| [0011](0011-tarifas-modificadores-y-presupuestos.md)     | Desglose de tarifas, modificadores y precio congelado       | Aceptado |

## Cuándo hace falta un ADR

- Elección o cambio de stack, librería principal o proveedor.
- Cambios en los límites entre capas o en los contratos públicos (API, esquema de datos).
- Cualquier decisión de datos irreversible o con coste de marcha atrás.
- Seguridad, privacidad (RGPD) o tratamiento de datos personales.
- Cualquier decisión que otro agente pueda cuestionar dentro de tres meses.

## Plantilla

```markdown
# ADR-XXXX — Título de la decisión

- **Fecha:** YYYY-MM-DD
- **Estado:** Propuesto | Aceptado | Superseded por ADR-YYYY
- **Decide:** rol que decide (y quién debe confirmar, si aplica)
- **Ámbito:** qué parte del sistema afecta

## Contexto

Qué problema hay que resolver y qué restricciones existen.

## Decisión

Qué se decide, en afirmaciones numeradas y verificables.

## Consecuencias

Qué mejora, qué empeora y qué trabajo genera.

## Alternativas consideradas

Qué se descartó y por qué.
```
