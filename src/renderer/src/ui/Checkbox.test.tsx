// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'
import type { CheckboxProps } from './Checkbox'

afterEach(cleanup)

describe('Checkbox', () => {
  it('is checked or unchecked', () => {
    const { rerender } = render(<Checkbox aria-label="x" checked />)
    expect(screen.getByRole('checkbox', { name: 'x' }).getAttribute('aria-checked')).toBe('true')

    rerender(<Checkbox aria-label="x" checked={false} />)
    expect(screen.getByRole('checkbox', { name: 'x' }).getAttribute('aria-checked')).toBe('false')
  })

  it('is mixed when indeterminate', () => {
    render(<Checkbox aria-label="x" checked={false} indeterminate />)

    expect(screen.getByRole('checkbox', { name: 'x' }).getAttribute('aria-checked')).toBe('mixed')
  })

  it('reports a click', () => {
    const onCheckedChange = vi.fn<NonNullable<CheckboxProps['onCheckedChange']>>()
    render(<Checkbox aria-label="x" checked={false} onCheckedChange={onCheckedChange} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'x' }))

    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it('ignores clicks when read only', () => {
    const onCheckedChange = vi.fn<NonNullable<CheckboxProps['onCheckedChange']>>()
    render(<Checkbox aria-label="x" checked={false} readOnly onCheckedChange={onCheckedChange} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'x' }))

    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
