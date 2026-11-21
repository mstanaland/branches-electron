// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { RendererApi } from '../api'
import { clearAllDrafts } from '../data/drafts'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  commit: vi.fn<RendererApi['commit']>(),
  generateCommitMessage: vi.fn<RendererApi['generateCommitMessage']>(),
  cancelGenerate: vi.fn<RendererApi['cancelGenerate']>()
}))
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
const generateButton = (): HTMLElement => screen.getByRole('button', { name: 'Generate' })
const stopButton = (): HTMLElement => screen.getByRole('button', { name: 'Stop' })

/** A promise that settles only when the test says so, for a run still in flight. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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
  api.cancelGenerate.mockResolvedValue(undefined)
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

  it('waits for focus to follow the pointer out before collapsing', () => {
    renderForm()
    const field = subject()
    act(() => field.focus())
    const outside = screen.getByRole('button', { name: 'Outside' })

    // The pointer went elsewhere, but focus is still in the form: the browser moves it next.
    fireEvent.pointerDown(outside)
    expect(description()).toBeTruthy()

    fireEvent.blur(field, { relatedTarget: outside })
    expect(screen.queryByRole('textbox', { name: 'Commit description' })).toBeNull()
  })

  it('stays expanded when focus leaves by keyboard, with the pointer going nowhere', () => {
    renderForm()
    const field = subject()
    act(() => field.focus())

    fireEvent.blur(field, { relatedTarget: screen.getByRole('button', { name: 'Outside' }) })

    expect(description()).toBeTruthy()
  })

  it('stays expanded while focus moves between its own fields', () => {
    renderForm()
    const field = subject()
    act(() => field.focus())

    fireEvent.blur(field, { relatedTarget: description() })

    expect(description()).toBeTruthy()
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

describe('Generate', () => {
  it('appears only once the form is expanded', () => {
    renderForm()

    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull()
    fireEvent.focus(subject())
    expect(generateButton()).toBeTruthy()
  })

  it('is disabled, and says why, when nothing is staged', async () => {
    renderForm({ hasStaged: false })
    fireEvent.focus(subject())

    expect(generateButton().getAttribute('aria-disabled')).toBe('true')
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab' })
      generateButton().focus()
    })
    expect(await screen.findByText('Nothing is staged')).toBeTruthy()
  })

  it('sends what is typed as guidance and replaces both fields with the answer', async () => {
    api.generateCommitMessage.mockResolvedValue({
      subject: 'Say hello in the README',
      description: 'Greets whoever opens it first.'
    })
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'readme thing' } })

    fireEvent.click(generateButton())

    await waitFor(() =>
      expect((subject() as HTMLInputElement).value).toBe('Say hello in the README')
    )
    expect((description() as HTMLTextAreaElement).value).toBe('Greets whoever opens it first.')
    expect(api.generateCommitMessage).toHaveBeenCalledWith(ROOT, {
      subject: 'readme thing',
      description: ''
    })
  })

  it('hands focus to the subject, all selected, once the answer is in', async () => {
    api.generateCommitMessage.mockResolvedValue({ subject: 'Tidy up', description: '' })
    renderForm()
    fireEvent.focus(subject())

    fireEvent.click(generateButton())

    await waitFor(() => expect(document.activeElement).toBe(subject()))
    const input = subject() as HTMLInputElement
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Tidy up'.length])
    expect(api.commit).not.toHaveBeenCalled()
  })

  it('locks both fields and Commit while it runs, and offers Stop', async () => {
    const run = deferred<{ subject: string; description: string }>()
    api.generateCommitMessage.mockReturnValue(run.promise)
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })

    fireEvent.click(generateButton())

    await waitFor(() => expect(stopButton()).toBeTruthy())
    expect(screen.getByText('Generating…')).toBeTruthy()
    expect(subject().hasAttribute('readonly')).toBe(true)
    expect(description().hasAttribute('readonly')).toBe(true)
    expect(commitButton().getAttribute('aria-disabled')).toBe('true')

    await act(async () => run.resolve({ subject: 'Done', description: '' }))
    expect(subject().hasAttribute('readonly')).toBe(false)
  })

  it('does not commit on Cmd+Enter while it runs', async () => {
    api.generateCommitMessage.mockReturnValue(new Promise(() => {}))
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })
    fireEvent.click(generateButton())
    await waitFor(() => expect(stopButton()).toBeTruthy())

    fireEvent.keyDown(subject(), { key: 'Enter', metaKey: true })

    expect(api.commit).not.toHaveBeenCalled()
  })

  it('stops the run on Stop, keeping what was typed', async () => {
    const run = deferred<{ subject: string; description: string }>()
    api.generateCommitMessage.mockReturnValue(run.promise)
    api.cancelGenerate.mockImplementation(async () => {
      run.reject(new ApiError({ code: 'GENERATE_CANCELLED', message: 'Generate was stopped.' }))
    })
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })
    fireEvent.click(generateButton())
    await waitFor(() => expect(stopButton()).toBeTruthy())

    fireEvent.click(stopButton())

    await waitFor(() => expect(generateButton()).toBeTruthy())
    expect(api.cancelGenerate).toHaveBeenCalledWith(ROOT)
    expect((subject() as HTMLInputElement).value).toBe('Fix the thing')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('leaves the form as it was when it fails: main has already shown why', async () => {
    api.generateCommitMessage.mockRejectedValue(
      new ApiError({ code: 'CLAUDE_NOT_FOUND', message: 'Claude Code isn’t installed.' })
    )
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })

    fireEvent.click(generateButton())

    await waitFor(() => expect(generateButton().getAttribute('aria-disabled')).not.toBe('true'))
    expect((subject() as HTMLInputElement).value).toBe('Fix the thing')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps running when the form goes away, as on switching to History, and fills the draft', async () => {
    const run = deferred<{ subject: string; description: string }>()
    api.generateCommitMessage.mockReturnValue(run.promise)
    const form = <CommitForm root={ROOT} hasStaged stageAll={null} onCommitted={() => {}} />
    const { rerender } = renderWithProviders(form)
    fireEvent.focus(subject())
    fireEvent.click(generateButton())
    await waitFor(() => expect(stopButton()).toBeTruthy())

    rerender(<></>)
    await act(async () => run.resolve({ subject: 'Done while away', description: 'Why.' }))
    rerender(form)

    expect(api.cancelGenerate).not.toHaveBeenCalled()
    expect((subject() as HTMLInputElement).value).toBe('Done while away')
  })

  it('shows a run still going when the form comes back', async () => {
    api.generateCommitMessage.mockReturnValue(new Promise(() => {}))
    const form = <CommitForm root={ROOT} hasStaged stageAll={null} onCommitted={() => {}} />
    const { rerender } = renderWithProviders(form)
    fireEvent.focus(subject())
    fireEvent.click(generateButton())
    await waitFor(() => expect(stopButton()).toBeTruthy())

    rerender(<></>)
    rerender(form)

    expect(stopButton()).toBeTruthy()
  })

  it('says why Commit is disabled while it runs', async () => {
    api.generateCommitMessage.mockReturnValue(new Promise(() => {}))
    renderForm()
    fireEvent.focus(subject())
    fireEvent.change(subject(), { target: { value: 'Fix the thing' } })
    fireEvent.click(generateButton())
    await waitFor(() => expect(stopButton()).toBeTruthy())

    expect(await commitTooltip('Generating a commit message')).toBeTruthy()
  })
})
