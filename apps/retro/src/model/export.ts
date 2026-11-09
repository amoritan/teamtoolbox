/**
 * The retro's results as Markdown and JSON (docs/tools/retro.md, Exports). Built in
 * the browser, never uploaded, and never with authors or voter IDs in them.
 */
import { discussionOrder, type RetroView } from './view'

export interface Results {
  templateName: string
  columns: string[]
  /** The day the retro was created, as YYYY-MM-DD. */
  date: string
  topics: { title: string; votes: number; cards: { column: string; text: string }[] }[]
  actions: { text: string; owner: string | null; topic: string | null }[]
}

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10)

export function buildResults(view: RetroView): Results {
  const columns = view.template?.columns.map((column) => column.title) ?? []
  const names = new Map(view.people.map((person) => [person.id, person.name]))
  const topicLabels = new Map(view.topics.map((topic) => [topic.id, topic.label]))
  return {
    templateName: view.template?.name ?? 'Retro',
    columns,
    date: isoDate(view.settings?.createdAt ?? Date.now()),
    topics: discussionOrder(view.topics).map((topic) => ({
      title: topic.label,
      votes: topic.votes,
      cards: topic.cards.map((card) => ({
        column: columns[card.column] ?? '',
        text: card.text,
      })),
    })),
    actions: view.actions.map((action) => ({
      text: action.text,
      owner: action.ownerId ? (names.get(action.ownerId) ?? null) : null,
      topic: action.topicId ? (topicLabels.get(action.topicId) ?? null) : null,
    })),
  }
}

/** Keeps card text from breaking the Markdown around it. */
const inline = (text: string) => text.replace(/\s*\n\s*/g, ' ').replace(/([\\`*_[\]#|<>])/g, '\\$1')

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function toMarkdown(results: Results): string {
  const lines = [`# Retro: ${results.templateName}`, '', `_${results.date}_`, '']
  lines.push('## Topics', '')
  if (results.topics.length === 0) lines.push('No cards were added.', '')
  for (const topic of results.topics) {
    lines.push(`### ${inline(topic.title)} (${plural(topic.votes, 'vote')})`, '')
    for (const card of topic.cards) lines.push(`- **${inline(card.column)}:** ${inline(card.text)}`)
    lines.push('')
  }
  lines.push('## Action items', '')
  if (results.actions.length === 0) lines.push('No action items.')
  for (const action of results.actions) {
    const owner = action.owner ? ` (${inline(action.owner)})` : ''
    lines.push(`- [ ] ${inline(action.text)}${owner}`)
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function toJson(results: Results, exportedAt = Date.now()): string {
  return `${JSON.stringify(
    {
      format: 'teamtoolbox.retro',
      version: 1,
      exportedAt: new Date(exportedAt).toISOString(),
      template: results.templateName,
      date: results.date,
      columns: results.columns,
      topics: results.topics,
      actions: results.actions,
    },
    null,
    2,
  )}\n`
}

export function jsonFileName(results: Results): string {
  return `teamtoolbox-retro-${results.date}.json`
}
