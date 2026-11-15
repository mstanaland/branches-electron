// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

afterEach(cleanup)

describe('Button', () => {
  it('is a button that calls onClick', () => {
    const onClick = vi.fn<() => void>()
    render(<Button onClick={onClick}>Open repository…</Button>)

    fireEvent.click(screen.getByRole('button', { name: 'Open repository…' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is a secondary button unless told otherwise', () => {
    render(<Button>Plain</Button>)

    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('secondary')
  })

  it.each(['primary', 'secondary', 'quiet'] as const)('supports the %s variant', (variant) => {
    render(<Button variant={variant}>Go</Button>)

    expect(screen.getByRole('button').getAttribute('data-variant')).toBe(variant)
  })

  it('ignores clicks while disabled', () => {
    const onClick = vi.fn<() => void>()
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>
    )

    fireEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not submit forms unless asked to', () => {
    render(<Button>Go</Button>)

    expect(screen.getByRole('button').getAttribute('type')).toBe('button')
  })
})
