import { kindLabels } from '@teamtoolbox/registry'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PrivacyBadge } from '../src/PrivacyBadge'

describe('PrivacyBadge', () => {
  it.each(['local', 'collaborative'] as const)('labels %s tools in words', (kind) => {
    render(<PrivacyBadge kind={kind} />)
    expect(screen.getByText(kindLabels[kind])).toBeTruthy()
  })

  it('hides its decorative icon from screen readers', () => {
    const { container } = render(<PrivacyBadge kind="collaborative" />)
    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
    // Sized and stroked through attributes and classes, never inline styles (the CSP)
    expect(icon?.getAttribute('style')).toBeNull()
  })
})
