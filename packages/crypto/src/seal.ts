import { type Bytes, fromBase64Url, toBase64Url } from './base64url'

const IV_BYTES = 12
const TAG_BYTES = 16
/** Plaintexts are padded to multiples of this to blur their length. */
export const PADDING_BUCKET = 256

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** What a ciphertext is bound to. Moving it anywhere else makes decryption fail. */
export interface SealContext {
  tool: string
  roomId: string
  recordId: string
}

export class DecryptionError extends Error {
  constructor() {
    super('Could not decrypt: wrong key, wrong context or tampered data')
    this.name = 'DecryptionError'
  }
}

function additionalData({ tool, roomId, recordId }: SealContext): Bytes {
  return encoder.encode(`teamtoolbox/v1|${tool}|${roomId}|${recordId}`)
}

/** ISO/IEC 7816-4 padding: a 0x80 marker, then zeros up to the bucket boundary. */
export function pad(data: Uint8Array): Bytes {
  const padded = new Uint8Array(Math.ceil((data.length + 1) / PADDING_BUCKET) * PADDING_BUCKET)
  padded.set(data)
  padded[data.length] = 0x80
  return padded
}

export function unpad(data: Bytes): Bytes {
  let end = data.length - 1
  while (end >= 0 && data[end] === 0) end--
  if (end < 0 || data[end] !== 0x80) throw new DecryptionError()
  return data.slice(0, end)
}

export async function seal(
  key: CryptoKey,
  plaintext: Uint8Array,
  context: SealContext,
): Promise<Bytes> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(context) },
    key,
    pad(plaintext),
  )
  const sealed = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  sealed.set(iv)
  sealed.set(new Uint8Array(ciphertext), IV_BYTES)
  return sealed
}

export async function open(key: CryptoKey, sealed: Bytes, context: SealContext): Promise<Bytes> {
  if (sealed.length < IV_BYTES + TAG_BYTES) throw new DecryptionError()
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(0, IV_BYTES), additionalData: additionalData(context) },
      key,
      sealed.slice(IV_BYTES),
    )
    return unpad(new Uint8Array(plaintext))
  } catch {
    throw new DecryptionError()
  }
}

/** Encrypts a JSON value and returns base64url text, ready for the wire. */
export async function sealJson(
  key: CryptoKey,
  value: unknown,
  context: SealContext,
): Promise<string> {
  return toBase64Url(await seal(key, encoder.encode(JSON.stringify(value)), context))
}

/** Decrypts base64url text from the wire. The result still needs schema validation. */
export async function openJson(
  key: CryptoKey,
  sealed: string,
  context: SealContext,
): Promise<unknown> {
  let bytes: Bytes
  try {
    bytes = fromBase64Url(sealed)
  } catch {
    throw new DecryptionError()
  }
  const plaintext = await open(key, bytes, context)
  try {
    return JSON.parse(decoder.decode(plaintext))
  } catch {
    throw new DecryptionError()
  }
}
