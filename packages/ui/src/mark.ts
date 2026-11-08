/**
 * The teamtoolbox mark: four tiles, like the directory's grid of tools, with one
 * in the accent colour. Framework-free so both the React `Logo` and the directory
 * site's Astro header draw it from the same numbers (docs/ui-guidelines.md §3).
 */

export interface MarkTile {
  x: number
  y: number
  size: number
  radius: number
  /** `ink` tiles follow the text colour, the `accent` tile the accent colour. */
  tone: 'ink' | 'accent'
}

export const MARK_VIEWBOX = '0 0 32 32'

export const MARK_TILES: readonly MarkTile[] = [
  { x: 3, y: 3, size: 12, radius: 3.5, tone: 'ink' },
  { x: 17, y: 3, size: 12, radius: 3.5, tone: 'ink' },
  { x: 3, y: 17, size: 12, radius: 3.5, tone: 'ink' },
  { x: 17, y: 17, size: 12, radius: 3.5, tone: 'accent' },
]

/** Tailwind classes for each tone. Literal strings, so Tailwind finds them. */
export const MARK_TONE_CLASS: Record<MarkTile['tone'], string> = {
  ink: 'fill-ink',
  accent: 'fill-accent',
}

/** The wordmark is live text in the system font: "team" regular, "toolbox" bold. */
export const WORDMARK = { light: 'team', bold: 'toolbox' } as const
