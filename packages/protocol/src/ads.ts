/**
 * Contract between the in-app `<AdSlot>` and the ads service. The slot renders
 * these fields as plain text and an image, never as HTML.
 */
import * as z from 'zod/mini'

export const AD_KINDS = ['sponsor', 'network', 'house'] as const
export type AdKind = (typeof AD_KINDS)[number]

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/** https only, except plain http on localhost for local development. */
const safeUrl = z.url().check(
  z.refine((value) => {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
  }, 'Must be an https URL'),
)

const text = (min: number, max: number) => z.string().check(z.minLength(min), z.maxLength(max))
const imageSide = z.int().check(z.positive(), z.lte(400))

export const adSchema = z.object({
  id: z.string().check(z.regex(/^[a-z0-9-]{1,64}$/)),
  kind: z.enum(AD_KINDS),
  /** Shown above the ad: "Ad", "Sponsor" or "From teamtoolbox". */
  label: text(1, 24),
  title: text(1, 60),
  body: text(0, 120),
  href: safeUrl,
  image: z.optional(
    z.object({ src: safeUrl, width: imageSide, height: imageSide, alt: text(0, 120) }),
  ),
  /** Network ads only: an image URL the network needs loaded to count a view. */
  viewPixel: z.optional(safeUrl),
})
export type Ad = z.infer<typeof adSchema>

export function parseAd(json: unknown): Ad | null {
  const result = adSchema.safeParse(json)
  return result.success ? result.data : null
}
