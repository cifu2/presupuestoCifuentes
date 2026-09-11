import { z } from 'zod'

/**
 * Flag booleano leído del entorno.
 *
 * `z.coerce.boolean()` aplica `Boolean(valor)`, así que la cadena `"false"` daría `true` (hallazgo
 * B1 de CIF-71). `z.stringbool()` interpreta el texto de verdad (`"true"`/`"1"`/`"yes"`/`"on"` y
 * sus negaciones) y rechaza valores ambiguos; la cadena vacía se trata como ausente para no romper
 * un despliegue con la variable definida sin valor.
 */
export const environmentFlag = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.stringbool().default(false),
)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  /** Días de validez de un presupuesto emitido (decisión de negocio, CIF-14). */
  QUOTE_VALIDITY_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Fuerza el catálogo de demostración en memoria aunque haya `DATABASE_URL`. */
  CATALOG_DEMO_MODE: environmentFlag,
})

export type Env = z.infer<typeof envSchema>

export const env: Env = envSchema.parse(process.env)

export type Environment = NonNullable<Env['VERCEL_ENV']> | Env['NODE_ENV']

/**
 * Entorno efectivo del despliegue. En Vercel manda `VERCEL_ENV` (`production`, `preview` o
 * `development`); fuera de Vercel (local, tests y CI) se usa `NODE_ENV`. Dentro de Vercel
 * `NODE_ENV` es `production` también en los previews, así que sin `VERCEL_ENV` el monitor no
 * podría distinguirlos.
 */
export function resolveEnvironment(source: Pick<Env, 'VERCEL_ENV' | 'NODE_ENV'>): Environment {
  return source.VERCEL_ENV ?? source.NODE_ENV
}
