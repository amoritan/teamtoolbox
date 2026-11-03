/**
 * The single list of tools. The directory grid, the sitemap, the ads service
 * and the scaffolding script all read from here.
 */

import { ROOT_DOMAIN } from './domain'

export { ROOT_DOMAIN }

/** Tool slugs double as subdomains, so they must be valid DNS labels. */
export const TOOL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/

export type ToolKind = 'local' | 'collaborative'
export type ToolStatus = 'live' | 'beta' | 'soon'
export type ToolCategory = 'ceremonies' | 'team-health' | 'planning' | 'utilities'

export interface Tool {
  slug: string
  name: string
  /** One line for the grid card. */
  tagline: string
  /** A short paragraph for the tool's guide page. */
  description: string
  kind: ToolKind
  status: ToolStatus
  category: ToolCategory
  /** Context for in-app ads. Describes the tool, never the room. */
  adKeywords: readonly string[]
}

export const categoryLabels: Record<ToolCategory, string> = {
  ceremonies: 'Ceremonies',
  'team-health': 'Team health',
  planning: 'Planning',
  utilities: 'Utilities',
}

export const kindLabels: Record<ToolKind, string> = {
  local: 'Stays in your browser',
  collaborative: 'End-to-end encrypted',
}

export const tools: readonly Tool[] = [
  {
    slug: 'retro',
    name: 'Retro',
    tagline: 'Run a retrospective your whole team can join from one link.',
    description:
      'Collect cards in columns, reveal them together, group and vote, then agree on action items. No sign-up, and everything is end-to-end encrypted.',
    kind: 'collaborative',
    status: 'soon',
    category: 'ceremonies',
    adKeywords: ['agile', 'scrum', 'retrospective'],
  },
  {
    slug: 'healthcheck',
    name: 'Health check',
    tagline: 'See how your team is really doing, anonymously.',
    description:
      'Everyone rates a set of dimensions green, amber or red and says which way each is heading. Answers are anonymous, and you can compare results with your last check.',
    kind: 'collaborative',
    status: 'soon',
    category: 'team-health',
    adKeywords: ['agile', 'team health', 'engineering management'],
  },
]

export function getTool(slug: string): Tool | undefined {
  return tools.find((tool) => tool.slug === slug)
}

export function toolOrigin(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`
}

/** Shared links shown in every app's footer. */
export const SITE_LINKS = {
  home: `https://${ROOT_DOMAIN}/`,
  privacy: `https://${ROOT_DOMAIN}/privacy`,
  security: `https://${ROOT_DOMAIN}/security`,
  // Points at the about page until the GitHub repo exists, then straight at the repo.
  source: `https://${ROOT_DOMAIN}/about#source`,
} as const

export { isAllowedToolOrigin } from './origins'
