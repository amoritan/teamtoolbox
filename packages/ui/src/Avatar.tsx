/** Literal class names, so Tailwind generates all eight (docs/ui-guidelines.md §3). */
const PARTICIPANT_BACKGROUNDS = [
  'bg-participant-1',
  'bg-participant-2',
  'bg-participant-3',
  'bg-participant-4',
  'bg-participant-5',
  'bg-participant-6',
  'bg-participant-7',
  'bg-participant-8',
] as const

export const PARTICIPANT_COLOR_COUNT = PARTICIPANT_BACKGROUNDS.length

export function participantBackground(colorIndex: number): string {
  const n = PARTICIPANT_BACKGROUNDS.length
  return PARTICIPANT_BACKGROUNDS[((colorIndex % n) + n) % n] as string
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length >= 2 ? [words[0]?.[0], words.at(-1)?.[0]] : [...(words[0] ?? '?')].slice(0, 2)
  return letters.join('').toUpperCase()
}

export interface AvatarProps {
  name: string
  /** Join order. Picks one of the eight participant colours, cycling after the eighth. */
  colorIndex: number
  size?: 'sm' | 'md'
  /** Dims the avatar for someone who isn't connected right now. */
  away?: boolean
}

/** A participant's colour and initials. The name is the accessible label (never colour alone). */
export function Avatar({ name, colorIndex, size = 'md', away = false }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={away ? `${name} (away)` : name}
      title={name}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-surface ${participantBackground(colorIndex)} ${size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs'} ${away ? 'opacity-40' : ''}`}
    >
      {initials(name)}
    </span>
  )
}

export interface PresencePerson {
  id: string
  name: string
  colorIndex: number
  online: boolean
}

/** Who's here: avatars in join order, then "+3" when the row overflows (§5.3). */
export function PresenceList({ people, max = 6 }: { people: PresencePerson[]; max?: number }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  const online = people.filter((person) => person.online).length
  return (
    <div className="flex items-center gap-2">
      <ul className="flex -space-x-1.5" aria-label={`${online} of ${people.length} here`}>
        {shown.map((person) => (
          <li key={person.id} className="rounded-full ring-2 ring-surface">
            <Avatar
              name={person.name}
              colorIndex={person.colorIndex}
              size="sm"
              away={!person.online}
            />
          </li>
        ))}
      </ul>
      {rest > 0 && <span className="text-xs text-ink-muted tabular-nums">+{rest}</span>}
    </div>
  )
}
