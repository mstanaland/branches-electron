// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Tooltip, TooltipProvider } from './Tooltip'

afterEach(cleanup)

function renderTooltip(): HTMLElement {
  render(
    <TooltipProvider>
      <Tooltip content="Open a repository">
        <button type="button">Trigger</button>
      </Tooltip>
    </TooltipProvider>
  )
  return screen.getByRole('button', { name: 'Trigger' })
}

describe('Tooltip', () => {
  it('is closed until the trigger is hovered or focused', () => {
    renderTooltip()

    expect(screen.queryByText('Open a repository')).toBeNull()
  })

  it('opens when the trigger is hovered', async () => {
    const trigger = renderTooltip()

    await act(async () => {
      fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
      fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
      fireEvent.mouseEnter(trigger)
      fireEvent.mouseMove(trigger)
    })

    expect(await screen.findByText('Open a repository')).toBeTruthy()
  })

  it('opens when the trigger receives keyboard focus', async () => {
    const trigger = renderTooltip()

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab' })
      trigger.focus()
    })

    expect(await screen.findByText('Open a repository')).toBeTruthy()
  })

  it('shows nothing when there is no content', async () => {
    render(
      <TooltipProvider>
        <Tooltip content={null}>
          <button type="button">Trigger</button>
        </Tooltip>
      </TooltipProvider>
    )

    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab' })
      screen.getByRole('button').focus()
    })

    expect(screen.queryByText('Open a repository')).toBeNull()
  })
})
