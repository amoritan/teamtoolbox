import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Avatar, initials, participantBackground } from '../src/Avatar'
import { Button } from '../src/Button'
import { CopyLinkButton } from '../src/CopyLinkButton'
import { TextField } from '../src/Field'
import { FeedbackProvider, useFeedback } from '../src/Toast'

afterEach(() => {
  vi.useRealTimers()
})

describe('Avatar', () => {
  it('uses initials and labels with the full name', () => {
    expect(initials('Ana Ruiz')).toBe('AR')
    expect(initials('  ben  ')).toBe('BE')
    expect(initials('Chen Wei Lin')).toBe('CL')
    render(<Avatar name="Ana Ruiz" colorIndex={0} />)
    expect(screen.getByRole('img', { name: 'Ana Ruiz' }).textContent).toBe('AR')
  })

  it('cycles through the eight participant colours', () => {
    expect(participantBackground(0)).toBe('bg-participant-1')
    expect(participantBackground(7)).toBe('bg-participant-8')
    expect(participantBackground(8)).toBe('bg-participant-1')
  })
})

describe('Button', () => {
  it('blocks presses and says so while busy', () => {
    render(<Button busy>Creating…</Button>)
    const button = screen.getByRole('button', { name: 'Creating…' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

describe('TextField', () => {
  it('links its hint and shows the count near the limit', () => {
    const { rerender } = render(
      <TextField label="Name" hint="Shown to others" value="" maxLength={10} onChange={() => {}} />,
    )
    const input = screen.getByLabelText('Name')
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Shown to others',
    )
    expect(screen.queryByText('9 / 10')).toBeNull()
    rerender(<TextField label="Name" value="123456789" maxLength={10} onChange={() => {}} />)
    expect(screen.getByText('9 / 10')).toBeTruthy()
  })
})

describe('CopyLinkButton', () => {
  it('copies the link and says "Copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<CopyLinkButton link="https://retro.teamtoolbox.org/room#secret" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    expect(writeText).toHaveBeenCalledWith('https://retro.teamtoolbox.org/room#secret')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
  })
})

function Trigger({ onUndo }: { onUndo: () => void }) {
  const { show } = useFeedback()
  return (
    <button
      type="button"
      onClick={() => show({ message: 'Card deleted', action: { label: 'Undo', onAction: onUndo } })}
    >
      Delete
    </button>
  )
}

describe('FeedbackProvider', () => {
  it('offers undo, then hides the toast after at least 5 seconds', () => {
    vi.useFakeTimers()
    const onUndo = vi.fn()
    render(
      <FeedbackProvider>
        <Trigger onUndo={onUndo} />
      </FeedbackProvider>,
    )
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByRole('status').textContent).toContain('Card deleted')
    act(() => {
      vi.advanceTimersByTime(4900)
    })
    expect(screen.getByRole('status').textContent).toContain('Card deleted')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
