import { Avatar, Button, CopyLinkButton } from '@teamtoolbox/ui'
import { useId, useState } from 'react'
import { ColumnIcon } from '../components/bits'
import type { Retro } from '../room/useRetro'

const WRITING_TIMES = [
  { label: 'No timer', ms: 0 },
  { label: '3 minutes', ms: 3 * 60_000 },
  { label: '5 minutes', ms: 5 * 60_000 },
  { label: '7 minutes', ms: 7 * 60_000 },
  { label: '10 minutes', ms: 10 * 60_000 },
]

export function Lobby({ retro }: { retro: Retro }) {
  const { view, isHost } = retro
  const host = view.people.find((p) => p.id === view.state?.hostId)
  const [writingMs, setWritingMs] = useState(5 * 60_000)
  const timeId = useId()

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Invite your team</h2>
          <p className="text-sm text-ink-muted">
            Anyone with this link can join and read this retro. Share it only with your team.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={retro.room.link}
              aria-label="Retro link"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 basis-64 truncate rounded-lg border border-line-strong bg-surface-muted px-3 py-2 font-mono text-xs text-ink-muted"
            />
            <CopyLinkButton link={retro.room.link} />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">How it goes</h2>
          <ol className="grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
            <li>
              <b className="text-ink">Write.</b> Add cards to the columns. Everyone sees them as
              they come in, without names.
            </li>
            <li>
              <b className="text-ink">Group.</b> Drag similar cards together.
            </li>
            <li>
              <b className="text-ink">Vote.</b> Everyone gets 3 votes. Totals show once voting ends.
            </li>
            <li>
              <b className="text-ink">Discuss.</b> Talk through the top topics and agree on actions.
            </li>
          </ol>
          <ul className="flex flex-wrap gap-2">
            {view.template?.columns.map((column) => (
              <li
                key={column.title}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm"
              >
                <ColumnIcon icon={column.icon} />
                {column.title}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="flex flex-col gap-4 rounded-xl border border-line p-4">
        <h2 className="text-lg font-semibold">
          Here now{' '}
          <span className="font-normal text-ink-muted tabular-nums">
            ({view.people.filter((p) => p.online).length})
          </span>
        </h2>
        <ul className="flex flex-col gap-2">
          {view.people.map((person) => (
            <li key={person.id} className="flex items-center gap-3">
              <Avatar name={person.name} colorIndex={person.colorIndex} away={!person.online} />
              <span className={person.online ? '' : 'text-ink-muted'}>
                {person.name}
                {person.id === retro.me.pid && <span className="text-ink-muted"> (you)</span>}
              </span>
              {person.id === view.state?.hostId && (
                <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                  Host
                </span>
              )}
            </li>
          ))}
        </ul>
        {isHost ? (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={timeId} className="text-sm font-medium">
                Writing time
              </label>
              <select
                id={timeId}
                value={writingMs}
                onChange={(event) => setWritingMs(Number(event.target.value))}
                className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base sm:text-sm"
              >
                {WRITING_TIMES.map((option) => (
                  <option key={option.ms} value={option.ms}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-ink-muted">
                When time's up, people can still finish their card.
              </span>
            </div>
            <Button onClick={() => retro.startWriting(writingMs || null)}>Start retro</Button>
          </div>
        ) : (
          <p className="border-t border-line pt-4 text-sm text-ink-muted">
            Waiting for {host?.name ?? 'the host'} to start the retro.
          </p>
        )}
      </aside>
    </div>
  )
}
