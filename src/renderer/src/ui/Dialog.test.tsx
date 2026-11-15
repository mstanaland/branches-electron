// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Dialog, DialogClose } from './Dialog'

afterEach(cleanup)

describe('Dialog', () => {
  it('shows its title, description and content, named by the title', () => {
    render(
      <Dialog open onOpenChange={() => {}} title="Heads up" description="Read this">
        <p>the body</p>
      </Dialog>
    )

    expect(screen.getByRole('dialog', { name: 'Heads up' })).toBeTruthy()
    expect(screen.getByText('Read this')).toBeTruthy()
    expect(screen.getByText('the body')).toBeTruthy()
  })

  it('renders nothing while closed', () => {
    render(<Dialog open={false} onOpenChange={() => {}} title="Heads up" />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks to close when its close button is pressed', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(
      <Dialog
        open
        onOpenChange={onOpenChange}
        title="Heads up"
        actions={<DialogClose render={<Button />}>OK</DialogClose>}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })

  it('asks to close on Escape', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(<Dialog open onOpenChange={onOpenChange} title="Heads up" />)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
  })
})
