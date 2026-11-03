import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { CLOSE_CODES, type ClientMessage, LIMITS, type ServerMessage } from '@teamtoolbox/protocol'
import { describe, expect, it } from 'vitest'

const ORIGIN = 'https://retro.teamtoolbox.org'

function newRoomId(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function roomUrl(roomId: string, tool = 'retro'): string {
  return `https://rooms.teamtoolbox.org/v1/${tool}/${roomId}`
}

function roomStub(roomId: string, tool = 'retro') {
  return env.ROOM.get(env.ROOM.idFromName(`${tool}:${roomId}`))
}

class TestClient {
  private queue: ServerMessage[] = []
  private waiting: ((message: ServerMessage) => void)[] = []
  readonly closed: Promise<{ code: number; reason: string }>

  constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage
      const waiter = this.waiting.shift()
      if (waiter) waiter(message)
      else this.queue.push(message)
    })
    this.closed = new Promise((resolve) => {
      ws.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason }))
    })
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message))
  }

  next(): Promise<ServerMessage> {
    const queued = this.queue.shift()
    if (queued) return Promise.resolve(queued)
    return new Promise((resolve) => this.waiting.push(resolve))
  }

  async expect<T extends ServerMessage['t']>(type: T): Promise<Extract<ServerMessage, { t: T }>> {
    const message = await this.next()
    expect(message.t).toBe(type)
    return message as Extract<ServerMessage, { t: T }>
  }

  close(): void {
    this.ws.close(1000)
  }
}

async function connect(roomId: string, origin = ORIGIN): Promise<TestClient> {
  const response = await exports.default.fetch(roomUrl(roomId), {
    headers: { Upgrade: 'websocket', Origin: origin },
  })
  expect(response.status).toBe(101)
  const ws = response.webSocket
  if (!ws) throw new Error('No WebSocket in the response')
  ws.accept()
  return new TestClient(ws)
}

async function createRoom(roomId: string, lifetimeDays: 1 | 7 | 30 | 90 = 7) {
  const client = await connect(roomId)
  client.send({ t: 'hello', v: 1, create: { lifetimeDays } })
  const snapshot = await client.expect('snapshot')
  return { client, snapshot }
}

async function join(roomId: string) {
  const client = await connect(roomId)
  client.send({ t: 'hello', v: 1 })
  return { client, snapshot: await client.expect('snapshot') }
}

async function hasStoredAnything(roomId: string): Promise<boolean> {
  return runInDurableObject(roomStub(roomId), (_, state) => {
    const tables = state.storage.sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meta', 'records')")
      .toArray()
    return tables.length > 0
  })
}

describe('entry worker', () => {
  it('rejects other origins', async () => {
    const response = await exports.default.fetch(roomUrl(newRoomId()), {
      headers: { Upgrade: 'websocket', Origin: 'https://evil.example' },
    })
    expect(response.status).toBe(403)
  })

  it('requires a WebSocket upgrade', async () => {
    const response = await exports.default.fetch(roomUrl(newRoomId()), {
      headers: { Origin: ORIGIN },
    })
    expect(response.status).toBe(426)
  })

  it('returns 404 for anything that is not a room', async () => {
    const response = await exports.default.fetch('https://rooms.teamtoolbox.org/v1/retro/nope')
    expect(response.status).toBe(404)
  })
})

describe('Room', () => {
  it('refuses to join a room that does not exist, and stores nothing', async () => {
    const roomId = newRoomId()
    const client = await connect(roomId)
    client.send({ t: 'hello', v: 1 })
    expect((await client.closed).code).toBe(CLOSE_CODES.notFound)
    expect(await hasStoredAnything(roomId)).toBe(false)
  })

  it('creates a room with the chosen lifetime', async () => {
    const { client, snapshot } = await createRoom(newRoomId(), 7)
    expect(snapshot.records).toEqual([])
    expect(snapshot.peers).toEqual([])
    expect(snapshot.meta.expiresAt - snapshot.meta.createdAt).toBe(7 * 24 * 60 * 60 * 1000)
    client.close()
  })

  it('rejects messages before hello', async () => {
    const client = await connect(newRoomId())
    client.send({ t: 'put', id: 'r1', c: 'AAAA' })
    expect((await client.expect('error')).code).toBe('not_joined')
    client.close()
  })

  it('relays puts and deletes to everyone in one order', async () => {
    const roomId = newRoomId()
    const a = await createRoom(roomId)
    const b = await join(roomId)

    a.client.send({ t: 'put', id: 'r1', c: 'AAAA' })
    expect(await a.client.expect('put')).toEqual({ t: 'put', id: 'r1', c: 'AAAA', v: 1 })
    expect(await b.client.expect('put')).toEqual({ t: 'put', id: 'r1', c: 'AAAA', v: 1 })

    b.client.send({ t: 'put', id: 'r2', c: 'BBBB' })
    expect((await a.client.expect('put')).v).toBe(2)
    expect((await b.client.expect('put')).v).toBe(2)

    a.client.send({ t: 'del', id: 'r1' })
    expect(await b.client.expect('del')).toEqual({ t: 'del', id: 'r1', v: 3 })

    a.client.close()
    b.client.close()
  })

  it('gives late joiners the current records and presence', async () => {
    const roomId = newRoomId()
    const a = await createRoom(roomId)
    a.client.send({ t: 'put', id: 'r1', c: 'AAAA' })
    await a.client.expect('put')
    a.client.send({ t: 'presence', c: 'PPPP' })

    const b = await join(roomId)
    expect(b.snapshot.records).toEqual([{ id: 'r1', c: 'AAAA', v: 1 }])
    expect(b.snapshot.peers).toEqual([{ peer: a.snapshot.self, c: 'PPPP' }])

    b.client.close()
    expect(await a.client.expect('peer_left')).toEqual({ t: 'peer_left', peer: b.snapshot.self })
    a.client.close()
  })

  it('relays presence to others only and never stores it', async () => {
    const roomId = newRoomId()
    const a = await createRoom(roomId)
    const b = await join(roomId)
    a.client.send({ t: 'presence', c: 'PPPP' })
    expect(await b.client.expect('presence')).toEqual({
      t: 'presence',
      peer: a.snapshot.self,
      c: 'PPPP',
    })
    const stored = await runInDurableObject(roomStub(roomId), (_, state) =>
      state.storage.sql.exec('SELECT count(*) AS count FROM records').one(),
    )
    expect(stored.count).toBe(0)
    a.client.close()
    b.client.close()
  })

  it('caps the number of records', async () => {
    const roomId = newRoomId()
    const { client } = await createRoom(roomId)
    await runInDurableObject(roomStub(roomId), (_, state) => {
      for (let i = 0; i < LIMITS.maxRecordsPerRoom; i++) {
        state.storage.sql.exec(
          'INSERT INTO records (id, c, v) VALUES (?, ?, ?)',
          `seed${i}`,
          'A',
          i,
        )
      }
    })
    client.send({ t: 'put', id: 'one-too-many', c: 'AAAA' })
    expect((await client.expect('error')).code).toBe('too_many_records')
    // Replacing an existing record is still fine.
    client.send({ t: 'put', id: 'seed0', c: 'BBBB' })
    expect((await client.expect('put')).id).toBe('seed0')
    client.close()
  })

  it('rate-limits each connection', async () => {
    const { client } = await createRoom(newRoomId())
    for (let i = 0; i < LIMITS.maxMessagesPerSecond + 10; i++)
      client.send({ t: 'presence', c: 'PPPP' })
    expect((await client.expect('error')).code).toBe('rate_limited')
    client.close()
  })

  it('wipes everything and disconnects everyone when destroyed', async () => {
    const roomId = newRoomId()
    const a = await createRoom(roomId)
    const b = await join(roomId)
    a.client.send({ t: 'put', id: 'r1', c: 'AAAA' })
    await b.client.expect('put')

    a.client.send({ t: 'destroy' })
    expect((await a.client.closed).code).toBe(CLOSE_CODES.destroyed)
    expect((await b.client.closed).code).toBe(CLOSE_CODES.destroyed)
    expect(await hasStoredAnything(roomId)).toBe(false)

    const late = await connect(roomId)
    late.send({ t: 'hello', v: 1 })
    expect((await late.closed).code).toBe(CLOSE_CODES.notFound)
  })

  it('wipes everything when the expiry alarm fires', async () => {
    const roomId = newRoomId()
    const { client } = await createRoom(roomId, 1)
    expect(await runDurableObjectAlarm(roomStub(roomId))).toBe(true)
    expect((await client.closed).code).toBe(CLOSE_CODES.expired)
    expect(await hasStoredAnything(roomId)).toBe(false)
  })
})
