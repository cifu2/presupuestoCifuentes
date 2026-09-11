import { describe, expect, it } from 'vitest'

import { InvalidCatalogTransitionError } from '@/domain/shared/errors'

import {
  canTransitionCatalogStatus,
  assertCatalogTransition,
  isPublishedStatus,
} from './catalog-status'

describe('ciclo de vida de los elementos de catálogo', () => {
  it('permite las transiciones editoriales del panel', () => {
    expect(canTransitionCatalogStatus('draft', 'published')).toBe(true)
    expect(canTransitionCatalogStatus('published', 'draft')).toBe(true)
    expect(canTransitionCatalogStatus('published', 'archived')).toBe(true)
    expect(canTransitionCatalogStatus('archived', 'draft')).toBe(true)
  })

  it('rechaza volver a publicar sin pasar por borrador y los no-ops', () => {
    expect(canTransitionCatalogStatus('archived', 'published')).toBe(false)
    expect(canTransitionCatalogStatus('draft', 'draft')).toBe(false)
  })

  it('lanza un error tipado en transiciones no permitidas', () => {
    expect(() => assertCatalogTransition('archived', 'published')).toThrow(
      InvalidCatalogTransitionError,
    )
    expect(() => assertCatalogTransition('draft', 'published')).not.toThrow()
  })

  it('considera publicado solo el estado "published"', () => {
    expect(isPublishedStatus('published')).toBe(true)
    expect(isPublishedStatus('draft')).toBe(false)
    expect(isPublishedStatus('archived')).toBe(false)
  })
})
