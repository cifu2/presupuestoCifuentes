import type { ReactNode } from 'react'

/**
 * Piezas visuales del panel con los tokens de `sistema-de-diseno` §2. No llevan estado ni
 * traducciones: el texto siempre entra por props o por hijos.
 */

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500'

const BUTTON_BASE = `inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 py-2 text-sm font-semibold transition-colors duration-fast ease-standard ${FOCUS} disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-sunken disabled:text-ink-muted`

const BUTTON_VARIANTS = {
  primary: 'border-transparent bg-brand-800 text-ink-inverse hover:bg-brand-700',
  accent: 'border-transparent bg-accent-700 text-ink-inverse hover:bg-brand-800',
  secondary: 'border-border-strong bg-surface text-brand-800 hover:bg-surface-sunken',
  ghost: 'border-transparent bg-transparent text-brand-700 hover:bg-brand-100',
} as const

export type ButtonVariant = keyof typeof BUTTON_VARIANTS

export function buttonClass(variant: ButtonVariant = 'primary', extra = ''): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${extra}`.trim()
}

const BADGE_TONES = {
  neutral: 'bg-surface-sunken text-brand-700',
  brand: 'bg-brand-100 text-brand-800',
  info: 'bg-info-100 text-info-600',
  success: 'bg-success-100 text-success-600',
  warning: 'bg-warning-100 text-warning-600',
  danger: 'bg-danger-100 text-danger-600',
} as const

export type BadgeTone = keyof typeof BADGE_TONES

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

const ALERT_TONES = {
  info: 'bg-info-100 text-info-600',
  success: 'bg-success-100 text-success-600',
  warning: 'bg-warning-100 text-warning-600',
  danger: 'bg-danger-100 text-danger-600',
} as const

export type AlertTone = keyof typeof ALERT_TONES

export function Alert({
  tone = 'info',
  role = 'status',
  children,
}: {
  tone?: AlertTone
  role?: 'status' | 'alert'
  children: ReactNode
}) {
  return (
    <p className={`rounded-control px-4 py-3 text-sm ${ALERT_TONES[tone]}`} role={role}>
      {children}
    </p>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-4 shadow-sm sm:p-6 ${className}`.trim()}
    >
      {children}
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold text-brand-900 sm:text-3xl">{title}</h1>
      {children}
    </div>
  )
}

export function HelpText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>
}

export function EmptyState({
  icon,
  title,
  help,
  children,
}: {
  icon: string
  title: string
  help: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      <span aria-hidden="true" className="text-3xl">
        {icon}
      </span>
      <p className="font-semibold text-brand-900">{title}</p>
      <HelpText>{help}</HelpText>
      {children}
    </div>
  )
}

/**
 * Esqueleto de carga con `role="status"`: anuncia la espera sin depender del color. El texto
 * accesible entra por prop porque el panel no escribe literales de texto.
 */
export function TableSkeleton({
  label,
  rows = 5,
  columns = 6,
}: {
  label: string
  rows?: number
  columns?: number
}) {
  return (
    <div className="rounded-card border border-border bg-surface p-4" role="status">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex gap-3">
            {Array.from({ length: columns }, (_, column) => (
              <div
                key={column}
                className="h-6 flex-1 animate-pulse rounded-control bg-surface-sunken"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Sección del panel todavía sin CRUD (fase 3): solo título y ayuda. */
export function SectionPlaceholder({ title, help }: { title: string; help: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <Card>
        <HelpText>{help}</HelpText>
      </Card>
    </div>
  )
}
