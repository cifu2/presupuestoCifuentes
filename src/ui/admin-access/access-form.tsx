'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export interface AccessFormLabels {
  readonly password: string
  readonly submit: string
  readonly submitting: string
  readonly invalid: string
  readonly unavailable: string
  readonly disabled: string
}

type Status = 'idle' | 'submitting' | 'invalid' | 'unavailable'

type AccessFormProps = {
  readonly labels: AccessFormLabels
  readonly next: string
  readonly disabled: boolean
}

/**
 * Formulario de acceso del panel (CIF-241). La comprobación de la credencial ocurre **solo** en el
 * servidor (`POST /api/admin/session`): aquí no hay ningún secreto ni comparación.
 */
export function AccessForm({ labels, next, disabled }: AccessFormProps) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setStatus('submitting')

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      })

      if (response.ok) {
        setPassword('')
        router.replace(next)
        router.refresh()

        return
      }

      setPassword('')
      setStatus(response.status === 401 ? 'invalid' : 'unavailable')
    } catch {
      setStatus('unavailable')
    }
  }

  if (disabled) {
    return (
      <p
        data-testid="access-disabled"
        className="rounded-lg border border-brand-500/30 bg-white p-4"
      >
        {labels.disabled}
      </p>
    )
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="access-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label className="flex flex-col gap-2 font-medium text-brand-900">
        {labels.password}
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          autoFocus
          data-testid="access-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-brand-500/40 px-3 py-2 font-normal"
        />
      </label>

      {status === 'invalid' || status === 'unavailable' ? (
        <p role="alert" data-testid="access-error" className="text-red-700">
          {status === 'invalid' ? labels.invalid : labels.unavailable}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="access-submit"
        disabled={status === 'submitting'}
        className="self-start rounded-md bg-brand-900 px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {status === 'submitting' ? labels.submitting : labels.submit}
      </button>
    </form>
  )
}
