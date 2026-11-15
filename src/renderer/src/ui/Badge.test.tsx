// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { Check } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { Badge } from './Badge'

afterEach(cleanup)

describe('Badge', () => {
  it('renders its text in a span, as the default variant', () => {
    render(<Badge>gone</Badge>)

    const badge = screen.getByText('gone')
    expect(badge.tagName).toBe('SPAN')
    expect(badge.getAttribute('data-variant')).toBe('default')
  })

  it.each([
    'default',
    'secondary',
    'outline',
    'destructive',
    'success',
    'warning',
    'info'
  ] as const)('supports the %s variant', (variant) => {
    render(<Badge variant={variant}>x</Badge>)

    expect(screen.getByText('x').getAttribute('data-variant')).toBe(variant)
  })

  it('adds className to its own', () => {
    render(<Badge className="extra">x</Badge>)

    expect(screen.getByText('x').className).toMatch(/extra/)
  })

  it('renders as another element through render, keeping its look', () => {
    render(
      <Badge variant="info" render={<a href="#top" />}>
        link
      </Badge>
    )

    const link = screen.getByRole('link', { name: 'link' })
    expect(link.getAttribute('data-variant')).toBe('info')
  })

  it('marks an icon child as inline-start or inline-end', () => {
    render(
      <Badge>
        <Check data-icon="inline-start" data-testid="icon" />
        done
      </Badge>
    )

    expect(screen.getByTestId('icon').getAttribute('data-icon')).toBe('inline-start')
    expect(screen.getByText('done')).toBeTruthy()
  })
})
