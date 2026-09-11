/**
 * Puerto de generación de identificadores.
 *
 * Los casos de uso no llaman a `crypto.randomUUID()` directamente: piden un id por este puerto
 * para poder testear con identificadores fijos y deterministas.
 */
export interface IdGenerator {
  nextId(): string
}
