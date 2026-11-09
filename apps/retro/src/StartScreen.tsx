import { LIFETIME_DAYS, type LifetimeDays } from '@teamtoolbox/protocol'
import { getTool } from '@teamtoolbox/registry'
import { Button, TextField } from '@teamtoolbox/ui'
import { type FormEvent, useId, useState } from 'react'
import { ColumnIcon, plural } from './components/bits'
import { type RecentRoom, recentRooms, savedName } from './model/local'
import { TEXT_LIMITS } from './model/schema'
import { TEMPLATE_IDS, TEMPLATES, type TemplateId } from './model/templates'
import { createRetro, type RetroRoom } from './room/connect'

const DAY = 86_400_000
const GUIDE_URL = 'https://teamtoolbox.org/tools/retro'

export function StartScreen({
  onCreated,
  onOpen,
}: {
  onCreated: (room: RetroRoom) => void
  onOpen: (link: string) => void
}) {
  const [template, setTemplate] = useState<TemplateId>('start-stop-continue')
  const [lifetime, setLifetime] = useState<LifetimeDays>(30)
  const [name, setName] = useState(savedName)
  const [nameError, setNameError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [failed, setFailed] = useState(false)
  const [recent] = useState(recentRooms)
  const lifetimeId = useId()

  async function create(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Add your name so your team knows who is hosting.')
      return
    }
    setCreating(true)
    setFailed(false)
    try {
      onCreated(await createRetro(template, lifetime, trimmed))
    } catch {
      setFailed(true)
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{getTool('retro')?.tagline}</h1>
        <p className="text-ink-muted">
          Pick a style, share the link, and run the retro together: write, group, vote and agree on
          actions. Everything is end-to-end encrypted.{' '}
          <a href={GUIDE_URL} className="text-accent underline underline-offset-2">
            How it works
          </a>
        </p>
      </section>

      <form onSubmit={create} className="flex flex-col gap-6" noValidate>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-lg font-semibold">Pick a style</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATE_IDS.map((id) => {
              const option = TEMPLATES[id]
              const checked = id === template
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${checked ? 'border-accent bg-surface-muted' : 'border-line hover:border-line-strong'}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span id={`${id}-name`} className="font-semibold">
                      {option.name}
                    </span>
                    <input
                      type="radio"
                      name="template"
                      value={id}
                      checked={checked}
                      onChange={() => setTemplate(id)}
                      aria-labelledby={`${id}-name`}
                      aria-describedby={`${id}-description ${id}-columns`}
                      className="size-4 accent-accent"
                    />
                  </span>
                  <span id={`${id}-description`} className="text-sm text-ink-muted">
                    {option.description}
                  </span>
                  <span
                    id={`${id}-columns`}
                    className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted"
                  >
                    {option.columns.map((column) => (
                      <span key={column.title} className="inline-flex items-center gap-1">
                        <ColumnIcon icon={column.icon} className="size-3.5" />
                        {column.title}
                      </span>
                    ))}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <TextField
            label="Your name"
            hint="Shown to the people in the retro."
            error={nameError}
            value={name}
            maxLength={TEXT_LIMITS.name}
            autoComplete="nickname"
            onChange={(event) => {
              setName(event.target.value)
              setNameError(undefined)
            }}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={lifetimeId} className="text-sm font-medium">
              Delete the retro after
            </label>
            <select
              id={lifetimeId}
              value={lifetime}
              onChange={(event) => setLifetime(Number(event.target.value) as LifetimeDays)}
              className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent sm:text-sm"
            >
              {LIFETIME_DAYS.map((days) => (
                <option key={days} value={days}>
                  {plural(days, 'day')}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-muted">Export the results before then.</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" busy={creating}>
            {creating ? 'Creating…' : 'Create retro'}
          </Button>
          {failed && (
            <p role="alert" className="text-sm text-bad">
              Couldn't create the retro. Check your connection and try again.
            </p>
          )}
        </div>
      </form>

      {recent.length > 0 && <RecentRooms rooms={recent} onOpen={onOpen} />}
    </div>
  )
}

function RecentRooms({ rooms, onOpen }: { rooms: RecentRoom[]; onOpen: (link: string) => void }) {
  return (
    <section className="flex max-w-2xl flex-col gap-3">
      <h2 className="text-lg font-semibold">Your recent retros</h2>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {rooms.map((room) => (
          <li
            key={room.roomId}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <a
              href={room.link}
              onClick={(event) => {
                event.preventDefault()
                onOpen(room.link)
              }}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              {room.templateName}
            </a>
            <span className="text-sm text-ink-muted">
              {new Date(room.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })}
              {room.hosted ? ' · You hosted' : ''} · Deleted in{' '}
              {plural(Math.max(1, Math.ceil((room.expiresAt - Date.now()) / DAY)), 'day')}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">Kept in this browser only.</p>
    </section>
  )
}
