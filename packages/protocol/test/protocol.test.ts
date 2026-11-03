import { describe, expect, it } from 'vitest'
import { LIMITS, parseAd, parseClientMessage, parseServerMessage } from '../src/index'

describe('client messages', () => {
  it('accepts a hello that creates a room', () => {
    expect(parseClientMessage('{"t":"hello","v":1,"create":{"lifetimeDays":30}}')).toEqual({
      t: 'hello',
      v: 1,
      create: { lifetimeDays: 30 },
    })
  })

  it('rejects lifetimes outside the allowed set', () => {
    expect(parseClientMessage('{"t":"hello","v":1,"create":{"lifetimeDays":365}}')).toBeNull()
  })

  it('rejects other protocol versions', () => {
    expect(parseClientMessage('{"t":"hello","v":2}')).toBeNull()
  })

  it('rejects records over the size limit', () => {
    const c = 'A'.repeat(LIMITS.maxRecordChars + 1)
    expect(parseClientMessage(JSON.stringify({ t: 'put', id: 'abc', c }))).toBeNull()
  })

  it('rejects ciphertext that is not base64url', () => {
    expect(parseClientMessage('{"t":"put","id":"abc","c":"<script>"}')).toBeNull()
  })

  it('rejects unknown types and invalid JSON', () => {
    expect(parseClientMessage('{"t":"list"}')).toBeNull()
    expect(parseClientMessage('{')).toBeNull()
  })
})

describe('server messages', () => {
  it('accepts a snapshot', () => {
    const snapshot = {
      t: 'snapshot',
      self: 'p1',
      meta: { createdAt: 1, expiresAt: 2 },
      records: [{ id: 'r1', c: 'AAAA', v: 1 }],
      peers: [{ peer: 'p2', c: null }],
    }
    expect(parseServerMessage(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('rejects unknown error codes', () => {
    expect(parseServerMessage('{"t":"error","code":"oops"}')).toBeNull()
  })
})

describe('ads', () => {
  const ad = {
    id: 'house-directory',
    kind: 'house',
    label: 'From teamtoolbox',
    title: 'More tools for your team',
    body: 'Free, private, no sign-up.',
    href: 'https://teamtoolbox.org',
  }

  it('accepts a valid ad', () => {
    expect(parseAd(ad)).toEqual(ad)
  })

  it('rejects non-https links', () => {
    expect(parseAd({ ...ad, href: 'javascript:alert(1)' })).toBeNull()
    expect(parseAd({ ...ad, href: 'http://example.com' })).toBeNull()
  })

  it('allows http on localhost for development', () => {
    expect(parseAd({ ...ad, href: 'http://localhost:8788/v1/c/x' })).not.toBeNull()
  })

  it('rejects oversized text', () => {
    expect(parseAd({ ...ad, title: 'x'.repeat(61) })).toBeNull()
  })
})
