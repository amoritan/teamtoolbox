import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export interface ToastOptions {
  message: string
  /** An Undo (or similar) button. Toasts are never the only place an error appears. */
  action?: { label: string; onAction: () => void }
  /** At least 5 seconds (§5.4). */
  durationMs?: number
}

interface Feedback {
  /** Shows one toast at a time at the bottom of the screen, announced politely. */
  show: (toast: ToastOptions) => void
  /** Announces a change to screen readers without showing anything. */
  announce: (text: string) => void
}

const FeedbackContext = createContext<Feedback | null>(null)

export function useFeedback(): Feedback {
  const feedback = useContext(FeedbackContext)
  if (!feedback) throw new Error('useFeedback needs a <FeedbackProvider> above it')
  return feedback
}

/** Toasts and screen-reader announcements for everything below it (§2, §5.4). */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { key: number }) | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [paused, setPaused] = useState(false)
  const counter = useRef(0)

  const show = useCallback((next: ToastOptions) => {
    counter.current += 1
    setToast({ ...next, key: counter.current })
  }, [])

  const announce = useCallback((text: string) => {
    // Clearing first makes screen readers repeat an identical message.
    setAnnouncement('')
    requestAnimationFrame(() => setAnnouncement(text))
  }, [])

  useEffect(() => {
    if (!toast || paused) return
    const timer = setTimeout(() => setToast(null), Math.max(5000, toast.durationMs ?? 6000))
    return () => clearTimeout(timer)
  }, [toast, paused])

  const value = useMemo(() => ({ show, announce }), [show, announce])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 print:hidden"
      >
        {toast && (
          // biome-ignore lint/a11y/noStaticElementInteractions: pausing while hovered or focused gives people time to read and reach Undo (WCAG 2.2.1)
          <div
            key={toast.key}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className="pointer-events-auto flex max-w-md items-center gap-4 rounded-lg bg-ink px-4 py-3 text-sm text-surface shadow-lg"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onAction()
                  setToast(null)
                }}
                className="shrink-0 rounded font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </FeedbackContext.Provider>
  )
}
