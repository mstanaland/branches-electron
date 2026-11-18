// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

afterEach(cleanup)

const options = [
  { value: 'fork', label: 'fork' },
  { value: 'origin', label: 'origin' }
]

describe('Select', () => {
  it('shows the chosen option, named by its label', () => {
    render(<Select label="Remote" value="origin" onValueChange={() => {}} options={options} />)

    const trigger = screen.getByRole('combobox', { name: 'Remote' })
    expect(trigger.textContent).toContain('origin')
  })

  it('reports the option the user picks', async () => {
    const onValueChange = vi.fn<(value: string) => void>()
    render(<Select label="Remote" value="origin" onValueChange={onValueChange} options={options} />)

    fireEvent.click(screen.getByRole('combobox', { name: 'Remote' }))
    // A real mouse click starts on the item; Base UI ignores one that doesn't.
    const fork = await screen.findByRole('option', { name: 'fork' })
    fireEvent.pointerDown(fork, { pointerType: 'mouse' })
    fireEvent.click(fork)

    expect(onValueChange).toHaveBeenCalledWith('fork')
  })

  it('can be disabled', () => {
    render(
      <Select label="Remote" value="origin" onValueChange={() => {}} options={options} disabled />
    )

    expect(screen.getByRole('combobox', { name: 'Remote' }).hasAttribute('data-disabled')).toBe(
      true
    )
  })
})
