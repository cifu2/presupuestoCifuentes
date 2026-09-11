import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
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
