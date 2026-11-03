import { type Ad, parseAd } from '@teamtoolbox/protocol'
import { SITE_LINKS } from '@teamtoolbox/registry'
import { useEffect, useState } from 'react'

export const DEFAULT_ADS_URL = 'https://ads.teamtoolbox.org'

/** Shown when the ads service is unreachable or returns something invalid. */
export const FALLBACK_AD: Ad = {
  id: 'house-directory',
  kind: 'house',
  label: 'From teamtoolbox',
  title: 'More free tools for your team',
  body: 'Private by design, no sign-up. See the whole toolbox.',
  href: SITE_LINKS.home,
}

/**
 * The one small ad in every tool. It fetches plain data from our own ads service
 * and renders it as text and an image. No ad-network script ever runs on the page,
 * and nothing from the response is ever treated as HTML.
 */
export function AdSlot({ tool, endpoint = DEFAULT_ADS_URL }: { tool: string; endpoint?: string }) {
  const [ad, setAd] = useState<Ad | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${endpoint}/v1/slot?tool=${encodeURIComponent(tool)}`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: unknown) => setAd(parseAd(json) ?? FALLBACK_AD))
      .catch(() => {
        if (!controller.signal.aborted) setAd(FALLBACK_AD)
      })
    return () => controller.abort()
  }, [tool, endpoint])

  return (
    // Fixed size, reserved up front, so the layout never shifts when the ad arrives.
    <aside
      aria-label="Advertisement"
      className="h-[100px] w-full max-w-[320px] shrink-0 print:hidden"
    >
      {ad && <AdCard ad={ad} />}
    </aside>
  )
}

function AdCard({ ad }: { ad: Ad }) {
  return (
    <a
      href={ad.href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className="relative flex h-full gap-3 overflow-hidden rounded-lg border border-line bg-surface-muted p-2.5 text-left transition-colors hover:border-ink-muted"
    >
      {ad.image && (
        <img
          src={ad.image.src}
          width={ad.image.width}
          height={ad.image.height}
          alt={ad.image.alt}
          referrerPolicy="no-referrer"
          className="h-full w-auto shrink-0 rounded object-cover"
        />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] font-medium tracking-wide text-ink-muted uppercase">
          {ad.label}
        </span>
        <span className="truncate text-sm font-semibold text-ink">{ad.title}</span>
        <span className="line-clamp-2 text-sm text-ink-muted">{ad.body}</span>
      </span>
      {ad.viewPixel && (
        <img
          src={ad.viewPixel}
          width={1}
          height={1}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute size-px opacity-0"
        />
      )}
    </a>
  )
}
