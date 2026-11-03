import {
  type Bytes,
  deriveRoomKeys,
  generateSecret,
  openJson,
  type RoomKeys,
  randomId,
  roomLink,
  sealJson,
  secretFromLink,
} from '@teamtoolbox/crypto'
import {
  CLOSE_CODES,
  type ClientMessage,
  type ErrorCode,
  type LifetimeDays,
  PROTOCOL_VERSION,
  parseServerMessage,
  type RoomMeta,
  type Schema,
  type ServerMessage,
} from '@teamtoolbox/protocol'

export const DEFAULT_ROOMS_URL = 'wss://rooms.teamtoolbox.org'

/** Presence is bound to this pseudo record ID, so it can't be replayed as a record. */
const PRESENCE_ID = '~presence'

export interface RoomRecord<T> {
  id: string
  value: T
  /** Server-assigned version. Higher is newer. */
  v: number
}

export interface Peer<P> {
  peer: string
  presence: P | null
}

export type RoomStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

/** Why a room closed for good. The client doesn't reconnect after any of these. */
export type ClosedReason = 'destroyed' | 'expired' | 'not_found' | 'room_full' | 'left'

const TERMINAL_CLOSE_CODES: Record<number, ClosedReason> = {
  [CLOSE_CODES.destroyed]: 'destroyed',
  [CLOSE_CODES.expired]: 'expired',
  [CLOSE_CODES.notFound]: 'not_found',
  [CLOSE_CODES.roomFull]: 'room_full',
}

export class RoomClosedError extends Error {
  constructor(readonly reason: ClosedReason) {
    super(`Room closed: ${reason}`)
    this.name = 'RoomClosedError'
  }
}

export interface RoomOptions<T, P> {
  tool: string
  /** Validates every decrypted record (any Zod-style schema). Anything that fails is ignored. */
  recordSchema: Schema<T>
  /** Validates every decrypted presence. Defaults to accepting nothing. */
  presenceSchema?: Schema<P>
  /** Defaults to wss://rooms.teamtoolbox.org. */
  roomsUrl?: string
  /** Origin the shareable link points at. Defaults to `location.origin`. */
  appOrigin?: string
  /** Reconnect backoff. Defaults to 0.5 s doubling up to 10 s. */
  reconnect?: { minDelayMs: number; maxDelayMs: number }
  /** Injectable for tests. Defaults to the global WebSocket. */
  WebSocket?: typeof WebSocket
}

type Listener<V> = (value: V) => void

interface Events<T, P> {
  records: ReadonlyMap<string, RoomRecord<T>>
  presence: ReadonlyMap<string, Peer<P>>
  status: RoomStatus
  error: ErrorCode
}

type Listeners<T, P> = { [K in keyof Events<T, P>]: Set<Listener<Events<T, P>[K]>> }

/**
 * A live, end-to-end encrypted room. Records and presence are encrypted before
 * they leave the browser and validated after they're decrypted.
 */
export class Room<T, P = never> {
  readonly link: string
  readonly roomId: string
  meta: RoomMeta | null = null
  /** This connection's peer ID, assigned by the server on each join. */
  self: string | null = null
  status: RoomStatus = 'connecting'
  closedReason: ClosedReason | null = null

  private readonly records = new Map<string, RoomRecord<T>>()
  /** Versions of deletes, so a late or replayed put can't resurrect a record. */
  private readonly deleted = new Map<string, number>()
  private readonly peers = new Map<string, Peer<P>>()
  private readonly listeners: Listeners<T, P> = {
    records: new Set(),
    presence: new Set(),
    status: new Set(),
    error: new Set(),
  }
  private ws: WebSocket | null = null
  private joined = false
  private outbox: ClientMessage[] = []
  private lastPresence: ClientMessage | null = null
  /** Server messages are handled one at a time, in order, even though decryption is async. */
  private queue: Promise<void> = Promise.resolve()
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private ready: { resolve: () => void; reject: (error: Error) => void } | null = null
  private createLifetime: LifetimeDays | null = null

  constructor(
    private readonly options: RoomOptions<T, P>,
    secret: Bytes,
    private readonly keys: RoomKeys,
  ) {
    this.roomId = keys.roomId
    this.link = roomLink(options.appOrigin ?? globalThis.location.origin, secret)
  }

  /** Opens the connection and resolves once the first snapshot has arrived. */
  connect(createLifetime?: LifetimeDays): Promise<void> {
    this.createLifetime = createLifetime ?? null
    return new Promise((resolve, reject) => {
      this.ready = { resolve, reject }
      this.openSocket()
    })
  }

  getRecords(): ReadonlyMap<string, RoomRecord<T>> {
    return this.records
  }

  getPeers(): ReadonlyMap<string, Peer<P>> {
    return this.peers
  }

  subscribe(listener: Listener<ReadonlyMap<string, RoomRecord<T>>>): () => void {
    return this.listen('records', listener)
  }

  onPresence(listener: Listener<ReadonlyMap<string, Peer<P>>>): () => void {
    return this.listen('presence', listener)
  }

  onStatus(listener: Listener<RoomStatus>): () => void {
    return this.listen('status', listener)
  }

  /** Non-fatal errors from the server, e.g. `too_large` or `rate_limited`. */
  onError(listener: Listener<ErrorCode>): () => void {
    return this.listen('error', listener)
  }

  /** A fresh opaque record ID. Never put meaning (names, types) into IDs: the server sees them. */
  newRecordId(): string {
    return randomId()
  }

  async put(id: string, value: T): Promise<void> {
    const c = await sealJson(this.keys.key, value, this.context(id))
    this.send({ t: 'put', id, c })
  }

  remove(id: string): void {
    this.send({ t: 'del', id })
  }

  async setPresence(presence: P): Promise<void> {
    const c = await sealJson(this.keys.key, presence, this.context(PRESENCE_ID))
    this.lastPresence = { t: 'presence', c }
    this.send(this.lastPresence)
  }

  /** Wipes the room for everyone. */
  destroy(): void {
    this.send({ t: 'destroy' })
  }

  /** Leaves the room. Other people stay connected. */
  close(): void {
    this.finish('left')
    this.ws?.close(1000)
  }

  private listen<K extends keyof Events<T, P>>(
    kind: K,
    listener: Listener<Events<T, P>[K]>,
  ): () => void {
    const set: Set<Listener<Events<T, P>[K]>> = this.listeners[kind]
    set.add(listener)
    return () => {
      set.delete(listener)
    }
  }

  private context(recordId: string) {
    return { tool: this.options.tool, roomId: this.roomId, recordId }
  }

  private openSocket(): void {
    const Socket = this.options.WebSocket ?? globalThis.WebSocket
    const base = this.options.roomsUrl ?? DEFAULT_ROOMS_URL
    const ws = new Socket(`${base}/v1/${this.options.tool}/${this.roomId}`)
    this.ws = ws
    this.joined = false
    ws.onopen = () => {
      const hello: ClientMessage = this.createLifetime
        ? { t: 'hello', v: PROTOCOL_VERSION, create: { lifetimeDays: this.createLifetime } }
        : { t: 'hello', v: PROTOCOL_VERSION }
      ws.send(JSON.stringify(hello))
    }
    ws.onmessage = (event) => {
      const message = typeof event.data === 'string' ? parseServerMessage(event.data) : null
      if (message) this.queue = this.queue.then(() => this.handle(message))
    }
    ws.onclose = (event) => {
      if (this.ws === ws) this.handleClose(event.code)
    }
  }

  private async handle(message: ServerMessage): Promise<void> {
    switch (message.t) {
      case 'snapshot':
        return this.applySnapshot(message)
      case 'put': {
        const current = this.records.get(message.id)
        if ((current && current.v >= message.v) || (this.deleted.get(message.id) ?? 0) >= message.v)
          return
        const value = await this.openRecord(message.id, message.c)
        // A record that fails to decrypt or validate is garbage on the server too, so drop it.
        if (value === undefined) this.records.delete(message.id)
        else this.records.set(message.id, { id: message.id, value, v: message.v })
        return this.emit('records', this.records)
      }
      case 'del': {
        const current = this.records.get(message.id)
        this.deleted.set(message.id, message.v)
        if (current && current.v < message.v) {
          this.records.delete(message.id)
          this.emit('records', this.records)
        }
        return
      }
      case 'presence': {
        const presence = await this.openPresence(message.c)
        this.peers.set(message.peer, { peer: message.peer, presence })
        return this.emit('presence', this.peers)
      }
      case 'peer_left':
        this.peers.delete(message.peer)
        return this.emit('presence', this.peers)
      case 'error':
        return this.emit('error', message.code)
    }
  }

  private async applySnapshot(message: Extract<ServerMessage, { t: 'snapshot' }>): Promise<void> {
    const records = await Promise.all(
      message.records.map(async (record) => ({
        ...record,
        value: await this.openRecord(record.id, record.c),
      })),
    )
    const peers = await Promise.all(
      message.peers.map(async (peer) => ({
        peer: peer.peer,
        presence: peer.c === null ? null : await this.openPresence(peer.c),
      })),
    )

    this.records.clear()
    this.deleted.clear()
    for (const record of records) {
      if (record.value !== undefined)
        this.records.set(record.id, { id: record.id, value: record.value, v: record.v })
    }
    this.peers.clear()
    for (const peer of peers) this.peers.set(peer.peer, peer)
    this.meta = message.meta
    this.self = message.self
    this.joined = true
    // The room exists now, so reconnects must never try to create it again.
    this.createLifetime = null
    this.attempts = 0

    const pending = this.outbox
    this.outbox = []
    if (this.lastPresence) pending.unshift(this.lastPresence)
    for (const queued of pending) this.send(queued)

    this.setStatus('open')
    this.emit('records', this.records)
    this.emit('presence', this.peers)
    this.ready?.resolve()
    this.ready = null
  }

  private async openRecord(id: string, c: string): Promise<T | undefined> {
    try {
      const result = this.options.recordSchema.safeParse(
        await openJson(this.keys.key, c, this.context(id)),
      )
      return result.success ? result.data : undefined
    } catch {
      return undefined
    }
  }

  private async openPresence(c: string): Promise<P | null> {
    if (!this.options.presenceSchema) return null
    try {
      const json = await openJson(this.keys.key, c, this.context(PRESENCE_ID))
      const result = this.options.presenceSchema.safeParse(json)
      return result.success ? result.data : null
    } catch {
      return null
    }
  }

  private send(message: ClientMessage): void {
    if (this.status === 'closed') return
    if (this.ws && this.joined && this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else if (message.t !== 'presence') {
      // Presence is replayed from lastPresence instead of queued.
      this.outbox.push(message)
    }
  }

  private handleClose(code: number): void {
    if (this.status === 'closed') return
    const reason = TERMINAL_CLOSE_CODES[code]
    if (reason) {
      this.finish(reason)
      return
    }

    this.joined = false
    this.peers.clear()
    this.emit('presence', this.peers)
    this.setStatus('reconnecting')
    const { minDelayMs, maxDelayMs } = this.options.reconnect ?? {
      minDelayMs: 500,
      maxDelayMs: 10_000,
    }
    const delay =
      Math.min(maxDelayMs, minDelayMs * 2 ** this.attempts) * (0.75 + Math.random() * 0.5)
    this.attempts += 1
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay)
  }

  private finish(reason: ClosedReason): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.closedReason = reason
    this.outbox = []
    this.setStatus('closed')
    this.ready?.reject(new RoomClosedError(reason))
    this.ready = null
  }

  private setStatus(status: RoomStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit('status', status)
  }

  private emit<K extends keyof Events<T, P>>(kind: K, value: Events<T, P>[K]): void {
    const set: Set<Listener<Events<T, P>[K]>> = this.listeners[kind]
    for (const listener of set) listener(value)
  }
}

export type CreateRoomOptions<T, P> = RoomOptions<T, P> & { lifetimeDays: LifetimeDays }
export type OpenRoomOptions<T, P> = RoomOptions<T, P> & { link: string }

/** Creates a new room with a fresh secret. Share `room.link` to invite people. */
export async function createRoom<T, P = never>(
  options: CreateRoomOptions<T, P>,
): Promise<Room<T, P>> {
  const secret = generateSecret()
  const room = new Room(options, secret, await deriveRoomKeys(secret))
  await room.connect(options.lifetimeDays)
  return room
}

/** Joins an existing room from its link (or `location.href`). */
export async function openRoom<T, P = never>(options: OpenRoomOptions<T, P>): Promise<Room<T, P>> {
  const secret = secretFromLink(options.link)
  const room = new Room(options, secret, await deriveRoomKeys(secret))
  await room.connect()
  return room
}
