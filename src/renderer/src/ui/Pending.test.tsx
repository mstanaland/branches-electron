// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Pending } from './Pending'

afterEach(cleanup)

describe('Pending', () => {
  it('is a status named for what it waits on', () => {
    render(<Pending label="Loading branches" />)

    expect(screen.getByRole('status', { name: 'Loading branches' }).textContent).toBe('Loading…')
  })
})
