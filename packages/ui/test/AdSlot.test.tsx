import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdSlot, FALLBACK_AD } from '../src/index'

const sponsor = {
  id: 'sponsor-a',
  kind: 'sponsor',
  label: 'Sponsor',
  title: 'Ship faster with Example',
  body: 'A sponsor message.',
  href: 'https://ads.teamtoolbox.org/v1/c/sponsor-a?tool=retro',
}

function mockFetch(implementation: () => Promise<Response>) {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AdSlot', () => {
  it('fetches from our ads service without cookies or referrer', async () => {
    const fetchMock = mockFetch(async () => Response.json(sponsor))
    render(<AdSlot tool="retro" endpoint="https://ads.test" />)
    await screen.findByText(sponsor.title)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://ads.test/v1/slot?tool=retro')
    expect(init.credentials).toBe('omit')
    expect(init.referrerPolicy).toBe('no-referrer')
  })

  it('renders the ad as a labelled sponsored link', async () => {
    mockFetch(async () => Response.json(sponsor))
    render(<AdSlot tool="retro" />)
    const link = await screen.findByRole('link')
    expect(link.getAttribute('href')).toBe(sponsor.href)
    expect(link.getAttribute('rel')).toBe('sponsored noopener noreferrer')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByText('Sponsor')).toBeTruthy()
  })

  it('treats ad text as text, never as HTML', async () => {
    mockFetch(async () => Response.json({ ...sponsor, title: '<img src=x onerror=alert(1)>' }))
    const { container } = render(<AdSlot tool="retro" />)
    await screen.findByText('<img src=x onerror=alert(1)>')
    expect(container.querySelector('img')).toBeNull()
  })

  it('falls back to a house ad when the response is invalid', async () => {
    mockFetch(async () => Response.json({ ...sponsor, href: 'javascript:alert(1)' }))
    render(<AdSlot tool="retro" />)
    expect((await screen.findByRole('link')).getAttribute('href')).toBe(FALLBACK_AD.href)
  })

  it('falls back to a house ad when the service is unreachable', async () => {
    mockFetch(async () => {
      throw new TypeError('Network error')
    })
    render(<AdSlot tool="retro" />)
    expect(await screen.findByText(FALLBACK_AD.title)).toBeTruthy()
  })

  it('reserves its space before the ad arrives', () => {
    mockFetch(() => new Promise(() => {}))
    render(<AdSlot tool="retro" />)
    const slot = screen.getByRole('complementary', { name: 'Advertisement' })
    expect(slot.className).toContain('h-[100px]')
  })
})
