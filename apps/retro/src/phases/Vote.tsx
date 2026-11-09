import { Minus, Plus } from 'lucide-react'
import { plural } from '../components/bits'
import { VOTES_PER_PERSON } from '../model/schema'
import { votesLeft } from '../model/view'
import type { Retro } from '../room/useRetro'
import { CardFace } from './Group'

export function Vote({ retro }: { retro: Retro }) {
  const { view, isHost, ballot } = retro
  const left = votesLeft(ballot, view.topics, VOTES_PER_PERSON)
  const people = view.people.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm" aria-live="polite">
          {left > 0 ? (
            <>
              You have <b className="tabular-nums">{plural(left, 'vote')}</b> left. You can put more
              than one on a topic.
            </>
          ) : (
            <>You've used all your votes. You can still move them.</>
          )}
        </p>
        <p className="text-sm text-ink-muted tabular-nums">
          {isHost
            ? `${view.ballotsComplete} of ${plural(people, 'person', 'people')} have used all their votes. Totals show when you end voting.`
            : 'Totals show when the host ends voting.'}
        </p>
      </div>
      <ul className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {view.topics.map((topic) => {
          const mine = ballot.filter((id) => id === topic.id).length
          return (
            <li key={topic.id}>
              <section
                aria-label={topic.label}
                className={`flex flex-col gap-2 rounded-xl border p-2 ${mine > 0 ? 'border-accent' : 'border-line'}`}
              >
                {topic.kind === 'group' && (
                  <h2 className="px-2 pt-1 font-semibold">{topic.label}</h2>
                )}
                <ul className="flex flex-col gap-2">
                  {topic.cards.map((card) => (
                    <li key={card.id}>
                      <CardFace card={card} retro={retro} />
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-end gap-2 px-1 pb-1">
                  <span className="mr-auto text-sm text-ink-muted tabular-nums">
                    {mine > 0 ? `Your votes: ${mine}` : ''}
                  </span>
                  <button
                    type="button"
                    aria-label={`Take a vote back from: ${topic.label}`}
                    disabled={mine === 0}
                    onClick={() => retro.unvote(topic.id)}
                    className="inline-flex size-11 items-center justify-center rounded-lg border border-line-strong text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Vote for: ${topic.label}`}
                    disabled={left === 0}
                    onClick={() => retro.vote(topic.id)}
                    className="inline-flex size-11 items-center justify-center rounded-lg bg-accent text-accent-ink hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </section>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
