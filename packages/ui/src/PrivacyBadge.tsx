import { kindLabels, type ToolKind } from '@teamtoolbox/registry'
import { LockKeyhole } from 'lucide-react'

export function PrivacyBadge({ kind }: { kind: ToolKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-muted">
      <LockKeyhole className="size-3.5 shrink-0" />
      {kindLabels[kind]}
    </span>
  )
}
