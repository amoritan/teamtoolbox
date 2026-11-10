/**
 * The live retro: the room's records and presence as a view, plus every change a
 * person can make. Each change writes whole records; the server keeps the latest.
 */
import type { RoomStatus } from '@teamtoolbox/room-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type RoomMemory, roomMemory, saveName, saveRoomMemory } from '../model/local'
import type { CardRecord, Phase, RetroRecord, State } from '../model/schema'
import { VOTES_PER_PERSON } from '../model/schema'
import { buildView, type RetroView } from '../model/view'
import type { RetroRoom } from './connect'

export interface Retro {
  room: RetroRoom
  view: RetroView
  status: RoomStatus
  me: RoomMemory & { person: RetroView['people'][number] | null }
  isHost: boolean
  ballot: string[]
  join(name: string): Promise<void>
  setTyping(typing: boolean): void
  setPhase(phase: Phase): void
  startWriting(durationMs: number | null): void
  addTime(ms: number): void
  focusTopic(topicId: string | null): void
  makeHost(pid: string): void
  addCard(column: number, text: string): void
  editCard(cardId: string, text: string): void
  /** Returns a function that puts the card back. */
  deleteCard(cardId: string): () => void
  moveCard(cardId: string, targetTopicId: string): void
  ungroupCard(cardId: string): void
  renameGroup(groupId: string, title: string): void
  vote(topicId: string): void
  unvote(topicId: string): void
  addAction(text: string, ownerId: string | null, topicId: string | null): void
  deleteAction(actionId: string): () => void
}

export function useRetro(room: RetroRoom): Retro {
  const [records, setRecords] = useState(() => room.getRecords())
  const [peers, setPeers] = useState(() => room.getPeers())
  const [status, setStatus] = useState<RoomStatus>(room.status)
  // A new Map each time, so React re-renders: the client mutates its own maps in place.
  const [memory, setMemory] = useState(() => roomMemory(room.roomId))
  // Updated the moment you act, so fast clicks build on each other instead of on the
  // last render (which may not have your previous click in it yet).
  const memoryRef = useRef(memory)
  const ballotRef = useRef<string[] | null>(null)
  const [localBallot, setLocalBallot] = useState<string[] | null>(null)
  const typingRef = useRef(false)

  useEffect(() => {
    const offRecords = room.subscribe((next) => setRecords(new Map(next)))
    const offPresence = room.onPresence((next) => setPeers(new Map(next)))
    const offStatus = room.onStatus(setStatus)
    return () => {
      offRecords()
      offPresence()
      offStatus()
    }
  }, [room])

  const remember = useCallback(
    (update: (current: RoomMemory) => RoomMemory) => {
      const next = update(memoryRef.current)
      memoryRef.current = next
      saveRoomMemory(room.roomId, next)
      setMemory(next)
    },
    [room],
  )

  const view = useMemo(
    () =>
      buildView(
        [...records.values()].map(({ id, value }) => ({ id, value })),
        [...peers.values()].map((peer) => peer.presence),
        { pid: memory.pid, connected: status === 'open' },
        VOTES_PER_PERSON,
      ),
    [records, peers, memory.pid, status],
  )

  const person = view.people.find((p) => p.id === memory.pid) ?? null
  const isHost = !!person && view.state?.hostId === person.id
  // This browser is the only writer of your ballot, so once you've voted here your own
  // copy is the truth. After a reload, the room's copy is.
  const storedBallot = memory.voterId
    ? ((records.get(memory.voterId)?.value as Extract<RetroRecord, { k: 'ballot' }> | undefined)
        ?.topics ?? [])
    : []
  const ballot = localBallot ?? storedBallot

  const writeBallot = (topics: string[]) => {
    let voterId = memoryRef.current.voterId
    if (!voterId) {
      const created = room.newRecordId()
      voterId = created
      remember((current) => ({ ...current, voterId: created }))
    }
    ballotRef.current = topics
    setLocalBallot(topics)
    void room.put(voterId, { k: 'ballot', topics })
  }

  // Tell the room who you are once your person record exists (the client replays it after reconnecting).
  const personId = person?.id
  const personName = person?.name
  useEffect(() => {
    if (personId && personName) {
      void room.setPresence({ pid: personId, name: personName, typing: typingRef.current })
    }
  }, [room, personId, personName])

  const putState = useCallback(
    (patch: Partial<State>) => {
      if (!view.stateId || !view.state) return
      void room.put(view.stateId, { ...view.state, ...patch })
    },
    [room, view.stateId, view.state],
  )

  const cardById = (cardId: string) => view.cards.find((card) => card.id === cardId)
  const putCard = (id: string, card: CardRecord) => void room.put(id, card)
  const stripId = <T extends { id: string }>({ id: _id, ...rest }: T) => rest

  return {
    room,
    view,
    status,
    me: { ...memory, person },
    isHost,
    ballot,

    async join(name) {
      saveName(name)
      const pid = memoryRef.current.pid ?? room.newRecordId()
      remember((current) => ({ ...current, pid }))
      const existing = view.people.find((p) => p.id === pid)
      await room.put(pid, { k: 'person', name, joinedAt: existing?.joinedAt ?? Date.now() })
      await room.setPresence({ pid, name, typing: false })
    },

    setTyping(typing) {
      if (!person || typingRef.current === typing) return
      typingRef.current = typing
      void room.setPresence({ pid: person.id, name: person.name, typing })
    },

    setPhase(phase) {
      putState({ phase, ...(phase !== 'discuss' ? { focusTopicId: null } : {}) })
    },

    startWriting(durationMs) {
      putState({
        phase: 'write',
        timer: durationMs ? { endsAt: Date.now() + durationMs, durationMs } : null,
      })
    },

    addTime(ms) {
      const timer = view.state?.timer
      if (!timer) return
      // From now if time's already up, so "Add a minute" always gives a minute.
      const endsAt = Math.max(timer.endsAt, Date.now()) + ms
      putState({ timer: { endsAt, durationMs: timer.durationMs + ms } })
    },

    focusTopic(topicId) {
      putState({ focusTopicId: topicId })
    },

    makeHost(pid) {
      putState({ hostId: pid })
    },

    addCard(column, text) {
      const id = room.newRecordId()
      remember((current) => ({ ...current, ownCards: [...current.ownCards, id] }))
      putCard(id, { k: 'card', column, text, createdAt: Date.now(), groupId: null })
    },

    editCard(cardId, text) {
      const card = cardById(cardId)
      if (card && memory.ownCards.includes(cardId)) putCard(cardId, { ...stripId(card), text })
    },

    deleteCard(cardId) {
      const card = cardById(cardId)
      if (!card) return () => {}
      room.remove(cardId)
      return () => putCard(cardId, stripId(card))
    },

    moveCard(cardId, targetTopicId) {
      const card = cardById(cardId)
      if (!card || cardId === targetTopicId) return
      const topic = view.topics.find((t) => t.id === targetTopicId)
      if (!topic) return
      if (topic.kind === 'group') {
        if (card.groupId !== topic.id) putCard(cardId, { ...stripId(card), groupId: topic.id })
        return
      }
      // Dropping on a loose card starts a new group with both.
      const target = topic.cards[0]
      if (!target) return
      const groupId = room.newRecordId()
      void room.put(groupId, { k: 'group', title: '', createdAt: Date.now() })
      putCard(target.id, { ...stripId(target), groupId })
      putCard(cardId, { ...stripId(card), groupId })
    },

    ungroupCard(cardId) {
      const card = cardById(cardId)
      if (card?.groupId) putCard(cardId, { ...stripId(card), groupId: null })
    },

    renameGroup(groupId, title) {
      const group = view.groups.find((g) => g.id === groupId)
      if (group && group.title !== title) void room.put(groupId, { ...stripId(group), title })
    },

    vote(topicId) {
      // Votes on topics that have since disappeared (regrouped cards) are given back.
      const topicIds = new Set(view.topics.map((topic) => topic.id))
      const current = ballotRef.current ?? storedBallot
      const valid = current.filter((id) => topicIds.has(id))
      if (valid.length >= VOTES_PER_PERSON || !topicIds.has(topicId)) return
      writeBallot([...valid, topicId])
    },

    unvote(topicId) {
      const current = ballotRef.current ?? storedBallot
      const index = current.lastIndexOf(topicId)
      if (index === -1) return
      writeBallot(current.filter((_, i) => i !== index))
    },

    addAction(text, ownerId, topicId) {
      void room.put(room.newRecordId(), {
        k: 'action',
        text,
        ownerId,
        topicId,
        createdAt: Date.now(),
      })
    },

    deleteAction(actionId) {
      const action = view.actions.find((a) => a.id === actionId)
      if (!action) return () => {}
      room.remove(actionId)
      return () => void room.put(actionId, stripId(action))
    },
  }
}
