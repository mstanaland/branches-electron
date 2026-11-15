// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('shows a title', () => {
    render(<EmptyState title="No repositories yet" />)

    expect(screen.getByText('No repositories yet')).toBeTruthy()
  })

  it('shows detail when given', () => {
    render(<EmptyState title="Nothing here" detail="Open a repository to begin." />)

    expect(screen.getByText('Open a repository to begin.')).toBeTruthy()
  })

  it('shows an action when given', () => {
    render(<EmptyState title="Nothing here" action={<button type="button">Open</button>} />)

    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy()
  })

  it('shows only the title otherwise', () => {
    const { container } = render(<EmptyState title="Nothing here" />)

    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
