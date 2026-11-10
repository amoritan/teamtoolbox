import { type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useId } from 'react'

interface FieldChrome {
  label: string
  /** Visually hidden label, for inputs whose purpose is clear from context. */
  hideLabel?: boolean
  hint?: string
  /** Shown after the field is left or the form is sent, never on the first keystroke. */
  error?: string
  /** Shows "12 / 280" once the text gets close to the limit. */
  maxLength?: number
  value: string
}

const control =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent aria-invalid:border-bad sm:text-sm'

function Chrome({
  id,
  label,
  hideLabel,
  hint,
  error,
  maxLength,
  value,
  children,
}: FieldChrome & { id: string; children: ReactNode }) {
  const showCount = maxLength !== undefined && value.length >= maxLength * 0.8
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium'}>
        {label}
      </label>
      {children}
      {(hint || error || showCount) && (
        <div className="flex justify-between gap-3 text-xs">
          <span id={`${id}-note`} className={error ? 'text-bad' : 'text-ink-muted'}>
            {error ?? hint}
          </span>
          {showCount && (
            <span className="shrink-0 text-ink-muted tabular-nums">
              {value.length} / {maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export type TextFieldProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'maxLength'>

export function TextField({
  label,
  hideLabel,
  hint,
  error,
  maxLength,
  value,
  className = '',
  ...props
}: TextFieldProps) {
  const id = useId()
  return (
    <Chrome {...{ id, label, hideLabel, hint, error, maxLength, value }}>
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        className={`${control} ${className}`}
        {...props}
      />
    </Chrome>
  )
}

export type TextAreaProps = FieldChrome &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'maxLength'>

export function TextArea({
  label,
  hideLabel,
  hint,
  error,
  maxLength,
  value,
  className = '',
  ...props
}: TextAreaProps) {
  const id = useId()
  return (
    <Chrome {...{ id, label, hideLabel, hint, error, maxLength, value }}>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        className={`${control} resize-none ${className}`}
        {...props}
      />
    </Chrome>
  )
}
