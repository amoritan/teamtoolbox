/**
 * Wire protocol between the browser room client and the rooms service.
 * Every message is JSON. Ciphertexts are base64url strings the server can't read.
 */
// Keep this a namespace import of zod/mini: bundlers then keep only what we use.
// `import { z }` or classic zod pulls in every locale, about 700 KB per bundle.
import * as z from 'zod/mini'
import type { Schema } from './schema'

export const PROTOCOL_VERSION = 1

export const LIFETIME_DAYS = [1, 7, 30, 90] as const
export type LifetimeDays = (typeof LIFETIME_DAYS)[number]

const base64UrlLength = (bytes: number) => Math.ceil((bytes * 4) / 3)

export const LIMITS = {
  maxConnectionsPerRoom: 50,
  maxRecordsPerRoom: 1000,
  maxRecordChars: base64UrlLength(16 * 1024),
  // Kept small so a peer's latest presence fits in its WebSocket attachment.
  maxPresenceChars: base64UrlLength(768),
  maxRoomChars: base64UrlLength(5 * 1000 * 1000),
  maxMessagesPerSecond: 30,
} as const

/** Upper bound for any single client message, with room for the JSON envelope. */
export const MAX_MESSAGE_CHARS = LIMITS.maxRecordChars + 512

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

/** WebSocket close codes the server uses. The client doesn't reconnect after these. */
export const CLOSE_CODES = {
  destroyed: 4000,
  expired: 4001,
  notFound: 4002,
  roomFull: 4003,
} as const

export const ERROR_CODES = [
  'not_found',
  'expired',
  'room_full',
  'too_many_records',
  'too_large',
  'rate_limited',
  'bad_message',
  'not_joined',
  'already_joined',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

const recordId = z.string().check(z.regex(ID_PATTERN))
const peerId = z.string().check(z.regex(ID_PATTERN))
const recordCiphertext = z
  .string()
  .check(z.regex(BASE64URL_PATTERN), z.maxLength(LIMITS.maxRecordChars))
const presenceCiphertext = z
  .string()
  .check(z.regex(BASE64URL_PATTERN), z.maxLength(LIMITS.maxPresenceChars))
const version = z.int().check(z.positive())

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    v: z.literal(PROTOCOL_VERSION),
    create: z.optional(z.object({ lifetimeDays: z.literal(LIFETIME_DAYS) })),
  }),
  z.object({ t: z.literal('put'), id: recordId, c: recordCiphertext }),
  z.object({ t: z.literal('del'), id: recordId }),
  z.object({ t: z.literal('presence'), c: presenceCiphertext }),
  z.object({ t: z.literal('destroy') }),
])
export type ClientMessage = z.infer<typeof clientMessageSchema>

export const roomMetaSchema = z.object({
  createdAt: z.int(),
  expiresAt: z.int(),
})
export type RoomMeta = z.infer<typeof roomMetaSchema>

export const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('snapshot'),
    self: peerId,
    meta: roomMetaSchema,
    records: z.array(z.object({ id: recordId, c: recordCiphertext, v: version })),
    peers: z.array(z.object({ peer: peerId, c: z.nullable(presenceCiphertext) })),
  }),
  z.object({ t: z.literal('put'), id: recordId, c: recordCiphertext, v: version }),
  z.object({ t: z.literal('del'), id: recordId, v: version }),
  z.object({ t: z.literal('presence'), peer: peerId, c: presenceCiphertext }),
  z.object({ t: z.literal('peer_left'), peer: peerId }),
  z.object({ t: z.literal('error'), code: z.enum(ERROR_CODES) }),
])
export type ServerMessage = z.infer<typeof serverMessageSchema>

function parseWith<T>(schema: Schema<T>, raw: string): T | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const result = schema.safeParse(json)
  return result.success ? result.data : null
}

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_CHARS) return null
  return parseWith(clientMessageSchema, raw)
}

export function parseServerMessage(raw: string): ServerMessage | null {
  return parseWith(serverMessageSchema, raw)
}
