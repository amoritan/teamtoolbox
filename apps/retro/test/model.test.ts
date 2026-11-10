import { describe, expect, it } from 'vitest'
import { buildResults, toJson, toMarkdown } from '../src/model/export'
import { presenceSchema, type RetroRecord, recordSchema } from '../src/model/schema'
import { MAX_COLUMNS, TEMPLATE_IDS, TEMPLATES } from '../src/model/templates'
import { buildView, discussionOrder, nextPhase, previousPhase, votesLeft } from '../src/model/view'

const rec = (id: string, value: RetroRecord) => ({ id, value })

function sampleRecords() {
  return [
    rec('settings1', {
      k: 'settings',
      template: 'start-stop-continue',
      createdAt: Date.UTC(2026, 10, 9),
    }),
    rec('state1', {
      k: 'state',
      phase: 'discuss',
      hostId: 'host',
      timer: null,
      focusTopicId: null,
    }),
    rec('host', { k: 'person', name: 'Ana Ruiz', joinedAt: 1 }),
    rec('ben', { k: 'person', name: 'Ben', joinedAt: 2 }),
    rec('c1', { k: 'card', column: 0, text: 'Pair more', createdAt: 10, groupId: 'g1' }),
    rec('c2', { k: 'card', column: 2, text: 'Pairing on bugs', createdAt: 12, groupId: 'g1' }),
    rec('c3', { k: 'card', column: 1, text: 'Late standups', createdAt: 11, groupId: null }),
    rec('c4', { k: 'card', column: 0, text: 'Orphan', createdAt: 13, groupId: 'gone' }),
    rec('g1', { k: 'group', title: '', createdAt: 20 }),
    rec('g2', { k: 'group', title: 'Empty', createdAt: 21 }),
    rec('b1', { k: 'ballot', topics: ['g1', 'g1', 'c3'] }),
    rec('b2', { k: 'ballot', topics: ['c3', 'deleted'] }),
    rec('a1', {
      k: 'action',
      text: 'Book pairing slots',
      ownerId: 'ben',
      topicId: 'g1',
      createdAt: 30,
    }),
  ]
}

describe('schemas', () => {
  it('accept every template and reject what a client must ignore', () => {
    for (const template of TEMPLATE_IDS) {
      expect(recordSchema.safeParse({ k: 'settings', template, createdAt: 1 }).success).toBe(true)
    }
    const bad = [
      { k: 'settings', template: 'custom', createdAt: 1 },
      { k: 'card', column: MAX_COLUMNS, text: 'x', createdAt: 1, groupId: null },
      { k: 'card', column: 0, text: '', createdAt: 1, groupId: null },
      { k: 'card', column: 0, text: 'x'.repeat(281), createdAt: 1, groupId: null },
      { k: 'ballot', topics: ['a', 'b', 'c', 'd'] },
      { k: 'person', name: 'x'.repeat(41), joinedAt: 1 },
      { k: 'state', phase: 'party', hostId: 'h', timer: null, focusTopicId: null },
      { k: 'unknown' },
    ]
    for (const value of bad) expect(recordSchema.safeParse(value).success).toBe(false)
    expect(presenceSchema.safeParse({ pid: 'p1', name: 'Ana', typing: true }).success).toBe(true)
    expect(presenceSchema.safeParse({ pid: 'p 1', name: 'Ana', typing: true }).success).toBe(false)
  })

  it('every template has 3 to 5 columns with prompts', () => {
    for (const template of Object.values(TEMPLATES)) {
      expect(template.columns.length).toBeGreaterThanOrEqual(3)
      expect(template.columns.length).toBeLessThanOrEqual(MAX_COLUMNS)
      for (const column of template.columns) expect(column.prompt.endsWith('?')).toBe(true)
    }
  })
})

describe('buildView', () => {
  const view = buildView(
    sampleRecords(),
    [
      { pid: 'host', name: 'Ana Ruiz', typing: false },
      { pid: 'ben', name: 'Ben', typing: true },
      null,
    ],
    { pid: 'host', connected: true },
    3,
  )

  it('orders people by joining and marks who is online', () => {
    expect(view.people.map((p) => [p.name, p.colorIndex, p.online])).toEqual([
      ['Ana Ruiz', 0, true],
      ['Ben', 1, true],
    ])
    expect(view.typing).toBe(1)
  })

  it('counts you as here while connected, since your own presence never comes back', () => {
    const solo = buildView(sampleRecords(), [], { pid: 'ben', connected: true }, 3)
    expect(solo.people.map((p) => [p.name, p.online])).toEqual([
      ['Ana Ruiz', false],
      ['Ben', true],
    ])
    const offline = buildView(sampleRecords(), [], { pid: 'ben', connected: false }, 3)
    expect(offline.people.every((p) => !p.online)).toBe(true)
  })

  it('builds topics from groups and loose cards, skipping empty groups', () => {
    expect(view.topics.map((t) => [t.id, t.kind, t.label, t.cards.map((c) => c.id)])).toEqual([
      ['g1', 'group', 'Pair more', ['c1', 'c2']],
      ['c3', 'card', 'Late standups', ['c3']],
      ['c4', 'card', 'Orphan', ['c4']],
    ])
  })

  it('counts votes, ignoring topics that no longer exist', () => {
    expect(Object.fromEntries(view.topics.map((t) => [t.id, t.votes]))).toEqual({
      g1: 2,
      c3: 2,
      c4: 0,
    })
    expect(view.ballotsComplete).toBe(1)
    expect(votesLeft(['c3', 'deleted'], view.topics, 3)).toBe(2)
  })

  it('sorts the discussion by votes, then by creation', () => {
    expect(discussionOrder(view.topics).map((t) => t.id)).toEqual(['g1', 'c3', 'c4'])
  })

  it('picks the same singleton everywhere if two exist', () => {
    const twice = buildView(
      [
        ...sampleRecords(),
        rec('state0', {
          k: 'state',
          phase: 'lobby',
          hostId: 'ben',
          timer: null,
          focusTopicId: null,
        }),
      ],
      [],
      { pid: null, connected: false },
      3,
    )
    expect(twice.stateId).toBe('state0')
    expect(twice.state?.phase).toBe('lobby')
  })

  it('steps through the phases in order', () => {
    expect(nextPhase('lobby')).toBe('write')
    expect(nextPhase('discuss')).toBeNull()
    expect(previousPhase('write')).toBe('lobby')
    expect(previousPhase('lobby')).toBeNull()
  })
})

describe('exports', () => {
  const view = buildView(sampleRecords(), [], { pid: null, connected: false }, 3)
  const results = buildResults(view)

  it('carries topics, votes, columns and owners, but no authors or voters', () => {
    expect(results.topics[0]).toEqual({
      title: 'Pair more',
      votes: 2,
      cards: [
        { column: 'Start', text: 'Pair more' },
        { column: 'Continue', text: 'Pairing on bugs' },
      ],
    })
    expect(results.actions).toEqual([
      { text: 'Book pairing slots', owner: 'Ben', topic: 'Pair more' },
    ])
    const json = toJson(results, Date.UTC(2026, 10, 9, 12))
    expect(JSON.parse(json)).toMatchObject({
      format: 'teamtoolbox.retro',
      version: 1,
      date: '2026-11-09',
    })
    expect(json).not.toMatch(/host|b1|b2|"ben"/)
  })

  it('writes Markdown that card text cannot break', () => {
    const markdown = toMarkdown({
      ...results,
      topics: [
        { title: '# Not a heading', votes: 1, cards: [{ column: 'Start', text: 'a *b*\n- c' }] },
      ],
    })
    expect(markdown).toContain('### \\# Not a heading (1 vote)')
    expect(markdown).toContain('- **Start:** a \\*b\\* - c')
    expect(markdown).toContain('- [ ] Book pairing slots (Ben)')
  })
})
