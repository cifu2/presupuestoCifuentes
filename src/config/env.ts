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

/**
 * Texto opcional del entorno: la cadena vacía o solo espacios se trata como ausente.
 *
 * En Vercel y en `.env.local` es fácil dejar una variable declarada sin valor; sin este tratamiento
 * una cadena vacía pasaría la validación y el valor "configurado" quedaría en blanco, que es peor
 * que no estar (por ejemplo, un remitente de email vacío).
 */
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
)

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['production', 'preview', 'development']).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  /** Días de validez de un presupuesto emitido (decisión de negocio, CIF-14). */
  QUOTE_VALIDITY_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Fuerza el catálogo de demostración en memoria aunque haya `DATABASE_URL`. */
  CATALOG_DEMO_MODE: environmentFlag,
  /**
   * Token compartido del API del panel (provisional, CIF-9/CIF-14). Sin él, los endpoints de
   * administración responden 503 y nunca quedan accesibles en abierto.
   */
  ADMIN_API_TOKEN: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  /**
   * Secreto de firma de la cookie de sesión del panel (CIF-241/ADR-0024). Sin él, la sesión de la
   * interfaz no existe y `/[locale]/admin/**` queda denegado.
   */
  ADMIN_SESSION_SECRET: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  /**
   * Credencial del propietario del panel (CIF-241/ADR-0024). El MVP tiene un único dueño: no hay
   * usuarios ni roles. Los mínimos de longitud los aplica la guarda (`admin-session.ts`), que falla
   * cerrada en vez de tumbar el sitio público.
   */
  ADMIN_PANEL_PASSWORD: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  /**
   * Remitente verificado del envío de presupuestos (p. ej. `Puertas Cifuentes <presupuestos@…>`).
   * **Sin esta variable no se envía correo real**: la aplicación usa el adaptador de consola
   * (ADR-0004 §4). Es un valor del propietario y vive en el entorno, nunca en el repositorio.
   */
  RESEND_FROM: optionalText,
  /** Clave del proveedor de email (Resend). Sin ella, el envío real no está disponible. */
  RESEND_API_KEY: optionalText,
  /** Destinatarios internos (buzón del comercial y copias), separados por comas. */
  QUOTE_INTERNAL_RECIPIENTS: optionalText,
  /** Datos fiscales que el propietario debe confirmar (CIF-14) para la cabecera del PDF. */
  QUOTE_ISSUER_NAME: optionalText,
  QUOTE_ISSUER_TAX_ID: optionalText,
  QUOTE_ISSUER_ADDRESS: optionalText,
  QUOTE_ISSUER_EMAIL: optionalText,
  QUOTE_ISSUER_PHONE: optionalText,
  QUOTE_ISSUER_WEBSITE: optionalText,
  /** Condiciones legales del presupuesto, una por línea. */
  QUOTE_CONDITIONS_ES: optionalText,
  QUOTE_CONDITIONS_EN: optionalText,
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
