import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // La API se prueba contra el catálogo de demostración en memoria (sin PostgreSQL).
    env: { CATALOG_DEMO_MODE: 'true' },
    // Los unitarios de las guardas del E2E viven junto a la suite (`e2e/support/*.test.ts`) para que
    // no se puedan separar del código que cubren; Playwright solo carga `*.spec.ts` (`testMatch`).
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'e2e/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/domain/**', 'src/application/**'],
      exclude: ['src/**/testing/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
