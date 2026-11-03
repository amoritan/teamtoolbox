import { type Bytes, toBase64Url } from './base64url'

const encoder = new TextEncoder()
const NO_SALT = new Uint8Array(0)

// The v1 labels let future versions change algorithms without breaking old links.
const ROOM_ID_INFO = encoder.encode('teamtoolbox/v1/room-id')
const ENCRYPTION_KEY_INFO = encoder.encode('teamtoolbox/v1/enc')

export interface RoomKeys {
  /** 128-bit identifier the server sees. Can't be reversed into the secret. */
  roomId: string
  /** Non-extractable AES-256-GCM key. Never leaves the browser. */
  key: CryptoKey
}

export async function deriveRoomKeys(secret: Bytes): Promise<RoomKeys> {
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ])
  const roomIdBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: NO_SALT, info: ROOM_ID_INFO },
    material,
    128,
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: NO_SALT, info: ENCRYPTION_KEY_INFO },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return { roomId: toBase64Url(new Uint8Array(roomIdBits)), key }
}
