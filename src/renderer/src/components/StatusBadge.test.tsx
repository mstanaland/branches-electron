// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'

afterEach(cleanup)

describe('StatusBadge', () => {
  it.each([
    ['added', 'A', 'success'],
    ['modified', 'M', 'warning'],
    ['deleted', 'D', 'destructive'],
    ['renamed', 'R', 'info'],
    ['copied', 'C', 'info'],
    ['typeChanged', 'T', 'secondary'],
    ['untracked', '?', 'secondary']
  ] as const)('shows %s as %s in the %s variant', (status, letter, variant) => {
    render(<StatusBadge status={status} side="unstaged" />)

    const badge = screen.getByRole('img')
    expect(badge.textContent).toBe(letter)
    expect(badge.getAttribute('data-variant')).toBe(variant)
  })

  it('names the side in its accessible name', () => {
    render(<StatusBadge status="modified" side="staged" />)

    expect(screen.getByRole('img', { name: 'Modified (staged)' })).toBeTruthy()
  })

  it('does not name a side for untracked', () => {
    render(<StatusBadge status="untracked" side="unstaged" />)

    expect(screen.getByRole('img', { name: 'Untracked' })).toBeTruthy()
  })

  it('shows a conflict as a destructive badge with an icon and no letter', () => {
    render(<StatusBadge status="unmerged" side="unstaged" />)

    const badge = screen.getByRole('img', { name: 'Conflict' })
    expect(badge.getAttribute('data-variant')).toBe('destructive')
    expect(badge.textContent).toBe('')
    expect(badge.querySelector('svg')).toBeTruthy()
  })
})
