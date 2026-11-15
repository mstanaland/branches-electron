// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Kbd } from './Kbd'

afterEach(cleanup)

describe('Kbd', () => {
  it('renders a kbd element', () => {
    render(<Kbd>⌘↵</Kbd>)

    const kbd = screen.getByText('⌘↵')
    expect(kbd.tagName).toBe('KBD')
  })

  it('is decorative, so the control beside it is not read out twice', () => {
    render(<Kbd>⌘↵</Kbd>)

    expect(screen.getByText('⌘↵').getAttribute('aria-hidden')).toBe('true')
  })
})
