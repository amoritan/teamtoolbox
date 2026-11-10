import { Button, ConfirmDialog, CopyLinkButton, Dialog, PresenceList } from '@teamtoolbox/ui'
import { Settings2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { PHASE_LABELS, PhaseSteps } from '../components/bits'
import { nextPhase, previousPhase } from '../model/view'
import type { Retro } from './useRetro'

const NEXT_LABELS = {
  lobby: null,
  write: 'Start grouping',
  group: 'Start voting',
  vote: 'End voting',
  discuss: null,
} as const

const HOST_AWAY_MS = 60_000

export function RoomHeader({ retro }: { retro: Retro }) {
  const { view, isHost, status } = retro
  const phase = view.state?.phase ?? 'lobby'
  const next = nextPhase(phase)
  const nextLabel = NEXT_LABELS[phase]
  const [optionsOpen, setOptionsOpen] = useState(false)

  return (
    <header className="flex flex-col gap-3 border-b border-line pb-4 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{view.template?.name}</h1>
          <PhaseSteps phase={phase} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PresenceList
            people={view.people.map((p) => ({
              id: p.id,
              name: p.id === retro.me.pid ? `${p.name} (you)` : p.name,
              colorIndex: p.colorIndex,
              online: p.online,
            }))}
          />
          <CopyLinkButton link={retro.room.link} variant="secondary" />
          {isHost && (
            <Button variant="ghost" onClick={() => setOptionsOpen(true)} aria-label="Host options">
              <Settings2 className="size-4" />
            </Button>
          )}
          {isHost && next && nextLabel && (
            <Button onClick={() => retro.setPhase(next)}>{nextLabel}</Button>
          )}
        </div>
      </div>
      {status === 'reconnecting' && (
        <p role="status" className="rounded-lg bg-surface-muted px-3 py-2 text-sm">
          Reconnecting… Your changes will be sent when you're back.
        </p>
      )}
      <TakeOver retro={retro} />
      {isHost && (
        <HostOptions retro={retro} open={optionsOpen} onClose={() => setOptionsOpen(false)} />
      )}
    </header>
  )
}

/** Trust-based: if the host has been away for a minute, anyone can carry on. */
function TakeOver({ retro }: { retro: Retro }) {
  const host = retro.view.people.find((p) => p.id === retro.view.state?.hostId)
  const hostAway = !retro.isHost && !!host && !host.online
  const [awaySince, setAwaySince] = useState<number | null>(null)
  const [, tick] = useState(0)

  useEffect(() => {
    setAwaySince(hostAway ? Date.now() : null)
  }, [hostAway])

  useEffect(() => {
    if (!awaySince) return
    const timer = setTimeout(() => tick((n) => n + 1), HOST_AWAY_MS)
    return () => clearTimeout(timer)
  }, [awaySince])

  if (!awaySince || !retro.me.pid || Date.now() - awaySince < HOST_AWAY_MS) return null
  const pid = retro.me.pid
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 py-2 text-sm">
      <span>{host?.name ?? 'The host'} seems to be away.</span>
      <Button variant="secondary" onClick={() => retro.makeHost(pid)}>
        Take over as host
      </Button>
    </div>
  )
}

function HostOptions({
  retro,
  open,
  onClose,
}: {
  retro: Retro
  open: boolean
  onClose: () => void
}) {
  const { view } = retro
  const phase = view.state?.phase ?? 'lobby'
  const back = previousPhase(phase)
  const others = view.people.filter((p) => p.id !== retro.me.pid)
  const [newHost, setNewHost] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const selectId = useId()

  return (
    <>
      <Dialog
        open={open && !confirmDelete}
        onClose={onClose}
        title="Host options"
        footer={
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {back && (
            <section className="flex flex-col items-start gap-2">
              <h3 className="text-sm font-semibold">Go back a step</h3>
              <p className="text-sm text-ink-muted">Cards, groups and votes stay as they are.</p>
              <Button
                variant="secondary"
                onClick={() => {
                  retro.setPhase(back)
                  onClose()
                }}
              >
                Back to {PHASE_LABELS[back].toLowerCase()}
              </Button>
            </section>
          )}
          {others.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Hand over hosting</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={selectId} className="sr-only">
                    New host
                  </label>
                  <select
                    id={selectId}
                    value={newHost}
                    onChange={(event) => setNewHost(event.target.value)}
                    className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base sm:text-sm"
                  >
                    <option value="">Pick someone…</option>
                    {others.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.online ? '' : ' (away)'}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="secondary"
                  disabled={!newHost}
                  onClick={() => {
                    retro.makeHost(newHost)
                    onClose()
                  }}
                >
                  Make host
                </Button>
              </div>
            </section>
          )}
          <section className="flex flex-col items-start gap-2">
            <h3 className="text-sm font-semibold">Delete the retro</h3>
            <p className="text-sm text-ink-muted">
              Removes every card, vote and action for everyone, straight away.
            </p>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete retro…
            </Button>
          </section>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this retro for everyone?"
        description="All cards, groups, votes and action items are deleted and can't be recovered. Export the results first if you need them."
        confirmLabel="Delete retro"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          onClose()
          retro.room.destroy()
        }}
      />
    </>
  )
}
