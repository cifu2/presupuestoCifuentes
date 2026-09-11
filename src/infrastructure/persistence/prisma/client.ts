/**
 * Cliente Prisma configurado con el adaptador de PostgreSQL (Prisma 7).
 *
 * La URL viene de `DATABASE_URL`; si falta, el contenedor no construye estos adaptadores y usa el
 * catálogo de demostración en memoria (modo demostración).
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

let client: PrismaClient | null = null

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg(connectionString)

  return new PrismaClient({ adapter })
}

export function getPrismaClient(connectionString: string): PrismaClient {
  client ??= createPrismaClient(connectionString)

  return client
}
