import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Button } from './Button'

export interface DialogProps {
  open: boolean
  /** Called for Esc, the close button and the backdrop. */
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Buttons, right-aligned at the bottom. */
  footer?: ReactNode
}

/**
 * A modal dialog on the native <dialog> element: the browser handles the focus trap,
 * Esc and returning focus. No library, so nothing injects styles past the CSP.
 * Use it sparingly (docs/ui-guidelines.md §5.6).
 */
export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click only catches the backdrop; keyboards close the dialog with Esc through the native cancel event
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40 max-sm:mt-auto max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description && (
          <div id={descriptionId} className="text-sm text-ink-muted">
            {description}
          </div>
        )}
        {children}
        {footer && <div className="flex flex-wrap justify-end gap-2 pt-1">{footer}</div>}
      </div>
    </dialog>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  /** Names the action and who it affects: "Delete this retro for everyone?" */
  title: string
  /** What will be lost. */
  description: ReactNode
  /** Repeats the verb: "Delete retro". */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

/** Asks before something that can't be undone (§5.5). Cancel has focus when it opens. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
