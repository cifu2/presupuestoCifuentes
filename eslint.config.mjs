import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import { defineConfig, globalIgnores } from 'eslint/config'

const importBoundaries = (forbidden, message) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [{ group: forbidden, message }],
    },
  ],
})

const DOMAIN_MESSAGE =
  'La capa de dominio es pura: no puede depender de aplicación, infraestructura, UI ni framework.'
const APPLICATION_MESSAGE =
  'La capa de aplicación solo puede depender de dominio y de sus propios puertos.'
const INFRASTRUCTURE_MESSAGE =
  'La infraestructura implementa puertos; no puede depender de la UI ni de rutas de Next.'
const UI_MESSAGE =
  'La UI no habla directamente con infraestructura: usa un caso de uso a través de la raíz de composición.'

export default defineConfig([
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ['src/domain/**/*.ts'],
    rules: importBoundaries(
      ['@/application/*', '@/infrastructure/*', '@/composition/*', '@/app/*', '@/ui/*'],
      DOMAIN_MESSAGE,
    ),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: importBoundaries(
      ['@/infrastructure/*', '@/composition/*', '@/app/*', '@/ui/*'],
      APPLICATION_MESSAGE,
    ),
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: importBoundaries(['@/app/*', '@/ui/*'], INFRASTRUCTURE_MESSAGE),
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: importBoundaries(['@/infrastructure/*'], UI_MESSAGE),
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
