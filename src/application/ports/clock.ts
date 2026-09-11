/**
 * Puerto de tiempo. El dominio y los casos de uso nunca llaman a `Date.now()`
 * directamente: piden la hora por este puerto para poder testear vigencias de
 * tarifas y caducidad de presupuestos de forma determinista.
 */
export interface Clock {
  now(): Date
}
