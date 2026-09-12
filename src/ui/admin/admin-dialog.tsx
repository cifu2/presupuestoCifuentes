'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * `Modal` / `Sheet` del panel (`sistema-de-diseno` §5).
 *
 * Es un `<dialog>` nativo: el navegador atrapa el foco, cierra con `Esc` y bloquea el fondo. El
 * scrim vive en `admin.css` como `var(--color-scrim)` (M1 de CIF-101): ningún componente escribe el
 * color del backdrop. En móvil el CSS lo convierte en hoja inferior.
 */
export function AdminDialog({
  dialogId,
  title,
  isOpen,
  onClose,
  children,
}: {
  dialogId: string
  title: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog === null) {
      return
    }

    if (isOpen && !dialog.open) {
      dialog.showModal()
    }

    if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  return (
    <dialog
      ref={dialogRef}
      id={dialogId}
      className="admin-dialog"
      aria-labelledby={`${dialogId}-title`}
      onCancel={onClose}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 id={`${dialogId}-title`} className="text-lg font-semibold text-brand-900">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  )
}
