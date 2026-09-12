# Definition of Done (DoD)

> Aplicable a **todas** las tareas del MVP, de todos los agentes. Un cambio no está terminado
> porque "funciona en mi máquina": está terminado cuando cumple esta lista y el CI está en verde.
> Referencia: regla de oro del plan y ADR-0006.

## Puerta obligatoria (todo cambio)

- [ ] **1. Tests automáticos que lo cubren.** Reglas de negocio, casos de uso y adaptadores con
      lógica tienen tests unitarios o de integración. Cobertura ≥ 80 % en `src/domain` y
      `src/application` (lo verifica el CI).
- [ ] **2. E2E de los flujos afectados en verde.** Si el cambio toca un flujo de usuario, la suite
      Playwright correspondiente pasa (escritorio y móvil). Si el flujo no existía, el test se añade
      en el mismo PR. Los flujos detrás de una credencial de administración se validan en **CI**, con
      el servidor de pruebas de la propia suite; en el preview del PR solo se ejerce el camino
      público ([ADR-0025](adr/0025-validacion-via-envio-por-entorno.md)).
- [ ] **3. Revisión de otro agente.** Al menos un agente distinto del autor revisa el PR y lo
      aprueba. El autor no se auto-aprueba.
- [ ] **4. CI en verde.** `calidad` y `e2e` (checks requeridos en `main`) pasan.

## Cobertura del veredicto cuando el head se mueve

Un veredicto de gate (revisión aprobada + `calidad` y `e2e` verdes) cubre el head revisado y **se
extiende** al head posterior si y solo si se cumplen las tres condiciones:

- **a. El delta no toca runtime.** Del head revisado al head nuevo el diff solo contiene `docs/**` y
  ficheros `*.md` (la misma frontera que comprueba `scripts/docs-preview-guard.sh`). Quedan fuera
  `src/`, `prisma/`, `e2e/`, `vercel.json`, `.github/workflows/` y los manifiestos de dependencias
  (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`).
- **b. La puerta sigue verde sobre el head nuevo.** `calidad` y `e2e (puerta obligatoria)` pasan en el
  run del head nuevo.
- **c. Identidad de árbol al fusionar.** El squash comprueba `tree(main) == tree(head revisado)`
  ([ADR-0021](adr/0021-metodo-de-fusion-y-trazabilidad-squash.md) §2a).

Si (a) no se cumple, el gate **se reabre** y QA revalida los puntos del DoD afectados: no vale invocar
«era un merge de `main`».

La extensión la dictamina el revisor original (QA) por defecto; el CTO solo si el revisor no puede
correr (por ejemplo, con el runtime caído). La decisión se registra **en la tarea de Paperclip**, no
solo en el mensaje del commit.

Comprobación del delta de (a):

```bash
git diff --name-only <head-revisado>..<head-nuevo>
```

Esta regla no relaja la puerta obligatoria: tests, E2E y revisión de otro agente siguen siendo
obligatorios. Precedente: PR #39 (CIF-346).

## Checklist por área

### Código

- [ ] `pnpm verify` en verde en local (formato, lint, tipos, unitarios).
- [ ] Respeta los límites de capas del ADR-0001 (dominio sin framework, UI sin infraestructura).
- [ ] Sin `any`, sin `as` para silenciar tipos, sin lógica de negocio en componentes de React.
- [ ] Errores de dominio tipados y mensajes de usuario traducibles; nada de errores silenciados.

### Datos

- [ ] Si cambia el esquema: migración versionada en `prisma/migrations` y plan de reversión anotado
      en el PR.
- [ ] Los datos de catálogo y tarifas se gestionan por el panel; nunca se editan a mano en producción.

### Interfaz

- [ ] Estados vacío, carga y error contemplados (no solo el camino feliz).
- [ ] Accesible: navegación con teclado, etiquetas en formularios, contraste suficiente.
- [ ] Sin literales de interfaz hardcodeados: todos los textos pasan por i18n, con claves presentes
      en **todos** los idiomas soportados (ADR-0005).
- [ ] Responsive: se comprueba al menos en móvil (proyecto `movil` de Playwright).

### PDF y email

- [ ] El presupuesto se persiste **antes** de generar el PDF o enviar el email (ADR-0004).
- [ ] Un fallo de PDF/email no pierde el presupuesto y se puede reintentar sin duplicar envíos.
- [ ] El PDF y el email salen en el idioma guardado en el presupuesto.
- [ ] La entrega y el reintento se prueban con el adaptador de email de pruebas en CI (servidor de
      administración); no se exigen en el preview del PR, que solo valida emisión y descarga del PDF
      ([ADR-0025](adr/0025-validacion-via-envio-por-entorno.md)).

### Seguridad y privacidad

- [ ] Sin secretos, credenciales ni datos de clientes en código, tests, capturas, comentarios ni
      documentación. Los secretos viven en Vercel (ADR-0007).
- [ ] Entrada validada en los bordes (Zod) y autorización comprobada en el servidor, no en el cliente.
- [ ] Si se tratan datos personales: base legal, consentimiento y minimización revisados (RGPD).
- [ ] Logs sin datos personales identificables.

### Documentación

- [ ] Si la decisión es arquitectónica, de stack, de contrato o de datos: **ADR** en `docs/adr/`
      (plantilla en `docs/adr/README.md`).
- [ ] README o `docs/` actualizados si cambia el comportamiento o el procedimiento.
- [ ] La tarea de Paperclip queda con el enlace al PR y el resumen de lo verificado.

## Definición de Terminado por tipo de tarea

| Tipo                     | Además de la puerta obligatoria                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Dominio / precios        | Casos de la tabla de decisión cubiertos, incluidos los caminos "a consultar" y redondeos                                 |
| API / route handlers     | Contrato documentado, validación de entrada, códigos de error estables y test de integración                             |
| UI (configurador, panel) | E2E del flujo, estados vacío/carga/error, i18n y responsive                                                              |
| PDF / email              | Test del render y del envío con adaptador falso; reintento probado                                                       |
| Infraestructura / DevOps | Procedimiento documentado ([despliegue.md](despliegue.md)), variable de entorno en Vercel, rollback probado (2026-09-11) |
| Documentación / ADR      | Enlace desde el índice y desde la tarea; revisado por el CTO                                                             |

## Cuándo una tarea NO está terminada

- El CI está en rojo o hay tests desactivados (`skip`, `only`, `fixme`) sin acuerdo del CTO.
- El E2E del flujo afectado no existe o no se ha ejecutado.
- Falta la revisión de otro agente.
- Se ha tomado una decisión arquitectónica sin ADR.
- Hay un `TODO` que deja el flujo a medias sin tarea hija que lo cubra.

## Excepciones

Solo el CTO puede aceptar una excepción, y debe quedar escrita en el PR con el motivo, el riesgo
asumido y la tarea hija que lo resuelve. Una excepción temporal no puede convertirse en la norma:
si se repite, se cambia la DoD o se arregla la causa.

Una excepción de **método de fusión** se acoge al procedimiento de
[ADR-0021](adr/0021-metodo-de-fusion-y-trazabilidad-squash.md): la fusión a `main` es siempre
squash, el mensaje del commit registra `Head revisado: <sha40>` y la aceptación exige identidad de
árbol con el head revisado, `calidad` + `e2e` en verde sobre ese head y la revisión registrada en la
tarea. Los cambios temporales de los ajustes del repositorio (método de fusión o protección de rama)
necesitan autorización del CTO y se verifican con el comando de `docs/despliegue.md` §2.1 antes de
cerrar.
