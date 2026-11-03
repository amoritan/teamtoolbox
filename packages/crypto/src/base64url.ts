export type Bytes = Uint8Array<ArrayBuffer>

const BASE64URL = /^[A-Za-z0-9_-]*$/

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Bytes {
  if (!BASE64URL.test(text) || text.length % 4 === 1) {
    throw new TypeError('Invalid base64url string')
  }
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Length of the base64url encoding of `byteLength` bytes, without padding. */
export function base64UrlLength(byteLength: number): number {
  return Math.ceil((byteLength * 4) / 3)
}
