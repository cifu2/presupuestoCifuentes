import { describe, expect, it } from 'vitest'

import { isAdminPanelAccessible, readAdminPanelFlag } from './admin-access'

describe('guarda de acceso del panel (ADR-0023 §5)', () => {
  it('cierra el panel en Production cuando no hay interruptor ni demostración', () => {
    expect(
      isAdminPanelAccessible({
        environment: 'production',
        isPanelEnabled: false,
        isDemoCatalog: false,
      }),
    ).toBe(false)
  })

  it('abre el panel en Production solo con el interruptor de entorno', () => {
    expect(
      isAdminPanelAccessible({
        environment: 'production',
        isPanelEnabled: true,
        isDemoCatalog: false,
      }),
    ).toBe(true)
  })

  it('abre el panel en el catálogo de demostración, que es la configuración del E2E', () => {
    expect(
      isAdminPanelAccessible({
        environment: 'production',
        isPanelEnabled: false,
        isDemoCatalog: true,
      }),
    ).toBe(true)
  })

  it.each(['development', 'test', 'preview'] as const)(
    'no cierra el panel en %s',
    (environment) => {
      expect(
        isAdminPanelAccessible({ environment, isPanelEnabled: false, isDemoCatalog: false }),
      ).toBe(true)
    },
  )

  it('lee el interruptor como booleano estricto, no como cadena truthy', () => {
    expect(readAdminPanelFlag({ ADMIN_PANEL_ENABLED: 'true' })).toBe(true)
    expect(readAdminPanelFlag({ ADMIN_PANEL_ENABLED: 'false' })).toBe(false)
    expect(readAdminPanelFlag({ ADMIN_PANEL_ENABLED: '' })).toBe(false)
    expect(readAdminPanelFlag({})).toBe(false)
  })
})
