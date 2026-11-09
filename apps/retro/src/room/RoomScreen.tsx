import { type ClosedReason, RoomClosedError } from '@teamtoolbox/room-client'
import { Button, TextField, useFeedback } from '@teamtoolbox/ui'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Skeleton } from '../components/bits'
import { forgetRoom, rememberRoom, savedName } from '../model/local'
import { TEXT_LIMITS } from '../model/schema'
import { Discuss } from '../phases/Discuss'
import { Group } from '../phases/Group'
import { Lobby } from '../phases/Lobby'
import { Vote } from '../phases/Vote'
import { Write } from '../phases/Write'
import { openRetro, type RetroRoom } from './connect'
import { RoomHeader } from './RoomHeader'
import { type Retro, useRetro } from './useRetro'

type Load =
  | { kind: 'loading' }
  | { kind: 'open'; room: RetroRoom }
  | { kind: 'closed'; reason: ClosedReason | 'bad_link' | 'offline' }

const CLOSED_MESSAGES: Record<
  ClosedReason | 'bad_link' | 'offline',
  { title: string; body: string }
> = {
  destroyed: {
    title: 'This retro was deleted',
    body: 'The host deleted it for everyone, so nothing is left of it.',
  },
  expired: {
    title: 'This retro has expired',
    body: 'Retros delete themselves at the end of their lifetime.',
  },
  not_found: {
    title: "This retro doesn't exist",
    body: 'It may have been deleted, or the link may be incomplete. Ask the host for the link again.',
  },
  room_full: { title: 'This retro is full', body: 'A retro can have up to 50 people at once.' },
  left: { title: 'You left this retro', body: 'Open the link again to rejoin.' },
  bad_link: {
    title: "This link doesn't work",
    body: 'Part of it seems to be missing. Ask the host to copy it again.',
  },
  offline: {
    title: "Couldn't connect",
    body: 'Check your connection and try again.',
  },
}

export function RoomScreen({
  link,
  initialRoom,
  onLeave,
}: {
  link: string
  initialRoom: RetroRoom | null
  onLeave: () => void
}) {
  const [load, setLoad] = useState<Load>(() =>
    initialRoom ? { kind: 'open', room: initialRoom } : { kind: 'loading' },
  )
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (initialRoom && attempt === 0) return
    let cancelled = false
    let opened: RetroRoom | null = null
    setLoad({ kind: 'loading' })
    openRetro(link)
      .then((room) => {
        opened = room
        if (cancelled) room.close()
        else setLoad({ kind: 'open', room })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const reason =
          error instanceof RoomClosedError
            ? error.reason
            : // A link with a missing or mangled secret fails to decode.
              error instanceof TypeError
              ? 'bad_link'
              : 'offline'
        setLoad({ kind: 'closed', reason })
      })
    return () => {
      cancelled = true
      opened?.close()
    }
  }, [link, initialRoom, attempt])

  if (load.kind === 'loading') return <Connecting />
  if (load.kind === 'closed') {
    return (
      <Closed reason={load.reason} onRetry={() => setAttempt((n) => n + 1)} onLeave={onLeave} />
    )
  }
  return <OpenRoom room={load.room} onLeave={onLeave} />
}

function Connecting() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <p className="text-sm text-ink-muted">Connecting and decrypting…</p>
      <Skeleton className="h-10 w-2/3" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}

function Closed({
  reason,
  onRetry,
  onLeave,
}: {
  reason: ClosedReason | 'bad_link' | 'offline'
  onRetry: () => void
  onLeave: () => void
}) {
  const message = CLOSED_MESSAGES[reason]
  return (
    <section className="mx-auto flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{message.title}</h1>
      <p className="text-ink-muted">{message.body}</p>
      <div className="flex gap-3 pt-2">
        {reason === 'offline' && <Button onClick={onRetry}>Try again</Button>}
        <Button variant={reason === 'offline' ? 'secondary' : 'primary'} onClick={onLeave}>
          Start a new retro
        </Button>
      </div>
    </section>
  )
}

function OpenRoom({ room, onLeave }: { room: RetroRoom; onLeave: () => void }) {
  const retro = useRetro(room)
  const { announce } = useFeedback()
  const phase = retro.view.state?.phase
  const previousPhase = useRef(phase)

  // Remember the room for this browser's recent list, and forget it once it's gone.
  useEffect(() => {
    if (!room.meta || !retro.view.template || !retro.me.person) return
    rememberRoom({
      link: room.link,
      roomId: room.roomId,
      templateName: retro.view.template.name,
      createdAt: room.meta.createdAt,
      expiresAt: room.meta.expiresAt,
      hosted: retro.isHost,
    })
  }, [room, retro.view.template, retro.me.person, retro.isHost])

  useEffect(() => {
    if (retro.status === 'closed' && room.closedReason && room.closedReason !== 'left') {
      forgetRoom(room.roomId)
    }
  }, [retro.status, room])

  useEffect(() => {
    if (!phase || phase === previousPhase.current) return
    previousPhase.current = phase
    announce(
      {
        lobby: 'Back in the waiting room.',
        write: 'Writing has started.',
        group: 'Grouping has started.',
        vote: 'Voting has started.',
        discuss: 'Voting has ended. Discussion has started.',
      }[phase],
    )
  }, [phase, announce])

  if (retro.status === 'closed' && room.closedReason) {
    return <Closed reason={room.closedReason} onRetry={() => {}} onLeave={onLeave} />
  }
  if (!retro.view.state || !retro.view.template) {
    return <Closed reason="not_found" onRetry={() => {}} onLeave={onLeave} />
  }
  if (!retro.me.person) return <Join retro={retro} />

  return (
    <div className="flex flex-col gap-6">
      <RoomHeader retro={retro} />
      <PhaseView retro={retro} />
    </div>
  )
}

function PhaseView({ retro }: { retro: Retro }) {
  switch (retro.view.state?.phase) {
    case 'lobby':
      return <Lobby retro={retro} />
    case 'write':
      return <Write retro={retro} />
    case 'group':
      return <Group retro={retro} />
    case 'vote':
      return <Vote retro={retro} />
    case 'discuss':
      return <Discuss retro={retro} />
    default:
      return null
  }
}

function Join({ retro }: { retro: Retro }) {
  const [name, setName] = useState(savedName)
  const [error, setError] = useState<string>()
  const [joining, setJoining] = useState(false)
  const host = retro.view.people.find((p) => p.id === retro.view.state?.hostId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Add a name so others know who joined.')
      return
    }
    setJoining(true)
    await retro.join(trimmed)
  }

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Join the retro</h1>
        <p className="text-ink-muted">
          {host ? `${host.name} invited you to a ` : 'You were invited to a '}
          {retro.view.template?.name} retro. Cards and votes are anonymous.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Your name"
          hint="Shown to the people in the retro, never on your cards."
          error={error}
          value={name}
          maxLength={TEXT_LIMITS.name}
          autoComplete="nickname"
          autoFocus
          onChange={(event) => {
            setName(event.target.value)
            setError(undefined)
          }}
        />
        <Button type="submit" busy={joining} className="self-start">
          {joining ? 'Joining…' : 'Join'}
        </Button>
      </form>
    </section>
  )
}
