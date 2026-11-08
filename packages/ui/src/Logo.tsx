import { MARK_TILES, MARK_TONE_CLASS, MARK_VIEWBOX, WORDMARK } from './mark'

export interface LogoProps {
  /** The mark's size in px. The wordmark follows the surrounding font size. */
  size?: number
  /** Show "teamtoolbox" next to the mark. Without it, the mark is labelled for screen readers. */
  wordmark?: boolean
  className?: string
}

const LABEL = `${WORDMARK.light}${WORDMARK.bold}`

const tiles = MARK_TILES.map((tile) => (
  <rect
    key={`${tile.x},${tile.y}`}
    x={tile.x}
    y={tile.y}
    width={tile.size}
    height={tile.size}
    rx={tile.radius}
    className={MARK_TONE_CLASS[tile.tone]}
  />
))

/** The teamtoolbox logo: the grid mark, and the wordmark as real text. */
export function Logo({ size = 24, wordmark = true, className = '' }: LogoProps) {
  if (!wordmark) {
    return (
      <svg
        viewBox={MARK_VIEWBOX}
        width={size}
        height={size}
        role="img"
        aria-label={LABEL}
        className={`shrink-0 ${className}`}
      >
        {tiles}
      </svg>
    )
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox={MARK_VIEWBOX}
        width={size}
        height={size}
        aria-hidden="true"
        className="shrink-0"
      >
        {tiles}
      </svg>
      <span className="tracking-tight">
        <span className="font-normal">{WORDMARK.light}</span>
        <span className="font-bold">{WORDMARK.bold}</span>
      </span>
    </span>
  )
}
