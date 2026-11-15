// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { RendererApi } from '../api'
import { clearAllDrafts } from '../data/drafts'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({ commit: vi.fn<RendererApi['commit']>() }))
vi.mock('../api', () => ({ api }))

import { CommitForm } from './CommitForm'

const ROOT = '/repos/demo'

function renderForm(props: Partial<React.ComponentProps<typeof CommitForm>> = {}): {
  onCommitted: ReturnType<typeof vi.fn>
} {
  const onCommitted = vi.fn<() => void>()
  renderWithProviders(
    <>
      <CommitForm root={ROOT} hasStaged stageAll={null} onCommitted={onCommitted} {...props} />
      <button type="button">Outside</button>
    </>
  )
  return { onCommitted }
}

const subject = (): HTMLElement => screen.getByRole('textbox', { name: 'Commit subject' })
const description = (): HTMLElement => screen.getByRole('textbox', { name: 'Commit description' })
const commitButton = (): HTMLElement => screen.getByRole('button', { name: /^Commit/ })

/** Focuses Commit and waits for its tooltip; Base UI reads keyboard focus from a preceding Tab. */
async function commitTooltip(text: string): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.keyDown(document.body, { key: 'Tab' })
    commitButton().focus()
  })
  return screen.findByText(text)
}

beforeEach(() => {
  vi.resetAllMocks()
  clearAllDrafts()
})

afterEach(cleanup)

describe('expanding and collapsing', () => {
  it('shows the subject and the button row, but not the description, at first', () => {
    renderForm()

    expect(subject()).toBeTruthy()
    expect(commitButton()).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: 'Commit description' })).toBeNull()
  })

  it('expands when the subject takes focus, not only when it is clicked', () => {
    renderForm()

    fireEvent.focus(subject())

    expect(description()).toBeTruthy()
  })

  it('is a form, not an accordion: no combobox semantics on the subject', () => {
    renderForm()
    fireEvent.focus(subject())

    expect(screen.getByRole('form', { name: 'Commit' })).toBeTruthy()
    expect(subject().getAttribute('aria-expanded')).toBeNull()
  })

  it('stays expanded when a click lands inside the form, including on Stage All', () => {
    const stageAll = { label: 'Stage All' as const, run: vi.fn<() => void>() }
    renderForm({ stageAll })
    fireEvent.focus(subject())

    const button = screen.getByRole('button', { name: 'Stage All' })
    fireEvent.pointerDown(button)
    fireEvent.click(button)

    expect(stageAll.run).toHaveBeenCalledOnce()
    expect(description()).toBeTruthy()
  })

  it('collapses on an outside click while the description is empty', () => {
    renderForm()
    fireEvent.focus(subject())

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))

    expect(screen.queryByRole('textbox', { name: 'Commit description' })).toBeNull()
  })

  it('stays expanded on an outside click once a description has been typed', () => {
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(description(), { target: { value: 'Why I did it' } })

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))

    expect(description()).toBeTruthy()
  })

  it('keeps the subject when it collapses', () => {
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Still here' } })

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }))

    expect((subject() as HTMLInputElement).value).toBe('Still here')
  })
})

describe('the Commit button', () => {
  it('is disabled, and says why, when nothing is staged', async () => {
    renderForm({ hasStaged: false })
    fireEvent.change(subject(), { target: { value: 'A subject' } })

    expect(commitButton().getAttribute('aria-disabled')).toBe('true')
    expect(await commitTooltip('Nothing is staged')).toBeTruthy()
  })

  it('is disabled, and says why, when the subject is empty', async () => {
    renderForm()

    expect(commitButton().getAttribute('aria-disabled')).toBe('true')
    expect(await commitTooltip('Add a subject')).toBeTruthy()
  })

  it('stays keyboard-focusable while disabled, so its reason can be read', () => {
    renderForm({ hasStaged: false })

    commitButton().focus()

    expect(document.activeElement).toBe(commitButton())
  })

  it('is enabled, with no reason to show, once something is staged and a subject is typed', () => {
    renderForm()
    fireEvent.change(subject(), { target: { value: 'A subject' } })

    expect(commitButton().getAttribute('aria-disabled')).toBe('false')
    expect(screen.queryByText('Nothing is staged')).toBeNull()
    expect(screen.queryByText('Add a subject')).toBeNull()
  })

  it('is disabled while a commit is in flight', async () => {
    api.commit.mockReturnValue(new Promise(() => {}))
    renderForm()
    fireEvent.change(subject(), { target: { value: 'A subject' } })

    fireEvent.click(commitButton())

    await waitFor(() => expect(commitButton().getAttribute('aria-disabled')).toBe('true'))
  })
})

describe('committing', () => {
  it('sends the subject and description as one message', async () => {
    api.commit.mockResolvedValue(undefined as never)
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })
    fireEvent.change(description(), { target: { value: 'It was broken.' } })

    fireEvent.click(commitButton())

    await waitFor(() =>
      expect(api.commit).toHaveBeenCalledWith(ROOT, 'Fix the thing\n\nIt was broken.\n')
    )
  })

  it('moves focus from the subject to the description on Enter', () => {
    renderForm()
    const field = subject()
    fireEvent.focus(field)

    fireEvent.keyDown(field, { key: 'Enter' })

    expect(document.activeElement).toBe(description())
  })

  it('commits on Cmd+Enter from the description', async () => {
    api.commit.mockResolvedValue(undefined as never)
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })

    fireEvent.keyDown(description(), { key: 'Enter', metaKey: true })

    await waitFor(() => expect(api.commit).toHaveBeenCalledOnce())
  })

  it('ignores a second Cmd+Enter while the first commit is in flight', async () => {
    api.commit.mockReturnValue(new Promise(() => {}))
    renderForm()
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })

    fireEvent.keyDown(subject(), { key: 'Enter', metaKey: true })
    await waitFor(() => expect(api.commit).toHaveBeenCalledOnce())
    fireEvent.keyDown(subject(), { key: 'Enter', metaKey: true })

    expect(api.commit).toHaveBeenCalledOnce()
  })

  it('ignores Cmd+Enter when the commit would be refused anyway', () => {
    renderForm({ hasStaged: false })
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })

    fireEvent.keyDown(subject(), { key: 'Enter', metaKey: true })

    expect(api.commit).not.toHaveBeenCalled()
  })

  it('clears both fields, collapses and hands focus on once the commit lands', async () => {
    api.commit.mockResolvedValue(undefined as never)
    const { onCommitted } = renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })
    fireEvent.change(description(), { target: { value: 'It was broken.' } })

    fireEvent.click(commitButton())

    await waitFor(() => expect(onCommitted).toHaveBeenCalledOnce())
    expect((subject() as HTMLInputElement).value).toBe('')
    expect(screen.queryByRole('textbox', { name: 'Commit description' })).toBeNull()
  })

  it('keeps both fields and stays expanded when the commit fails, and shows why', async () => {
    api.commit.mockRejectedValue(
      new ApiError({
        code: 'COMMAND_FAILED',
        message: 'git commit failed: lint failed: 3 problems'
      })
    )
    const { onCommitted } = renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })
    fireEvent.change(description(), { target: { value: 'It was broken.' } })

    fireEvent.click(commitButton())

    expect((await screen.findByRole('alert')).textContent).toContain('lint failed: 3 problems')
    expect((subject() as HTMLInputElement).value).toBe('Fix the thing')
    expect((description() as HTMLTextAreaElement).value).toBe('It was broken.')
    expect(onCommitted).not.toHaveBeenCalled()
  })
})
