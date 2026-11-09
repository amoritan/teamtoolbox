import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RetroRecord } from '../src/model/schema'
import type { RetroRoom } from '../src/room/connect'
import { useRetro } from '../src/room/useRetro'

/** A stand-in room: writes land locally, like the server echoing them back later. */
function fakeRoom(initial: [string, RetroRecord][]) {
  let counter = 0
  const records = new Map(initial.map(([id, value], v) => [id, { id, value, v }]))
  const listeners = new Set<(r: typeof records) => void>()
  const puts: [string, RetroRecord][] = []
  const room = {
    roomId: 'room1',
    link: 'http://localhost/room#secret',
    status: 'open',
    getRecords: () => records,
    getPeers: () => new Map(),
    subscribe: (fn: (r: typeof records) => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    onPresence: () => () => {},
    onStatus: () => () => {},
    newRecordId: () => `id${++counter}`,
    setPresence: async () => {},
    put: async (id: string, value: RetroRecord) => {
      puts.push([id, value])
    },
    remove: () => {},
    /** Delivers everything written so far, as the server would. */
    echo() {
      for (const [id, value] of puts.splice(0)) records.set(id, { id, value, v: records.size + 1 })
      for (const fn of listeners) fn(records)
    },
    puts,
  }
  return room
}

const base: [string, RetroRecord][] = [
  ['settings', { k: 'settings', template: 'start-stop-continue', createdAt: 1 }],
  ['state', { k: 'state', phase: 'vote', hostId: 'me', timer: null, focusTopicId: null }],
  ['me', { k: 'person', name: 'Ana', joinedAt: 1 }],
  ['c1', { k: 'card', column: 0, text: 'One', createdAt: 1, groupId: null }],
  ['c2', { k: 'card', column: 1, text: 'Two', createdAt: 2, groupId: null }],
]

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(
    'ttb.retro.room.room1',
    JSON.stringify({ pid: 'me', voterId: null, ownCards: ['c1'] }),
  )
})

describe('useRetro', () => {
  it('counts fast votes even before the server echoes them, and stops at 3', () => {
    const room = fakeRoom(base)
    const { result } = renderHook(() => useRetro(room as unknown as RetroRoom))
    act(() => {
      result.current.vote('c1')
      result.current.vote('c2')
      result.current.vote('c2')
      result.current.vote('c1')
    })
    const ballots = room.puts.filter(([, value]) => value.k === 'ballot')
    expect(ballots.map(([, value]) => (value as { topics: string[] }).topics)).toEqual([
      ['c1'],
      ['c1', 'c2'],
      ['c1', 'c2', 'c2'],
    ])
    // One voter ID for all of them, separate from the participant ID.
    const voterIds = new Set(ballots.map(([id]) => id))
    expect(voterIds.size).toBe(1)
    expect(voterIds.has('me')).toBe(false)
    expect(result.current.ballot).toEqual(['c1', 'c2', 'c2'])
  })

  it('takes back the latest vote on a topic', () => {
    const room = fakeRoom(base)
    const { result } = renderHook(() => useRetro(room as unknown as RetroRoom))
    act(() => {
      result.current.vote('c2')
      result.current.vote('c1')
      result.current.vote('c2')
      result.current.unvote('c2')
    })
    expect(result.current.ballot).toEqual(['c2', 'c1'])
  })

  it('only edits cards written in this browser, and cards carry no author', () => {
    const room = fakeRoom(base)
    const { result } = renderHook(() => useRetro(room as unknown as RetroRoom))
    act(() => {
      result.current.editCard('c1', 'One, edited')
      result.current.editCard('c2', 'Not mine')
    })
    expect(room.puts).toEqual([
      ['c1', { k: 'card', column: 0, text: 'One, edited', createdAt: 1, groupId: null }],
    ])
    act(() => result.current.addCard(2, 'New'))
    const [, added] = room.puts.at(-1) ?? []
    expect(added).toEqual({
      k: 'card',
      column: 2,
      text: 'New',
      createdAt: expect.any(Number),
      groupId: null,
    })
  })

  it('starts a group when a card lands on a loose card', () => {
    const room = fakeRoom(base)
    const { result } = renderHook(() => useRetro(room as unknown as RetroRoom))
    act(() => result.current.moveCard('c2', 'c1'))
    const [groupId, group] = room.puts[0] ?? []
    expect(group).toMatchObject({ k: 'group', title: '' })
    expect(
      room.puts.slice(1).map(([id, value]) => [id, (value as { groupId: string }).groupId]),
    ).toEqual([
      ['c1', groupId],
      ['c2', groupId],
    ])
    act(() => room.echo())
    expect(result.current.view.topics.map((t) => t.kind)).toEqual(['group'])
  })
})
