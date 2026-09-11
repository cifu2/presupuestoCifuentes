/**
 * Puerto de numeración de presupuestos.
 *
 * Devuelve el siguiente número correlativo dentro del año de emisión. El adaptador real lo saca
 * de una secuencia de PostgreSQL; en tests se inyecta un doble en memoria.
 */
export interface QuoteNumberSequence {
  next(year: number): Promise<number>
}
