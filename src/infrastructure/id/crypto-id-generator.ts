import { randomUUID } from 'node:crypto'

import type { IdGenerator } from '@/application/ports/id-generator'

/** Adaptador real del puerto `IdGenerator`: UUID v4 del runtime de Node. */
export class CryptoIdGenerator implements IdGenerator {
  nextId(): string {
    return randomUUID()
  }
}
