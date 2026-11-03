import { describe, expect, it } from 'vitest'
import { isAllowedToolOrigin } from '../src/index'

describe('isAllowedToolOrigin', () => {
  it("allows the tool's own subdomain over https", () => {
    expect(isAllowedToolOrigin('https://retro.teamtoolbox.org', 'retro')).toBe(true)
  })

  it('rejects other tools, other sites and plain http', () => {
    expect(isAllowedToolOrigin('https://healthcheck.teamtoolbox.org', 'retro')).toBe(false)
    expect(isAllowedToolOrigin('https://teamtoolbox.org', 'retro')).toBe(false)
    expect(isAllowedToolOrigin('https://retro.teamtoolbox.org.evil.example', 'retro')).toBe(false)
    expect(isAllowedToolOrigin('http://retro.teamtoolbox.org', 'retro')).toBe(false)
    expect(isAllowedToolOrigin(null, 'retro')).toBe(false)
    expect(isAllowedToolOrigin('not a url', 'retro')).toBe(false)
  })

  it('allows extra host suffixes when configured', () => {
    expect(isAllowedToolOrigin('https://abc-retro.me.workers.dev', 'retro', '.workers.dev')).toBe(
      true,
    )
    expect(isAllowedToolOrigin('http://localhost:5173', 'retro', 'localhost')).toBe(true)
    expect(isAllowedToolOrigin('https://evilworkers.dev', 'retro', '.workers.dev')).toBe(false)
  })

  it('never allows plain http outside localhost', () => {
    expect(isAllowedToolOrigin('http://abc.me.workers.dev', 'retro', '.workers.dev')).toBe(false)
  })
})
