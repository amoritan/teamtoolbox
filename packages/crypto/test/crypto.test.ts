import { hkdfSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DecryptionError,
  deriveRoomKeys,
  fromBase64Url,
  generateSecret,
  open,
  openJson,
  PADDING_BUCKET,
  pad,
  roomLink,
  seal,
  sealJson,
  secretFromLink,
  toBase64Url,
  unpad,
} from '../src/index'

const context = { tool: 'retro', roomId: 'AAAAAAAAAAAAAAAAAAAAAA', recordId: 'card-1' }

describe('base64url', () => {
  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256).map((_, i) => i)
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
  })

  it('uses the URL-safe alphabet without padding', () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
  })

  it('rejects other characters', () => {
    expect(() => fromBase64Url('abc+')).toThrow(TypeError)
  })
})

describe('deriveRoomKeys', () => {
  it('matches an independent HKDF implementation', async () => {
    const secret = new Uint8Array(32).fill(7)
    const expected = new Uint8Array(
      hkdfSync('sha256', secret, new Uint8Array(0), 'teamtoolbox/v1/room-id', 16),
    )
    const { roomId } = await deriveRoomKeys(secret)
    expect(roomId).toBe(toBase64Url(expected))
    expect(roomId).toHaveLength(22)
  })

  it('gives different secrets different room IDs', async () => {
    const [a, b] = await Promise.all([
      deriveRoomKeys(generateSecret()),
      deriveRoomKeys(generateSecret()),
    ])
    expect(a.roomId).not.toBe(b.roomId)
  })

  it('makes the encryption key non-extractable', async () => {
    const { key } = await deriveRoomKeys(generateSecret())
    expect(key.extractable).toBe(false)
  })
})

describe('padding', () => {
  it('pads to whole buckets and always adds a marker', () => {
    expect(pad(new Uint8Array(0))).toHaveLength(PADDING_BUCKET)
    expect(pad(new Uint8Array(PADDING_BUCKET - 1))).toHaveLength(PADDING_BUCKET)
    expect(pad(new Uint8Array(PADDING_BUCKET))).toHaveLength(PADDING_BUCKET * 2)
  })

  it('round-trips content that ends in zeros', () => {
    const data = new Uint8Array([1, 2, 0, 0])
    expect(unpad(pad(data))).toEqual(data)
  })
})

describe('seal and open', () => {
  it('round-trips JSON', async () => {
    const { key } = await deriveRoomKeys(generateSecret())
    const value = { type: 'card', text: 'Deploys are slow 🐢', column: 2 }
    expect(await openJson(key, await sealJson(key, value, context), context)).toEqual(value)
  })

  it('uses a fresh IV every time', async () => {
    const { key } = await deriveRoomKeys(generateSecret())
    const plaintext = new Uint8Array([1, 2, 3])
    expect(await seal(key, plaintext, context)).not.toEqual(await seal(key, plaintext, context))
  })

  it('hides lengths within a bucket', async () => {
    const { key } = await deriveRoomKeys(generateSecret())
    const short = await sealJson(key, 'a', context)
    const longer = await sealJson(key, 'a'.repeat(200), context)
    expect(short.length).toBe(longer.length)
  })

  it('rejects tampered ciphertext', async () => {
    const { key } = await deriveRoomKeys(generateSecret())
    const sealed = await seal(key, new Uint8Array([1, 2, 3]), context)
    sealed[sealed.length - 1] = (sealed[sealed.length - 1] ?? 0) ^ 1
    await expect(open(key, sealed, context)).rejects.toBeInstanceOf(DecryptionError)
  })

  it('rejects a record moved to another record, room or tool', async () => {
    const { key } = await deriveRoomKeys(generateSecret())
    const sealed = await sealJson(key, 'hello', context)
    for (const moved of [
      { ...context, recordId: 'card-2' },
      { ...context, roomId: 'BBBBBBBBBBBBBBBBBBBBBB' },
      { ...context, tool: 'healthcheck' },
    ]) {
      await expect(openJson(key, sealed, moved)).rejects.toBeInstanceOf(DecryptionError)
    }
  })

  it('rejects the wrong key', async () => {
    const [a, b] = await Promise.all([
      deriveRoomKeys(generateSecret()),
      deriveRoomKeys(generateSecret()),
    ])
    const sealed = await sealJson(a.key, 'hello', context)
    await expect(openJson(b.key, sealed, context)).rejects.toBeInstanceOf(DecryptionError)
  })

  it('rejects garbage input', async () => {
    const { key } = await deriveRoomKeys(generateSecret())
    await expect(openJson(key, 'not base64url!', context)).rejects.toBeInstanceOf(DecryptionError)
    await expect(openJson(key, 'AAAA', context)).rejects.toBeInstanceOf(DecryptionError)
  })
})

describe('links', () => {
  it('puts the secret only in the fragment', () => {
    const secret = generateSecret()
    const link = roomLink('https://retro.teamtoolbox.org', secret)
    const url = new URL(link)
    expect(url.pathname).toBe('/room')
    expect(url.search).toBe('')
    expect(secretFromLink(link)).toEqual(secret)
    expect(secretFromLink(url.hash)).toEqual(secret)
  })

  it('rejects links without a valid secret', () => {
    expect(() => secretFromLink('https://retro.teamtoolbox.org/room')).toThrow()
    expect(() => secretFromLink('#tooShort')).toThrow()
  })
})
