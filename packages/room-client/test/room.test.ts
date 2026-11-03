import { generateSecret, roomLink } from '@teamtoolbox/crypto'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createRoom, openRoom, type Room, RoomClosedError } from '../src/index'
import { FakeRoomServer } from './fake-server'

const recordSchema = z.object({ text: z.string() })
const presenceSchema = z.object({ name: z.string() })
type Card = z.infer<typeof recordSchema>
type Presence = z.infer<typeof presenceSchema>

const APP_ORIGIN = 'https://retro.teamtoolbox.org'

function options(server: FakeRoomServer) {
  return {
    tool: 'retro',
    recordSchema,
    presenceSchema,
    appOrigin: APP_ORIGIN,
    roomsUrl: 'wss://rooms.test',
    WebSocket: server.WebSocket,
    reconnect: { minDelayMs: 1, maxDelayMs: 5 },
  }
}

async function until(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

async function pair(server: FakeRoomServer) {
  const a: Room<Card, Presence> = await createRoom({ ...options(server), lifetimeDays: 7 })
  const b: Room<Card, Presence> = await openRoom({ ...options(server), link: a.link })
  return { a, b }
}

describe('room client', () => {
  it('creates a shareable link with the secret only in the fragment', async () => {
    const server = new FakeRoomServer()
    const room = await createRoom({ ...options(server), lifetimeDays: 7 })
    expect(room.link).toMatch(/^https:\/\/retro\.teamtoolbox\.org\/room#[A-Za-z0-9_-]{43}$/)
    expect(room.status).toBe('open')
    expect(room.meta && room.meta.expiresAt - room.meta.createdAt).toBe(7 * 86_400_000)
  })

  it('lets people with the link see each other’s records', async () => {
    const server = new FakeRoomServer()
    const { a, b } = await pair(server)
    await a.put('r1', { text: 'Deploys are slow' })
    await until(() => b.getRecords().get('r1')?.value.text === 'Deploys are slow')

    b.remove('r1')
    await until(() => !a.getRecords().has('r1'))
  })

  it('gives late joiners the records written so far', async () => {
    const server = new FakeRoomServer()
    const a = await createRoom({ ...options(server), lifetimeDays: 7 })
    await a.put('r1', { text: 'First' })
    await until(() => a.getRecords().has('r1'))
    const b = await openRoom({ ...options(server), link: a.link })
    expect(b.getRecords().get('r1')?.value).toEqual({ text: 'First' })
  })

  it('never sends plaintext or the secret to the server', async () => {
    const server = new FakeRoomServer()
    const { a, b } = await pair(server)
    await a.put('r1', { text: 'Our pricing plan for Q3' })
    await a.setPresence({ name: 'Alex Example' })
    await until(() => b.getRecords().has('r1'))

    const secret = a.link.split('#')[1] ?? ''
    for (const raw of server.log) {
      expect(raw).not.toContain('pricing')
      expect(raw).not.toContain('Alex')
      expect(raw).not.toContain(secret)
    }
  })

  it('ignores records that fail to decrypt or validate', async () => {
    const server = new FakeRoomServer()
    const { a, b } = await pair(server)
    server.inject(`/v1/retro/${a.roomId}`, 'garbage', 'A'.repeat(64))
    await a.put('wrong-shape', { nope: true } as unknown as Card)
    await a.put('good', { text: 'ok' })
    await until(() => b.getRecords().has('good'))
    expect(b.getRecords().has('garbage')).toBe(false)
    expect(b.getRecords().has('wrong-shape')).toBe(false)
  })

  it('shares presence with others', async () => {
    const server = new FakeRoomServer()
    const { a, b } = await pair(server)
    await a.setPresence({ name: 'Alex' })
    await until(() => b.getPeers().get(a.self ?? '')?.presence?.name === 'Alex')
  })

  it('refuses to open a room that does not exist', async () => {
    const server = new FakeRoomServer()
    const link = roomLink(APP_ORIGIN, generateSecret())
    const error = await openRoom({ ...options(server), link }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(RoomClosedError)
    expect((error as RoomClosedError).reason).toBe('not_found')
  })

  it('closes for everyone when the room is destroyed', async () => {
    const server = new FakeRoomServer()
    const { a, b } = await pair(server)
    a.destroy()
    await until(() => b.status === 'closed')
    expect(b.closedReason).toBe('destroyed')
    expect(a.closedReason).toBe('destroyed')
  })

  it('reconnects after a drop, resyncs, and sends writes made while offline', async () => {
    const server = new FakeRoomServer()
    const { a, b } = await pair(server)
    const statuses: string[] = []
    b.onStatus((status) => statuses.push(status))

    server.dropAll()
    await until(() => a.status === 'reconnecting')
    await a.put('offline', { text: 'Written while offline' })
    await until(() => b.getRecords().get('offline')?.value.text === 'Written while offline')
    expect(statuses).toContain('reconnecting')
    expect(b.status).toBe('open')
  })

  it('stops reconnecting after leaving', async () => {
    const server = new FakeRoomServer()
    const { a } = await pair(server)
    a.close()
    expect(a.status).toBe('closed')
    expect(a.closedReason).toBe('left')
  })
})
