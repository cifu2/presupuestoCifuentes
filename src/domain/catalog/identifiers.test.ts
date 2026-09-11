import { describe, expect, it } from 'vitest'

import { InvalidCatalogValueError } from '@/domain/shared/errors'

import { assertCatalogCode, assertCatalogSlug } from './identifiers'

describe('assertCatalogCode', () => {
  it('acepta códigos estables en mayúsculas', () => {
    for (const code of ['CI-100', 'A1', 'PUERTA_EXTERIOR']) {
      expect(() => assertCatalogCode(code, 'code')).not.toThrow()
    }
  })

  it('rechaza minúsculas, espacios y longitudes fuera de rango', () => {
    for (const code of ['ci-100', 'A', 'CI 100', 'a'.repeat(33), 'CI/100']) {
      expect(() => assertCatalogCode(code, 'code')).toThrow(InvalidCatalogValueError)
    }
  })
})

describe('assertCatalogSlug', () => {
  it('acepta slugs en minúsculas separados por guiones', () => {
    for (const slug of ['ci-100', 'serie-exterior-premium', 'a1']) {
      expect(() => assertCatalogSlug(slug, 'slug')).not.toThrow()
    }
  })

  it('rechaza mayúsculas, guiones sueltos y slugs demasiado largos', () => {
    for (const slug of ['CI-100', '-ci-100', 'ci--100', 'ci_100', 'a'.repeat(81)]) {
      expect(() => assertCatalogSlug(slug, 'slug')).toThrow(InvalidCatalogValueError)
    }
  })
})
