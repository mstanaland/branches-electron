// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { Info } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import { Alert } from './Alert'

afterEach(cleanup)

describe('Alert', () => {
  it('is a note with its message, as the info variant', () => {
    render(<Alert aria-label="Heads up">Something to know</Alert>)

    const alert = screen.getByRole('note', { name: 'Heads up' })
    expect(alert.textContent).toBe('Something to know')
    expect(alert.getAttribute('data-variant')).toBe('info')
  })

  it('takes another role and variant', () => {
    render(
      <Alert role="alert" variant="success">
        Done
      </Alert>
    )

    expect(screen.getByRole('alert').getAttribute('data-variant')).toBe('success')
  })

  it('hides its icon from assistive technology and shows its actions', () => {
    render(
      <Alert icon={<Info data-testid="icon" />} actions={<button type="button">Act</button>}>
        Message
      </Alert>
    )

    expect(screen.getByTestId('icon').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Act' })).toBeTruthy()
  })
})
