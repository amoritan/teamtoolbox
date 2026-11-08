// @vitest-environment node
/**
 * Keeps the colour tokens in theme.css accessible (docs/ui-guidelines.md §2).
 * Change a colour and this fails if it drops below WCAG 2.2 AA in either mode.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8')

function tokens(block: string | undefined): Record<string, string> {
  if (!block) throw new Error('Token block not found in theme.css')
  return Object.fromEntries(
    [...block.matchAll(/--ttb-([\w-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1], m[2]]),
  )
}

const modes = {
  light: tokens(css.match(/^:root \{([\s\S]*?)^\}/m)?.[1]),
  dark: tokens(css.match(/prefers-color-scheme: dark\)\s*\{\s*:root \{([\s\S]*?)\}/)?.[1]),
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const backgrounds = ['surface', 'surface-muted']
const participants = Array.from({ length: 8 }, (_, i) => `participant-${i + 1}`)

/** [foreground, background, minimum ratio] */
const pairs: [string, string, number][] = [
  // Text: 4.5:1
  ...['ink', 'ink-muted', 'accent', 'good', 'warn', 'bad'].flatMap((fg) =>
    backgrounds.map((bg): [string, string, number] => [fg, bg, 4.5]),
  ),
  ['accent-ink', 'accent', 4.5],
  ['accent-ink', 'accent-strong', 4.5],
  // Form control borders: 3:1
  ...backgrounds.map((bg): [string, string, number] => ['line-strong', bg, 3]),
  // Participant colours carry initials in the surface colour, so they're held to the text ratio
  ...participants.flatMap((fg) => backgrounds.map((bg): [string, string, number] => [fg, bg, 4.5])),
]

describe('theme tokens', () => {
  it('defines the same tokens in light and dark mode', () => {
    expect(Object.keys(modes.dark).sort()).toEqual(Object.keys(modes.light).sort())
    expect(Object.keys(modes.light)).toEqual(
      expect.arrayContaining(['line-strong', ...participants]),
    )
  })

  for (const [mode, t] of Object.entries(modes)) {
    it.each(pairs)(`${mode}: %s on %s reaches %d:1`, (fg, bg, min) => {
      expect(t[fg], `--ttb-${fg}`).toBeDefined()
      expect(t[bg], `--ttb-${bg}`).toBeDefined()
      expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(min)
    })
  }
})
