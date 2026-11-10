/** Small pieces shared by the retro screens. */
import {
  Anchor,
  Angry,
  Check,
  CircleHelp,
  Frown,
  Lightbulb,
  type LucideIcon,
  Minus,
  Play,
  Plus,
  Puzzle,
  Repeat,
  Smile,
  Sparkles,
  Square,
  ThumbsUp,
  TreePalm,
  TriangleAlert,
  Wind,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Phase, Timer } from '../model/schema'
import type { ColumnIcon as ColumnIconName } from '../model/templates'

const ICONS: Record<ColumnIconName, LucideIcon> = {
  play: Play,
  square: Square,
  repeat: Repeat,
  smile: Smile,
  frown: Frown,
  'circle-help': CircleHelp,
  'thumbs-up': ThumbsUp,
  lightbulb: Lightbulb,
  puzzle: Puzzle,
  sparkles: Sparkles,
  angry: Angry,
  wind: Wind,
  anchor: Anchor,
  'triangle-alert': TriangleAlert,
  'tree-palm': TreePalm,
  check: Check,
  plus: Plus,
  minus: Minus,
}

export function ColumnIcon({
  icon,
  className = 'size-4',
}: {
  icon: ColumnIconName
  className?: string
}) {
  const Icon = ICONS[icon]
  return <Icon className={`shrink-0 ${className}`} />
}

export const PHASE_LABELS: Record<Phase, string> = {
  lobby: 'Waiting room',
  write: 'Write',
  group: 'Group',
  vote: 'Vote',
  discuss: 'Discuss',
}

export function PhaseSteps({ phase }: { phase: Phase }) {
  const phases = Object.keys(PHASE_LABELS) as Phase[]
  const current = phases.indexOf(phase)
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label="Steps">
      {phases.map((step, index) => (
        <li key={step} className="flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden="true" className="text-ink-muted">
              ·
            </span>
          )}
          <span
            aria-current={index === current ? 'step' : undefined}
            className={
              index === current
                ? 'rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-ink'
                : index < current
                  ? 'px-1 text-ink-muted line-through decoration-ink-muted/40'
                  : 'px-1 text-ink-muted'
            }
          >
            {PHASE_LABELS[step]}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Re-renders every second while mounted. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [active])
  return now
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function TimerBadge({ timer }: { timer: Timer }) {
  const now = useNow()
  const left = timer.endsAt - now
  const up = left <= 0
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium tabular-nums ${up ? 'border-warn text-warn' : 'border-line-strong text-ink'}`}
    >
      {up ? "Time's up" : formatCountdown(left)}
      <span className="sr-only">{up ? '' : ' left'}</span>
    </span>
  )
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`motion-safe:animate-pulse rounded-lg bg-surface-muted ${className}`}
    />
  )
}
