import { kindLabels, type ToolKind } from '@teamtoolbox/registry'

export function PrivacyBadge({ kind }: { kind: ToolKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-muted">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
        <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
      </svg>
      {kindLabels[kind]}
    </span>
  )
}
