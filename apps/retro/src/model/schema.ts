/**
 * Everything a retro room holds, validated after decryption (docs/tools/retro.md,
 * Data model). Record IDs are random and opaque; the kind lives in `k`, inside the
 * encrypted payload.
 */
import * as z from 'zod/mini'
import { MAX_COLUMNS, TEMPLATE_IDS } from './templates'

export const TEXT_LIMITS = { card: 280, groupTitle: 80, name: 40, action: 200 } as const
export const VOTES_PER_PERSON = 3

export const PHASES = ['lobby', 'write', 'group', 'vote', 'discuss'] as const
export type Phase = (typeof PHASES)[number]

const id = z.string().check(z.regex(/^[A-Za-z0-9_-]{1,64}$/))
const time = z.int().check(z.minimum(0))
const text = (max: number) => z.string().check(z.minLength(1), z.maxLength(max))

export const settingsSchema = z.object({
  k: z.literal('settings'),
  template: z.enum(TEMPLATE_IDS),
  createdAt: time,
})

export const timerSchema = z.object({ endsAt: time, durationMs: time })

export const stateSchema = z.object({
  k: z.literal('state'),
  phase: z.enum(PHASES),
  hostId: id,
  timer: z.nullable(timerSchema),
  focusTopicId: z.nullable(id),
})

export const personSchema = z.object({
  k: z.literal('person'),
  name: text(TEXT_LIMITS.name),
  joinedAt: time,
})

export const cardSchema = z.object({
  k: z.literal('card'),
  column: z.int().check(z.minimum(0), z.maximum(MAX_COLUMNS - 1)),
  text: text(TEXT_LIMITS.card),
  createdAt: time,
  groupId: z.nullable(id),
})

export const groupSchema = z.object({
  k: z.literal('group'),
  title: z.string().check(z.maxLength(TEXT_LIMITS.groupTitle)),
  createdAt: time,
})

export const ballotSchema = z.object({
  k: z.literal('ballot'),
  topics: z.array(id).check(z.maxLength(VOTES_PER_PERSON)),
})

export const actionSchema = z.object({
  k: z.literal('action'),
  text: text(TEXT_LIMITS.action),
  ownerId: z.nullable(id),
  topicId: z.nullable(id),
  createdAt: time,
})

export const recordSchema = z.discriminatedUnion('k', [
  settingsSchema,
  stateSchema,
  personSchema,
  cardSchema,
  groupSchema,
  ballotSchema,
  actionSchema,
])

export const presenceSchema = z.object({
  pid: id,
  name: text(TEXT_LIMITS.name),
  typing: z.boolean(),
})

export type Settings = z.infer<typeof settingsSchema>
export type State = z.infer<typeof stateSchema>
export type Timer = z.infer<typeof timerSchema>
export type PersonRecord = z.infer<typeof personSchema>
export type CardRecord = z.infer<typeof cardSchema>
export type GroupRecord = z.infer<typeof groupSchema>
export type BallotRecord = z.infer<typeof ballotSchema>
export type ActionRecord = z.infer<typeof actionSchema>
export type RetroRecord = z.infer<typeof recordSchema>
export type Presence = z.infer<typeof presenceSchema>
