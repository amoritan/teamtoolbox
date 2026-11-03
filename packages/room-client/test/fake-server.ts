/**
 * A tiny in-memory stand-in for the rooms service, speaking the same protocol.
 * The real service has its own tests; this one exists to exercise the client.
 */
import {
  CLOSE_CODES,
  type ClientMessage,
  parseClientMessage,
  type RoomMeta,
  type ServerMessage,
} from '@teamtoolbox/protocol'

interface FakeRoom {
  meta: RoomMeta
  records: Map<string, { c: string; v: number }>
  seq: number
  sockets: Set<FakeSocket>
}

let peerCounter = 0

export class FakeSocket {
  readonly OPEN = 1
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  readonly peer = `peer${++peerCounter}`
  readonly roomKey: string
  presence: string | null = null

  constructor(
    url: string,
    private readonly server: FakeRoomServer,
  ) {
    this.roomKey = new URL(url).pathname
    server.sockets.add(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
    })
  }

  send(data: string): void {
    this.server.log.push(data)
    queueMicrotask(() => this.server.receive(this, data))
  }

  close(code = 1000): void {
    this.server.disconnect(this, code)
  }

  deliver(message: ServerMessage): void {
    if (this.readyState !== 1) return
    const data = JSON.stringify(message)
    queueMicrotask(() => this.onmessage?.({ data }))
  }

  terminate(code: number): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.server.sockets.delete(this)
    queueMicrotask(() => this.onclose?.({ code }))
  }
}

export class FakeRoomServer {
  readonly rooms = new Map<string, FakeRoom>()
  readonly sockets = new Set<FakeSocket>()
  /** Every raw message a client sent, to check nothing leaks in plaintext. */
  readonly log: string[] = []
  /** Pass this as the client's `WebSocket` option. */
  readonly WebSocket: typeof WebSocket

  constructor() {
    const server = this
    class Socket extends FakeSocket {
      constructor(url: string) {
        super(url, server)
      }
    }
    this.WebSocket = Socket as unknown as typeof WebSocket
  }

  receive(socket: FakeSocket, data: string): void {
    const message = parseClientMessage(data)
    if (!message) {
      socket.deliver({ t: 'error', code: 'bad_message' })
      return
    }
    if (message.t === 'hello') {
      this.hello(socket, message)
      return
    }

    const room = this.rooms.get(socket.roomKey)
    if (!room?.sockets.has(socket)) {
      socket.deliver({ t: 'error', code: 'not_joined' })
      return
    }
    switch (message.t) {
      case 'put': {
        const v = ++room.seq
        room.records.set(message.id, { c: message.c, v })
        this.broadcast(room, { t: 'put', id: message.id, c: message.c, v })
        break
      }
      case 'del':
        if (room.records.delete(message.id)) {
          this.broadcast(room, { t: 'del', id: message.id, v: ++room.seq })
        }
        break
      case 'presence':
        socket.presence = message.c
        this.broadcast(room, { t: 'presence', peer: socket.peer, c: message.c }, socket)
        break
      case 'destroy':
        for (const member of room.sockets) member.terminate(CLOSE_CODES.destroyed)
        this.rooms.delete(socket.roomKey)
    }
  }

  disconnect(socket: FakeSocket, code: number): void {
    const room = this.rooms.get(socket.roomKey)
    socket.terminate(code)
    if (room?.sockets.delete(socket)) this.broadcast(room, { t: 'peer_left', peer: socket.peer })
  }

  /** Simulates a network drop for every connection. */
  dropAll(): void {
    for (const socket of [...this.sockets]) this.disconnect(socket, 1006)
  }

  /** Writes a record directly, as a malicious or buggy client could. */
  inject(roomKey: string, id: string, c: string): void {
    const room = this.rooms.get(roomKey)
    if (!room) throw new Error('No such room')
    const v = ++room.seq
    room.records.set(id, { c, v })
    this.broadcast(room, { t: 'put', id, c, v })
  }

  private hello(socket: FakeSocket, message: Extract<ClientMessage, { t: 'hello' }>): void {
    let room = this.rooms.get(socket.roomKey)
    if (!room) {
      if (!message.create) {
        socket.terminate(CLOSE_CODES.notFound)
        return
      }
      const now = Date.now()
      room = {
        meta: { createdAt: now, expiresAt: now + message.create.lifetimeDays * 86_400_000 },
        records: new Map(),
        seq: 0,
        sockets: new Set(),
      }
      this.rooms.set(socket.roomKey, room)
    }
    const peers = [...room.sockets].map((other) => ({ peer: other.peer, c: other.presence }))
    room.sockets.add(socket)
    socket.deliver({
      t: 'snapshot',
      self: socket.peer,
      meta: room.meta,
      records: [...room.records].map(([id, record]) => ({ id, ...record })),
      peers,
    })
  }

  private broadcast(room: FakeRoom, message: ServerMessage, except?: FakeSocket): void {
    for (const socket of room.sockets) if (socket !== except) socket.deliver(message)
  }
}
