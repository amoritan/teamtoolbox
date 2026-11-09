import { Button, TextField, useFeedback } from '@teamtoolbox/ui'
import { ArrowLeft, ArrowRight, ClipboardCopy, FileDown, Printer, Trash2 } from 'lucide-react'
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { plural } from '../components/bits'
import { buildResults, jsonFileName, type Results, toJson, toMarkdown } from '../model/export'
import { TEXT_LIMITS } from '../model/schema'
import { discussionOrder, type Topic } from '../model/view'
import type { Retro } from '../room/useRetro'
import { CardFace } from './Group'

export function Discuss({ retro }: { retro: Retro }) {
  const { view, isHost } = retro
  const topics = useMemo(() => discussionOrder(view.topics), [view.topics])
  const focusId = view.state?.focusTopicId ?? null
  const focusIndex = topics.findIndex((t) => t.id === focusId)
  const results = useMemo(() => buildResults(view), [view])

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] print:hidden">
        <section className="flex flex-col gap-3" aria-labelledby="topics-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="topics-heading" className="text-lg font-semibold">
              Topics by votes
            </h2>
            {isHost && topics.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={focusIndex <= 0}
                  onClick={() => retro.focusTopic(topics[focusIndex - 1]?.id ?? null)}
                >
                  <ArrowLeft className="size-4" /> Previous
                </Button>
                <Button
                  onClick={() => retro.focusTopic(topics[focusIndex + 1]?.id ?? null)}
                  disabled={focusIndex === topics.length - 1}
                >
                  {focusIndex === -1 ? 'Discuss the first topic' : 'Next topic'}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
          {topics.length === 0 && <p className="text-ink-muted">No cards were added.</p>}
          <ol className="flex flex-col gap-3">
            {topics.map((topic, index) => (
              <li key={topic.id}>
                <TopicRow
                  retro={retro}
                  topic={topic}
                  rank={index + 1}
                  focused={topic.id === focusId}
                />
              </li>
            ))}
          </ol>
        </section>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-4">
          <Actions retro={retro} focused={topics[focusIndex] ?? null} />
          <Exports results={results} />
        </aside>
      </div>
      <PrintResults results={results} />
    </>
  )
}

function TopicRow({
  retro,
  topic,
  rank,
  focused,
}: {
  retro: Retro
  topic: Topic
  rank: number
  focused: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!focused) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    ref.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
  }, [focused])

  return (
    <section
      ref={ref}
      aria-current={focused ? 'true' : undefined}
      aria-label={`${rank}. ${topic.label}, ${plural(topic.votes, 'vote')}`}
      className={`flex flex-col gap-2 rounded-xl border p-3 ${focused ? 'border-accent ring-2 ring-accent' : 'border-line'}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex min-w-14 flex-col items-center rounded-lg bg-surface-muted px-2 py-1">
          <span className="text-lg font-semibold tabular-nums">{topic.votes}</span>
          <span className="text-xs text-ink-muted">{topic.votes === 1 ? 'vote' : 'votes'}</span>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {focused && <span className="text-xs font-semibold text-accent">Now discussing</span>}
          <h3 className="font-semibold break-words">{topic.label}</h3>
        </div>
        {retro.isHost && !focused && (
          <Button variant="ghost" onClick={() => retro.focusTopic(topic.id)}>
            Discuss
          </Button>
        )}
      </div>
      {(topic.kind === 'group' || topic.cards.length > 1) && (
        <ul className="flex flex-col gap-2">
          {topic.cards.map((card) => (
            <li key={card.id}>
              <CardFace card={card} retro={retro} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Actions({ retro, focused }: { retro: Retro; focused: Topic | null }) {
  const { view } = retro
  const [text, setText] = useState('')
  const [owner, setOwner] = useState('')
  const ownerId = useId()
  const { show } = useFeedback()
  const names = new Map(view.people.map((p) => [p.id, p.name]))
  const topicLabels = new Map(view.topics.map((t) => [t.id, t.label]))

  function add(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    retro.addAction(trimmed, owner || null, focused?.id ?? null)
    setText('')
    setOwner('')
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-line p-4"
      aria-labelledby="actions-heading"
    >
      <h2 id="actions-heading" className="text-lg font-semibold">
        Action items
      </h2>
      {view.actions.length === 0 ? (
        <p className="text-sm text-ink-muted">
          What will the team do differently? Add actions as you discuss.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {view.actions.map((action) => (
            <li key={action.id} className="flex items-start gap-2 py-2 text-sm">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words">{action.text}</span>
                <span className="text-xs text-ink-muted">
                  {action.ownerId
                    ? (names.get(action.ownerId) ?? 'Someone who left')
                    : 'No owner yet'}
                  {action.topicId &&
                    topicLabels.has(action.topicId) &&
                    ` · ${topicLabels.get(action.topicId)}`}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Delete action: ${action.text}`}
                onClick={() => {
                  const undo = retro.deleteAction(action.id)
                  show({ message: 'Action deleted', action: { label: 'Undo', onAction: undo } })
                }}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-bad focus-visible:outline-2 focus-visible:outline-accent"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-col gap-3 border-t border-line pt-3">
        <TextField
          label="New action"
          value={text}
          maxLength={TEXT_LIMITS.action}
          hint={focused ? `For: ${focused.label.slice(0, 60)}` : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ownerId} className="text-sm font-medium">
            Owner
          </label>
          <select
            id={ownerId}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base sm:text-sm"
          >
            <option value="">No owner yet</option>
            {view.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!text.trim()} className="self-start">
          Add action
        </Button>
      </form>
    </section>
  )
}

function Exports({ results }: { results: Results }) {
  const { show } = useFeedback()

  function download() {
    const url = URL.createObjectURL(new Blob([toJson(results)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = jsonFileName(results)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-line p-4"
      aria-labelledby="export-heading"
    >
      <h2 id="export-heading" className="text-lg font-semibold">
        Export
      </h2>
      <p className="text-sm text-ink-muted">
        Created in your browser. Nothing is uploaded, and no names appear on cards or votes.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(toMarkdown(results))
              show({ message: 'Results copied as Markdown' })
            } catch {
              show({ message: "Couldn't copy. Your browser blocked the clipboard." })
            }
          }}
        >
          <ClipboardCopy className="size-4" /> Copy as Markdown
        </Button>
        <Button variant="secondary" onClick={download}>
          <FileDown className="size-4" /> Download JSON
        </Button>
        <Button variant="secondary" onClick={() => print()}>
          <Printer className="size-4" /> Save as PDF
        </Button>
      </div>
      <p className="text-xs text-ink-muted">
        "Save as PDF" opens your browser's print dialog. Choose Save as PDF there.
      </p>
    </section>
  )
}

/** Only shows when printing: the results on plain paper (docs/tools/retro.md, Exports). */
function PrintResults({ results }: { results: Results }) {
  return (
    <article className="hidden text-black print:block">
      <h1 className="text-2xl font-semibold">Retro: {results.templateName}</h1>
      <p className="mb-6 text-sm">{results.date}</p>
      <h2 className="mb-2 text-lg font-semibold">Topics</h2>
      {results.topics.map((topic) => (
        <section key={`${topic.title}-${topic.cards[0]?.text}`} className="mb-4 break-inside-avoid">
          <h3 className="font-semibold">
            {topic.title} <span className="font-normal">({plural(topic.votes, 'vote')})</span>
          </h3>
          <ul className="ml-5 list-disc text-sm">
            {topic.cards.map((card, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cards in an export have no IDs and never reorder
              <li key={index}>
                <b>{card.column}:</b> {card.text}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <h2 className="mt-6 mb-2 text-lg font-semibold">Action items</h2>
      {results.actions.length === 0 ? (
        <p className="text-sm">No action items.</p>
      ) : (
        <ul className="ml-5 list-disc text-sm">
          {results.actions.map((action, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: as above
            <li key={index}>
              {action.text}
              {action.owner && ` (${action.owner})`}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-xs">Made with teamtoolbox.org/retro</p>
    </article>
  )
}
