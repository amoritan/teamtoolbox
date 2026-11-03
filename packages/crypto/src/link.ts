import type { Bytes } from './base64url'
import { decodeSecret, encodeSecret } from './secret'

/** The room view's path is constant, so nothing room-specific is ever sent to a server. */
export const ROOM_PATH = '/room'

export function roomLink(appOrigin: string, secret: Uint8Array): string {
  return `${appOrigin}${ROOM_PATH}#${encodeSecret(secret)}`
}

/** Reads the secret from a link or a `location.hash`. Throws if it isn't one. */
export function secretFromLink(linkOrHash: string): Bytes {
  const hashIndex = linkOrHash.indexOf('#')
  return decodeSecret(hashIndex === -1 ? linkOrHash : linkOrHash.slice(hashIndex + 1))
}
