import { describe, expect, it } from 'vitest'
import { getTool, TOOL_SLUG_PATTERN, toolOrigin, tools } from '../src/index'

describe('registry', () => {
  it('has unique slugs that are valid subdomain labels', () => {
    const slugs = tools.map((tool) => tool.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(TOOL_SLUG_PATTERN)
  })

  it('gives every tool ad keywords', () => {
    for (const tool of tools) expect(tool.adKeywords.length).toBeGreaterThan(0)
  })

  it('reserves the subdomains used by shared services', () => {
    for (const reserved of ['www', 'rooms', 'ads']) expect(getTool(reserved)).toBeUndefined()
  })

  it('builds tool origins on the root domain', () => {
    expect(toolOrigin('retro')).toBe('https://retro.teamtoolbox.org')
  })
})
