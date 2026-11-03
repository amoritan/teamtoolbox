import { type Bytes, fromBase64Url, toBase64Url } from './base64url'

/** 256-bit room secret. It only ever lives in the link's #fragment and in memory. */
export const SECRET_BYTES = 32

export function generateSecret(): Bytes {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES))
}

export function encodeSecret(secret: Uint8Array): string {
  if (secret.length !== SECRET_BYTES) throw new TypeError('A room secret is 32 bytes')
  return toBase64Url(secret)
}

export function decodeSecret(text: string): Bytes {
  const secret = fromBase64Url(text)
  if (secret.length !== SECRET_BYTES) throw new TypeError('A room secret is 32 bytes')
  return secret
}

/** Opaque random identifier, e.g. for records. 16 bytes → 22 characters. */
export function randomId(byteLength = 16): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}
