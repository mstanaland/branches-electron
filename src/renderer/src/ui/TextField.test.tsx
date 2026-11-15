// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextField } from './TextField'

afterEach(cleanup)

describe('TextField', () => {
  it('names the input with its label, which is not shown', () => {
    render(<TextField label="Commit subject" placeholder="Subject" />)

    const input = screen.getByRole('textbox', { name: 'Commit subject' })
    expect(input.tagName).toBe('INPUT')
    expect(screen.getByText('Commit subject').className).toContain('visuallyHidden')
  })

  it('reports what the user typed', () => {
    const onValueChange = vi.fn<(value: string) => void>()
    render(<TextField label="Commit subject" value="" onValueChange={onValueChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fix the thing' } })

    expect(onValueChange).toHaveBeenCalledWith('Fix the thing', expect.anything())
  })

  it('renders a textarea when multiline', () => {
    render(<TextField label="Commit description" multiline rows={4} />)

    const control = screen.getByRole('textbox', { name: 'Commit description' })
    expect(control.tagName).toBe('TEXTAREA')
    expect(control.getAttribute('rows')).toBe('4')
  })

  it('reports what the user typed into a textarea', () => {
    const onValueChange = vi.fn<(value: string) => void>()
    render(
      <TextField label="Commit description" multiline value="" onValueChange={onValueChange} />
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Why, in detail.' } })

    expect(onValueChange).toHaveBeenCalledWith('Why, in detail.', expect.anything())
  })

  it('hands back a ref to the control, so a caller can focus it', () => {
    const ref = { current: null as HTMLElement | null }
    render(<TextField label="Commit subject" ref={ref} />)

    ref.current?.focus()

    expect(screen.getByRole('textbox')).toBe(document.activeElement)
  })
})
