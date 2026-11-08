import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from '../src/Logo'

describe('Logo', () => {
  it('reads as "teamtoolbox" and hides the mark next to the wordmark', () => {
    const { container } = render(<Logo />)
    expect(container.textContent).toBe('teamtoolbox')
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('labels the mark when it stands alone', () => {
    const { container } = render(<Logo wordmark={false} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('teamtoolbox')
  })

  it('draws three ink tiles and one accent tile, coloured by tokens only', () => {
    const { container } = render(<Logo size={16} />)
    const tiles = [...container.querySelectorAll('rect')]
    expect(tiles.map((t) => t.getAttribute('class'))).toEqual([
      'fill-ink',
      'fill-ink',
      'fill-ink',
      'fill-accent',
    ])
    expect(tiles.some((t) => t.hasAttribute('fill') || t.hasAttribute('style'))).toBe(false)
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('16')
  })
})
