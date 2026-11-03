import { DurableObject } from 'cloudflare:workers'
import {
  CLOSE_CODES,
  type ClientMessage,
  type ErrorCode,
  LIMITS,
  parseClientMessage,
  type ServerMessage,
} from '@teamtoolbox/protocol'
import { parseRoomPath } from './routing'

const DAY_MS = 24 * 60 * 60 * 1000

/** Kept on each socket so it survives hibernation. */
interface Attachment {
  peer: string
  tool: string
  joined: boolean
  /** The peer's latest encrypted presence, replayed to people who join later. */
  presence: string | null
}

interface Meta {
  tool: string
  createdAt: number
  expiresAt: number
  /** Last version handed out. Every put and delete gets the next one. */
  seq: number
}

interface Bucket {
  tokens: number
  refilledAt: number
}

type Hello = Extract<ClientMessage, { t: 'hello' }>

function randomPeerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * One shared room. It stores opaque encrypted records, relays them in a single
 * order to everyone connected, and wipes itself when it expires. It never sees
 * plaintext and has no tool-specific logic.
 */
export class Room extends DurableObject<Cloudflare.Env> {
  /** Undefined until loaded, null when the room doesn't exist. */
  private meta: Meta | null | undefined
  /** Per-connection rate limits. In memory only, so hibernation resets them, which is fine. */
  private buckets = new Map<WebSocket, Bucket>()

  override async fetch(request: Request): Promise<Response> {
    const route = parseRoomPath(new URL(request.url).pathname)
    if (!route) return new Response('Not found', { status: 404 })

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket]
    this.ctx.acceptWebSocket(server)
    const attachment: Attachment = {
      peer: randomPeerId(),
      tool: route.tool,
      joined: false,
      presence: null,
    }
    server.serializeAttachment(attachment)
    if (this.ctx.getWebSockets().length > LIMITS.maxConnectionsPerRoom) {
      server.close(CLOSE_CODES.roomFull, 'room_full')
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.takeToken(ws)) return this.sendError(ws, 'rate_limited')
    const message = typeof raw === 'string' ? parseClientMessage(raw) : null
    if (!message) return this.sendError(ws, 'bad_message')

    const attachment = ws.deserializeAttachment() as Attachment
    if (message.t === 'hello') return this.hello(ws, attachment, message)
    if (!attachment.joined) return this.sendError(ws, 'not_joined')

    const meta = await this.liveMeta()
    if (!meta) return

    switch (message.t) {
      case 'put':
        return this.put(ws, meta, message.id, message.c)
      case 'del':
        return this.del(meta, message.id)
      case 'presence':
        attachment.presence = message.c
        ws.serializeAttachment(attachment)
        return this.broadcast({ t: 'presence', peer: attachment.peer, c: message.c }, ws)
      case 'destroy':
        return this.wipe(CLOSE_CODES.destroyed, 'destroyed')
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.disconnect(ws)
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.disconnect(ws)
  }

  override async alarm(): Promise<void> {
    await this.wipe(CLOSE_CODES.expired, 'expired')
  }

  private async hello(ws: WebSocket, attachment: Attachment, message: Hello): Promise<void> {
    if (attachment.joined) return this.sendError(ws, 'already_joined')

    let meta = this.loadMeta()
    if (!meta) {
      // Typos don't create rooms: without the create flag, nothing is stored.
      if (!message.create) return ws.close(CLOSE_CODES.notFound, 'not_found')
      meta = await this.create(attachment.tool, message.create.lifetimeDays)
    }
    if (Date.now() >= meta.expiresAt) return this.wipe(CLOSE_CODES.expired, 'expired')

    attachment.joined = true
    ws.serializeAttachment(attachment)
    const records = this.ctx.storage.sql
      .exec<{ id: string; c: string; v: number }>('SELECT id, c, v FROM records ORDER BY v')
      .toArray()
    const peers = this.joinedSockets()
      .filter((socket) => socket !== ws)
      .map((socket) => {
        const other = socket.deserializeAttachment() as Attachment
        return { peer: other.peer, c: other.presence }
      })
    this.send(ws, {
      t: 'snapshot',
      self: attachment.peer,
      meta: { createdAt: meta.createdAt, expiresAt: meta.expiresAt },
      records,
      peers,
    })
  }

  private async create(tool: string, lifetimeDays: number): Promise<Meta> {
    const now = Date.now()
    const meta: Meta = { tool, createdAt: now, expiresAt: now + lifetimeDays * DAY_MS, seq: 0 }
    const { sql } = this.ctx.storage
    this.ctx.storage.transactionSync(() => {
      sql.exec(`CREATE TABLE meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        tool TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        seq INTEGER NOT NULL
      )`)
      sql.exec('CREATE TABLE records (id TEXT PRIMARY KEY, c TEXT NOT NULL, v INTEGER NOT NULL)')
      sql.exec(
        'INSERT INTO meta (id, tool, created_at, expires_at, seq) VALUES (1, ?, ?, ?, 0)',
        tool,
        meta.createdAt,
        meta.expiresAt,
      )
    })
    await this.ctx.storage.setAlarm(meta.expiresAt)
    this.meta = meta
    return meta
  }

  private put(ws: WebSocket, meta: Meta, id: string, c: string): void {
    const { sql } = this.ctx.storage
    const existing = sql
      .exec<{ size: number }>('SELECT length(c) AS size FROM records WHERE id = ?', id)
      .toArray()[0]
    if (!existing) {
      const { count } = sql.exec<{ count: number }>('SELECT count(*) AS count FROM records').one()
      if (count >= LIMITS.maxRecordsPerRoom) {
        this.sendError(ws, 'too_many_records')
        return
      }
    }
    const { total } = sql
      .exec<{ total: number }>('SELECT coalesce(sum(length(c)), 0) AS total FROM records')
      .one()
    if (total - (existing?.size ?? 0) + c.length > LIMITS.maxRoomChars) {
      this.sendError(ws, 'too_large')
      return
    }

    const v = this.ctx.storage.transactionSync(() => {
      const next = this.bumpVersion(meta)
      sql.exec(
        'INSERT INTO records (id, c, v) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET c = excluded.c, v = excluded.v',
        id,
        c,
        next,
      )
      return next
    })
    this.broadcast({ t: 'put', id, c, v })
  }

  private del(meta: Meta, id: string): void {
    const v = this.ctx.storage.transactionSync(() => {
      const deleted = this.ctx.storage.sql
        .exec('DELETE FROM records WHERE id = ? RETURNING id', id)
        .toArray()
      return deleted.length > 0 ? this.bumpVersion(meta) : null
    })
    if (v !== null) this.broadcast({ t: 'del', id, v })
  }

  private bumpVersion(meta: Meta): number {
    meta.seq += 1
    this.ctx.storage.sql.exec('UPDATE meta SET seq = ? WHERE id = 1', meta.seq)
    return meta.seq
  }

  private loadMeta(): Meta | null {
    if (this.meta !== undefined) return this.meta
    const { sql } = this.ctx.storage
    // Reading sqlite_master writes nothing, so probing a room that doesn't exist stores nothing.
    const hasTable =
      sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'").toArray()
        .length > 0
    const row = hasTable
      ? sql
          .exec<{ tool: string; created_at: number; expires_at: number; seq: number }>(
            'SELECT tool, created_at, expires_at, seq FROM meta WHERE id = 1',
          )
          .toArray()[0]
      : undefined
    this.meta = row
      ? { tool: row.tool, createdAt: row.created_at, expiresAt: row.expires_at, seq: row.seq }
      : null
    return this.meta
  }

  /** The room's metadata if it exists and hasn't expired. Wipes it if it has. */
  private async liveMeta(): Promise<Meta | null> {
    const meta = this.loadMeta()
    if (meta && Date.now() >= meta.expiresAt) {
      await this.wipe(CLOSE_CODES.expired, 'expired')
      return null
    }
    return meta
  }

  /** Disconnects everyone and deletes everything the room ever stored. */
  private async wipe(code: number, reason: string): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.close(code, reason)
      } catch {
        // Already closing.
      }
    }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.meta = null
  }

  private disconnect(ws: WebSocket): void {
    this.buckets.delete(ws)
    const attachment = ws.deserializeAttachment() as Attachment | null
    if (attachment?.joined) this.broadcast({ t: 'peer_left', peer: attachment.peer }, ws)
  }

  private joinedSockets(): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((socket) => (socket.deserializeAttachment() as Attachment | null)?.joined)
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    const data = JSON.stringify(message)
    for (const socket of this.joinedSockets()) {
      if (socket === except) continue
      try {
        socket.send(data)
      } catch {
        // The socket is closing; its close handler cleans up.
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // The socket is closing.
    }
  }

  private sendError(ws: WebSocket, code: ErrorCode): void {
    this.send(ws, { t: 'error', code })
  }

  private takeToken(ws: WebSocket): boolean {
    const rate = LIMITS.maxMessagesPerSecond
    const now = Date.now()
    const bucket = this.buckets.get(ws) ?? { tokens: rate, refilledAt: now }
    bucket.tokens = Math.min(rate, bucket.tokens + ((now - bucket.refilledAt) / 1000) * rate)
    bucket.refilledAt = now
    this.buckets.set(ws, bucket)
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }
}
