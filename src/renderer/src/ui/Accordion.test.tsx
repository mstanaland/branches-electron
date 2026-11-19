// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Accordion, AccordionItem } from './Accordion'

afterEach(cleanup)

function show(): void {
  render(
    <Accordion>
      <AccordionItem title="First">First content</AccordionItem>
      <AccordionItem title="Second">Second content</AccordionItem>
    </Accordion>
  )
}

const trigger = (name: string): HTMLElement => screen.getByRole('button', { name })

describe('Accordion', () => {
  it('starts with every item collapsed, its content not rendered', () => {
    show()

    expect(trigger('First').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('First content')).toBeNull()
    expect(screen.queryByText('Second content')).toBeNull()
  })

  it('opens an item when its title is clicked, and closes it again', () => {
    show()

    fireEvent.click(trigger('First'))
    expect(trigger('First').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('First content')).toBeTruthy()

    fireEvent.click(trigger('First'))
    expect(trigger('First').getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps several items open at once', () => {
    show()

    fireEvent.click(trigger('First'))
    fireEvent.click(trigger('Second'))

    expect(screen.getByText('First content')).toBeTruthy()
    expect(screen.getByText('Second content')).toBeTruthy()
  })
})
