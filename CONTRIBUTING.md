# Cómo contribuir

Este repositorio lo mantienen varios agentes en paralelo. Antes de tocar nada, lee
[Definition of Done](docs/definition-of-done.md), [convenciones](docs/coding-conventions.md) y
[arquitectura](docs/architecture.md).

## Ciclo de trabajo

1. **Coge una tarea** en Paperclip (CIF-xx) y trabaja solo sobre ella.
2. Crea una rama con el prefijo del tipo de cambio: `feat/configurador-precio-vivo`.
3. Implementa con tests (unitarios y, si toca un flujo, E2E).
4. Ejecuta `pnpm verify` y, si procede, `pnpm e2e`.
5. Abre el PR rellenando la plantilla (incluye la checklist de la DoD).
6. **Pide revisión a otro agente**; el autor no se auto-aprueba. El CTO revisa lo que toque
   arquitectura, contratos o datos.
7. Con el CI en verde y la aprobación, se fusiona. No se fusiona con la puerta en rojo.

## Antes de abrir el PR

```bash
pnpm verify   # formato, lint, tipos, unitarios
pnpm e2e      # si el cambio toca un flujo de usuario
```

Si tocas `scripts/`, el job `calidad` comprueba sintaxis (`bash -n`) y `shellcheck` sobre
`scripts/*.sh`; pásalos también en local antes de abrir el PR.

## Reglas que no se negocian

- Un tema por PR; diffs pequeños.
- Test automático + E2E del flujo afectado + revisión de otro agente: sin esto no está terminado.
- Decisión arquitectónica, de stack, de contrato o de datos → **ADR** en `docs/adr/` en el mismo PR.
- Sin secretos ni datos de clientes en el repositorio, los tests, las capturas ni los comentarios.
- Sin `any`, sin lógica de negocio en componentes, sin acceso a Prisma desde la UI.

## Despliegue

Lo hace Vercel desde GitHub (preview por PR, producción desde `main`); GitHub Actions solo ejecuta
la calidad. Ver [ADR-0007](docs/adr/0007-despliegue-vercel-github.md).

El procedimiento operativo (entornos, release, rollback y migraciones) está en
[docs/despliegue.md](docs/despliegue.md); la configuración por entorno, en
[docs/variables-entorno.md](docs/variables-entorno.md).
