/**
 * Turns a room's records and presence into what the screens show. Pure, so it's
 * easy to test, and recomputed whenever a record or someone's presence changes.
 */
import type {
  ActionRecord,
  CardRecord,
  GroupRecord,
  PersonRecord,
  Phase,
  Presence,
  RetroRecord,
  Settings,
  State,
} from './schema'
import { PHASES } from './schema'
import { TEMPLATES, type Template } from './templates'

export interface Person extends PersonRecord {
  id: string
  /** Join order, which picks the participant colour. */
  colorIndex: number
  online: boolean
}

export interface Card extends CardRecord {
  id: string
}

export interface Group extends GroupRecord {
  id: string
}

export interface Action extends ActionRecord {
  id: string
}

/** What people vote on and discuss: a group, or a card that isn't in a group. */
export interface Topic {
  id: string
  kind: 'group' | 'card'
  /** The group's title, if it has one. */
  title: string
  /** What to show as the heading: the title, else the first card's text. */
  label: string
  cards: Card[]
  votes: number
  createdAt: number
}

export interface RetroView {
  settings: Settings | null
  template: Template | null
  stateId: string | null
  state: State | null
  people: Person[]
  cards: Card[]
  groups: Group[]
  /** In creation order. `discussionOrder` sorts them by votes. */
  topics: Topic[]
  actions: Action[]
  /** How many ballots have all their votes placed. */
  ballotsComplete: number
  /** Everyone's votes, by voter ID. Only shown as totals, and only once voting ends. */
  ballots: Map<string, string[]>
  /** People typing right now, not counting you. */
  typing: number
}

interface Entry {
  id: string
  value: RetroRecord
}

type Of<K extends RetroRecord['k']> = Extract<RetroRecord, { k: K }>

const byCreation = (a: { createdAt: number; id: string }, b: { createdAt: number; id: string }) =>
  a.createdAt - b.createdAt || a.id.localeCompare(b.id)

/**
 * `self` is you: the server never echoes your own presence back, so you count as
 * online whenever you're connected.
 */
export function buildView(
  records: Iterable<Entry>,
  presences: Iterable<Presence | null>,
  self: { pid: string | null; connected: boolean },
  votesPerPerson: number,
): RetroView {
  const selfPid = self.pid
  const byKind = new Map<RetroRecord['k'], Entry[]>()
  for (const entry of records) {
    const list = byKind.get(entry.value.k) ?? []
    list.push(entry)
    byKind.set(entry.value.k, list)
  }
  const all = <K extends RetroRecord['k']>(k: K) =>
    (byKind.get(k) ?? []).map((e) => ({ ...(e.value as Of<K>), id: e.id }))
  // Singletons: if two ever exist, everyone picks the same one.
  const first = <K extends RetroRecord['k']>(k: K) =>
    all(k).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null

  const settings = first('settings')
  const state = first('state')

  const online = new Set<string>()
  if (selfPid && self.connected) online.add(selfPid)
  let typing = 0
  for (const presence of presences) {
    if (!presence) continue
    online.add(presence.pid)
    if (presence.typing && presence.pid !== selfPid) typing += 1
  }

  const people = all('person')
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))
    .map((person, colorIndex) => ({ ...person, colorIndex, online: online.has(person.id) }))

  const cards = all('card').sort(byCreation)
  const groups = all('group').sort(byCreation)
  const groupIds = new Set(groups.map((group) => group.id))

  const ballots = new Map<string, string[]>()
  for (const ballot of all('ballot')) ballots.set(ballot.id, ballot.topics)

  const topics = buildTopics(cards, groups, groupIds, ballots)

  return {
    settings: settings
      ? { k: 'settings', template: settings.template, createdAt: settings.createdAt }
      : null,
    template: settings ? TEMPLATES[settings.template] : null,
    stateId: state?.id ?? null,
    state: state
      ? {
          k: 'state',
          phase: state.phase,
          hostId: state.hostId,
          timer: state.timer,
          focusTopicId: state.focusTopicId,
        }
      : null,
    people,
    cards,
    groups,
    topics,
    actions: all('action').sort(byCreation),
    ballotsComplete: [...ballots.values()].filter((t) => t.length >= votesPerPerson).length,
    ballots,
    typing,
  }
}

function buildTopics(
  cards: Card[],
  groups: Group[],
  groupIds: Set<string>,
  ballots: Map<string, string[]>,
): Topic[] {
  const votes = new Map<string, number>()
  for (const topicIds of ballots.values()) {
    for (const topicId of topicIds) votes.set(topicId, (votes.get(topicId) ?? 0) + 1)
  }

  const members = new Map<string, Card[]>()
  const topics: Topic[] = []
  for (const card of cards) {
    if (card.groupId && groupIds.has(card.groupId)) {
      const list = members.get(card.groupId) ?? []
      list.push(card)
      members.set(card.groupId, list)
    } else {
      topics.push({
        id: card.id,
        kind: 'card',
        title: '',
        label: card.text,
        cards: [card],
        votes: votes.get(card.id) ?? 0,
        createdAt: card.createdAt,
      })
    }
  }
  for (const group of groups) {
    const groupCards = members.get(group.id)
    // Empty groups are left over from moves; they aren't topics.
    if (!groupCards?.length) continue
    topics.push({
      id: group.id,
      kind: 'group',
      title: group.title,
      label: group.title.trim() || (groupCards[0]?.text ?? ''),
      cards: groupCards,
      votes: votes.get(group.id) ?? 0,
      // A group sits where its oldest card was.
      createdAt: groupCards[0]?.createdAt ?? group.createdAt,
    })
  }
  return topics.sort(byCreation)
}

/** Topics for the discussion: most votes first, then in creation order. */
export function discussionOrder(topics: readonly Topic[]): Topic[] {
  return [...topics].sort((a, b) => b.votes - a.votes || byCreation(a, b))
}

export function nextPhase(phase: Phase): Phase | null {
  return PHASES[PHASES.indexOf(phase) + 1] ?? null
}

export function previousPhase(phase: Phase): Phase | null {
  const index = PHASES.indexOf(phase)
  return index > 0 ? (PHASES[index - 1] ?? null) : null
}

/** A topic ID on a ballot only counts while that topic exists. */
export function votesLeft(ballot: readonly string[], topics: readonly Topic[], perPerson: number) {
  const ids = new Set(topics.map((topic) => topic.id))
  return perPerson - ballot.filter((topicId) => ids.has(topicId)).length
}
