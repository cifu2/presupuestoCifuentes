/**
 * Puerto de sonda de la base de datos (ADR-0015 §5).
 *
 * El caso de uso de salud no conoce Prisma ni el driver: pide una comprobación de la base y el
 * adaptador real (infraestructura) es el único que sabe cómo se ejecuta. Así la sonda se puede
 * probar con un doble y la capa de aplicación sigue sin depender de infraestructura (ADR-0001).
 */
export type DatabaseHealth = 'ok' | 'unreachable' | 'unmigrated'

export interface HealthProbe {
  /**
   * Comprueba que la base responde **y** que tiene el esquema de la aplicación migrado.
   *
   * - `ok`: la base responde y existe el historial de migraciones (`_prisma_migrations`) junto con
   *   el esquema de la aplicación.
   * - `unmigrated`: la base responde pero no tiene esquema o no tiene el historial de migraciones
   *   (el modo de fallo del incidente del 2026-09-11, ADR-0015 hechos 1-2). Una base vacía no debe
   *   darse por buena: `/api/catalog/series` devolvería 500.
   * - `unreachable`: la consulta falla o la base no responde.
   *
   * No lanza: devuelve un estado. El mensaje de error nunca se propaga ni se registra con el
   * detalle del driver, que puede contener la cadena de conexión.
   */
  ping(): Promise<DatabaseHealth>
}
