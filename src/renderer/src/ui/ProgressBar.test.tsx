// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'

afterEach(cleanup)

describe('ProgressBar', () => {
  it('is an indeterminate progress bar under its label', () => {
    render(<ProgressBar aria-label="In progress" />)

    const bar = screen.getByRole('progressbar', { name: 'In progress' })
    expect(bar.getAttribute('aria-valuenow')).toBeNull()
  })
})
