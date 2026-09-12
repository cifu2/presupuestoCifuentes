/**
 * Puerto de sonda de la base de datos (ADR-0015 §5).
 *
 * El caso de uso de salud no conoce Prisma ni el driver: pide una comprobación trivial y el
 * adaptador real (infraestructura) es el único que sabe cómo se ejecuta. Así la sonda se puede
 * probar con un doble y la capa de aplicación sigue sin depender de infraestructura (ADR-0001).
 */
export type DatabaseHealth = 'ok' | 'unreachable'

export interface HealthProbe {
  /**
   * Comprueba que la base responde a una consulta trivial (`SELECT 1`).
   *
   * No lanza: devuelve `unreachable` si la consulta falla. El mensaje de error nunca se propaga ni
   * se registra con el detalle del driver, que puede contener la cadena de conexión.
   */
  ping(): Promise<DatabaseHealth>
}
