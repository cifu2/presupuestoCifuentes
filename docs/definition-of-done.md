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
      en el mismo PR.
- [ ] **3. Revisión de otro agente.** Al menos un agente distinto del autor revisa el PR y lo
      aprueba. El autor no se auto-aprueba.
- [ ] **4. CI en verde.** `calidad` y `e2e` (checks requeridos en `main`) pasan.

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

| Tipo                     | Además de la puerta obligatoria                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Dominio / precios        | Casos de la tabla de decisión cubiertos, incluidos los caminos "a consultar" y redondeos                    |
| API / route handlers     | Contrato documentado, validación de entrada, códigos de error estables y test de integración                |
| UI (configurador, panel) | E2E del flujo, estados vacío/carga/error, i18n y responsive                                                 |
| PDF / email              | Test del render y del envío con adaptador falso; reintento probado                                          |
| Infraestructura / DevOps | Procedimiento documentado ([despliegue.md](despliegue.md)), variable de entorno en Vercel, rollback probado |
| Documentación / ADR      | Enlace desde el índice y desde la tarea; revisado por el CTO                                                |

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
