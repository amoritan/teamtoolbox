import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { Button, Dialog } from '@teamtoolbox/ui'
import { GripVertical, MoveRight } from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { ColumnIcon } from '../components/bits'
import { TEXT_LIMITS } from '../model/schema'
import type { Card, Topic } from '../model/view'
import type { Retro } from '../room/useRetro'

const UNGROUP_ZONE = 'ungroup'

export function Group({ retro }: { retro: Retro }) {
  const { view } = retro
  const [dragging, setDragging] = useState<Card | null>(null)
  const [moving, setMoving] = useState<Card | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const labelFor = (id: string | number) =>
    view.topics.find((t) => t.id === id)?.label ??
    view.cards.find((c) => c.id === id)?.text ??
    'card'

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null)
    if (!over) return
    const cardId = String(active.id)
    if (over.id === UNGROUP_ZONE) retro.ungroupCard(cardId)
    else retro.moveCard(cardId, String(over.id))
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Drag cards onto each other to group them, or use a card's move button. Give groups a name if
        it helps. Everyone can group at the same time.
      </p>
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) =>
          setDragging(view.cards.find((c) => c.id === active.id) ?? null)
        }
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'To pick up a card, press Space or Enter. Use the arrow keys to move it over another card or group, then press Space or Enter to drop it, or Escape to cancel.',
          },
          announcements: {
            onDragStart: ({ active }) => `Picked up: ${labelFor(active.id)}.`,
            onDragOver: ({ over }) =>
              over
                ? `Over: ${over.id === UNGROUP_ZONE ? 'take out of group' : labelFor(over.id)}.`
                : 'Not over a topic.',
            onDragEnd: ({ over }) =>
              over
                ? `Dropped on: ${over.id === UNGROUP_ZONE ? 'out of group' : labelFor(over.id)}.`
                : 'Put back.',
            onDragCancel: () => 'Put back.',
          },
        }}
      >
        <UngroupZone visible={!!dragging?.groupId} />
        <ul className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {view.topics.map((topic) => (
            <li key={topic.id}>
              <TopicDrop retro={retro} topic={topic} onMove={setMoving} />
            </li>
          ))}
        </ul>
        <DragOverlay>{dragging && <CardFace card={dragging} retro={retro} lifted />}</DragOverlay>
      </DndContext>
      {view.topics.length === 0 && <p className="text-ink-muted">No cards were added.</p>}
      {/* Keyed by card, so the choice resets for each card. */}
      <MoveDialog
        key={moving?.id ?? 'none'}
        retro={retro}
        card={moving}
        onClose={() => setMoving(null)}
      />
    </div>
  )
}

function UngroupZone({ visible }: { visible: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: UNGROUP_ZONE, disabled: !visible })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 border-dashed p-3 text-center text-sm transition-colors ${visible ? '' : 'hidden'} ${isOver ? 'border-accent bg-surface-muted text-ink' : 'border-line-strong text-ink-muted'}`}
    >
      Drop here to take the card out of its group
    </div>
  )
}

function TopicDrop({
  retro,
  topic,
  onMove,
}: {
  retro: Retro
  topic: Topic
  onMove: (card: Card) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: topic.id })
  return (
    <section
      ref={setNodeRef}
      aria-label={topic.kind === 'group' ? `Group: ${topic.label}` : undefined}
      className={`flex flex-col gap-2 rounded-xl border p-2 transition-colors ${isOver ? 'border-accent bg-surface-muted' : topic.kind === 'group' ? 'border-line-strong bg-surface-muted' : 'border-transparent'}`}
    >
      {topic.kind === 'group' && <GroupTitle retro={retro} topic={topic} />}
      <ul className="flex flex-col gap-2">
        {topic.cards.map((card) => (
          <li key={card.id}>
            <DraggableCard retro={retro} card={card} onMove={() => onMove(card)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function GroupTitle({ retro, topic }: { retro: Retro; topic: Topic }) {
  const [title, setTitle] = useState(topic.title)
  const id = useId()
  // Someone else renamed it: show theirs unless you're typing.
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setTitle(topic.title)
  }, [topic.title, focused])

  return (
    <div className="px-1">
      <label htmlFor={id} className="sr-only">
        Group name
      </label>
      <input
        id={id}
        value={title}
        maxLength={TEXT_LIMITS.groupTitle}
        placeholder={topic.cards[0]?.text.slice(0, 60) ?? 'Name this group'}
        onFocus={() => setFocused(true)}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => {
          setFocused(false)
          retro.renameGroup(topic.id, title.trim())
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-semibold placeholder:font-normal placeholder:text-ink-muted hover:border-line-strong focus-visible:border-line-strong focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
      />
    </div>
  )
}

function DraggableCard({ retro, card, onMove }: { retro: Retro; card: Card; onMove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  return (
    <div ref={setNodeRef} className={isDragging ? 'opacity-30' : ''}>
      <CardFace
        card={card}
        retro={retro}
        handle={
          <button
            type="button"
            aria-label={`Drag card: ${card.text.slice(0, 60)}`}
            className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        }
        action={
          <button
            type="button"
            aria-label="Move card to…"
            title="Move to…"
            onClick={onMove}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <MoveRight className="size-4" />
          </button>
        }
      />
    </div>
  )
}

export function CardFace({
  card,
  retro,
  handle,
  action,
  lifted = false,
}: {
  card: Card
  retro: Retro
  handle?: ReactNode
  action?: ReactNode
  lifted?: boolean
}) {
  const column = retro.view.template?.columns[card.column]
  return (
    <article
      className={`flex items-start gap-1 rounded-lg border border-line bg-surface p-2 text-sm ${lifted ? 'shadow-lg ring-2 ring-accent' : ''}`}
    >
      {handle}
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
        <p className="whitespace-pre-wrap break-words">{card.text}</p>
        {column && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
            <ColumnIcon icon={column.icon} className="size-3" />
            {column.title}
          </span>
        )}
      </div>
      {action}
    </article>
  )
}

/** The non-drag way to group (WCAG 2.5.7). */
function MoveDialog({
  retro,
  card,
  onClose,
}: {
  retro: Retro
  card: Card | null
  onClose: () => void
}) {
  const [target, setTarget] = useState('')
  const targets = retro.view.topics.filter(
    (topic) => card && !topic.cards.some((c) => c.id === card.id),
  )
  return (
    <Dialog
      open={!!card}
      onClose={onClose}
      title="Move card"
      description={card ? `“${card.text.slice(0, 120)}”` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!target}
            onClick={() => {
              if (card && target === UNGROUP_ZONE) retro.ungroupCard(card.id)
              else if (card) retro.moveCard(card.id, target)
              onClose()
            }}
          >
            Move
          </Button>
        </>
      }
    >
      <fieldset className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        <legend className="mb-2 text-sm font-medium">Group it with</legend>
        {card?.groupId && (
          <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted">
            <input
              type="radio"
              name="move"
              value={UNGROUP_ZONE}
              checked={target === UNGROUP_ZONE}
              onChange={() => setTarget(UNGROUP_ZONE)}
            />
            <span className="text-ink-muted">Take it out of its group</span>
          </label>
        )}
        {targets.map((topic) => (
          <label
            key={topic.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-muted"
          >
            <input
              type="radio"
              name="move"
              value={topic.id}
              checked={target === topic.id}
              onChange={() => setTarget(topic.id)}
            />
            <span className="min-w-0 truncate">
              {topic.kind === 'group' ? <b>{topic.label}</b> : topic.label}
              {topic.kind === 'group' && (
                <span className="text-ink-muted"> ({topic.cards.length} cards)</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  )
}
