// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AheadBehind, aheadBehindLabel } from './AheadBehind'

afterEach(cleanup)

describe('AheadBehind', () => {
  it('shows both counts, labelled for screen readers', () => {
    render(<AheadBehind ahead={2} behind={1} />)

    const counts = screen.getByRole('img', { name: '2 ahead, 1 behind' })
    expect(counts.textContent).toBe('21')
  })

  it('shows only the ahead count', () => {
    render(<AheadBehind ahead={3} behind={0} />)

    expect(screen.getByRole('img', { name: '3 ahead' })).toBeTruthy()
  })

  it('shows only the behind count', () => {
    render(<AheadBehind ahead={0} behind={4} />)

    expect(screen.getByRole('img', { name: '4 behind' })).toBeTruthy()
  })

  it('renders nothing when level with the upstream', () => {
    const { container } = render(<AheadBehind ahead={0} behind={0} />)

    expect(container.firstChild).toBeNull()
  })
})

describe('aheadBehindLabel', () => {
  it('is null when level', () => {
    expect(aheadBehindLabel(0, 0)).toBeNull()
  })

  it('joins the counts', () => {
    expect(aheadBehindLabel(2, 1)).toBe('2 ahead, 1 behind')
  })
})
