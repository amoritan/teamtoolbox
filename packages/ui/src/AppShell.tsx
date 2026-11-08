import { SITE_LINKS, type Tool } from '@teamtoolbox/registry'
import type { ReactNode } from 'react'
import { AdSlot } from './AdSlot'
import { Logo } from './Logo'
import { PrivacyBadge } from './PrivacyBadge'

export interface AppShellProps {
  tool: Tool
  children: ReactNode
  /** Override for local development and previews. */
  adsUrl?: string
}

/** The frame every tool shares: back link, privacy badge, footer links and the ad slot. */
export function AppShell({ tool, children, adsUrl }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface font-sans text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <a href={SITE_LINKS.home} className="hover:text-accent">
              <Logo size={20} />
            </a>
            <span aria-hidden="true" className="text-ink-muted">
              /
            </span>
            <span className="font-medium">{tool.name}</span>
          </div>
          <PrivacyBadge kind={tool.kind} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <nav
            aria-label="teamtoolbox"
            className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted"
          >
            <a href={SITE_LINKS.privacy} className="hover:text-ink">
              Privacy
            </a>
            <a href={SITE_LINKS.security} className="hover:text-ink">
              Security
            </a>
            <a href={SITE_LINKS.source} className="hover:text-ink">
              Source code
            </a>
          </nav>
          <AdSlot tool={tool.slug} {...(adsUrl ? { endpoint: adsUrl } : {})} />
        </div>
      </footer>
    </div>
  )
}
