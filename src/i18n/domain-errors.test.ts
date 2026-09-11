import { describe, expect, it } from 'vitest'

import {
  DOMAIN_ERRORS_NAMESPACE,
  TRANSLATED_DOMAIN_ERROR_CODES,
  domainErrorMessageKey,
} from './domain-errors'

describe('mensajes de error de dominio', () => {
  it('construye la clave de traducción a partir del código', () => {
    expect(DOMAIN_ERRORS_NAMESPACE).toBe('DomainErrors')
    expect(domainErrorMessageKey('INVALID_MEASUREMENT')).toBe('DomainErrors.INVALID_MEASUREMENT')
  })

  it('lista cada código de error una sola vez', () => {
    expect(TRANSLATED_DOMAIN_ERROR_CODES.length).toBeGreaterThan(0)
    expect(new Set(TRANSLATED_DOMAIN_ERROR_CODES).size).toBe(TRANSLATED_DOMAIN_ERROR_CODES.length)
  })
})
