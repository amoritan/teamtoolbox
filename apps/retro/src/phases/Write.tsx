import { Button, TextArea, useFeedback } from '@teamtoolbox/ui'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { ColumnIcon, plural, TimerBadge, useNow } from '../components/bits'
import { TEXT_LIMITS } from '../model/schema'
import type { Column } from '../model/templates'
import type { Card } from '../model/view'
import type { Retro } from '../room/useRetro'

const GRID_COLUMNS: Record<number, string> = {
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 lg:grid-cols-4',
  5: 'md:grid-cols-3 xl:grid-cols-5',
}

export function Write({ retro }: { retro: Retro }) {
  const { view, isHost } = retro
  const columns = view.template?.columns ?? []
  const [tab, setTab] = useState(0)
  const timer = view.state?.timer
  const now = useNow(!!timer)
  const { announce } = useFeedback()
  const timeUp = !!timer && timer.endsAt <= now
  const announcedUp = useRef(false)

  useEffect(() => {
    if (timeUp && !announcedUp.current) {
      announcedUp.current = true
      announce("Time's up. You can still finish your card.")
    }
    if (!timeUp) announcedUp.current = false
  }, [timeUp, announce])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {timer && <TimerBadge timer={timer} />}
        {isHost && timer && (
          <Button variant="secondary" onClick={() => retro.addTime(60_000)}>
            <Plus className="size-4" /> Add a minute
          </Button>
        )}
        <span className="text-sm text-ink-muted">
          {plural(view.cards.length, 'card')}
          {view.typing > 0 && ` · ${plural(view.typing, 'person', 'people')} typing…`}
        </span>
      </div>

      <fieldset className="flex gap-1 overflow-x-auto md:hidden">
        <legend className="sr-only">Show column</legend>
        {columns.map((column, index) => (
          <button
            key={column.title}
            type="button"
            aria-pressed={tab === index}
            onClick={() => setTab(index)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${tab === index ? 'bg-accent text-accent-ink' : 'bg-surface-muted text-ink'}`}
          >
            <ColumnIcon icon={column.icon} />
            {column.title}
            <span className="tabular-nums opacity-80">
              {view.cards.filter((c) => c.column === index).length}
            </span>
          </button>
        ))}
      </fieldset>

      <div className={`grid gap-4 ${GRID_COLUMNS[columns.length] ?? 'md:grid-cols-3'}`}>
        {columns.map((column, index) => (
          <div key={column.title} className={tab === index ? 'flex' : 'hidden md:flex'}>
            <ColumnView
              retro={retro}
              column={column}
              index={index}
              cards={view.cards.filter((card) => card.column === index)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ColumnView({
  retro,
  column,
  index,
  cards,
}: {
  retro: Retro
  column: Column
  index: number
  cards: Card[]
}) {
  const [draft, setDraft] = useState('')
  const { show } = useFeedback()

  function add() {
    const text = draft.trim()
    if (!text) return
    retro.addCard(index, text)
    setDraft('')
    retro.setTyping(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      add()
    }
  }

  return (
    <section className="flex w-full flex-col gap-3 rounded-xl border border-line bg-surface-muted p-3">
      <header className="flex flex-col gap-0.5 px-1">
        <h2 className="flex items-center gap-2 font-semibold">
          <ColumnIcon icon={column.icon} />
          {column.title}
          <span className="ml-auto text-sm font-normal text-ink-muted tabular-nums">
            {cards.length}
          </span>
        </h2>
        <p className="text-sm text-ink-muted">{column.prompt}</p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
        className="flex flex-col gap-2"
      >
        <TextArea
          label={`Add a card to ${column.title}`}
          hideLabel
          value={draft}
          maxLength={TEXT_LIMITS.card}
          rows={2}
          placeholder="Type, then press Enter"
          onChange={(event) => {
            setDraft(event.target.value)
            retro.setTyping(event.target.value.trim().length > 0)
          }}
          onBlur={() => retro.setTyping(false)}
          onKeyDown={onKeyDown}
        />
        <Button type="submit" variant="secondary" disabled={!draft.trim()} className="self-end">
          Add card
        </Button>
      </form>
      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <li key={card.id}>
            <CardItem
              card={card}
              own={retro.me.ownCards.includes(card.id)}
              onEdit={(text) => retro.editCard(card.id, text)}
              onDelete={() => {
                const undo = retro.deleteCard(card.id)
                show({ message: 'Card deleted', action: { label: 'Undo', onAction: undo } })
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CardItem({
  card,
  own,
  onEdit,
  onDelete,
}: {
  card: Card
  own: boolean
  onEdit: (text: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(card.text)

  if (editing) {
    const save = () => {
      const trimmed = text.trim()
      if (trimmed && trimmed !== card.text) onEdit(trimmed)
      setEditing(false)
    }
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-accent bg-surface p-2">
        <TextArea
          label="Edit card"
          hideLabel
          value={text}
          maxLength={TEXT_LIMITS.card}
          rows={3}
          autoFocus
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              save()
            }
            if (event.key === 'Escape') setEditing(false)
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    )
  }

  return (
    <article className="group flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{card.text}</p>
      {own && (
        <div className="-my-1 -mr-1 flex shrink-0">
          <button
            type="button"
            aria-label="Edit your card"
            title="Edit"
            onClick={() => {
              setText(card.text)
              setEditing(true)
            }}
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Delete your card"
            title="Delete"
            onClick={onDelete}
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-bad focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </article>
  )
}
