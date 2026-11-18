// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { FileChange, RepositoryStatus } from '../../../shared/git'
import type { RendererApi } from '../api'
import { useSelection } from '../data'
import { clearAllDrafts } from '../data/drafts'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  getStatus: vi.fn<RendererApi['getStatus']>(),
  stageFiles: vi.fn<RendererApi['stageFiles']>(),
  commit: vi.fn<RendererApi['commit']>(),
  unstageFiles: vi.fn<RendererApi['unstageFiles']>(),
  listRepositories: vi.fn<RendererApi['listRepositories']>(),
  confirmRemoveMissingRepository: vi.fn<RendererApi['confirmRemoveMissingRepository']>()
}))
vi.mock('../api', () => ({ api }))

import { ChangedFiles } from './ChangedFiles'

const ROOT = '/repos/demo'

const change = (path: string, overrides: Partial<FileChange> = {}): FileChange => ({
  path,
  originalPath: null,
  index: 'unmodified',
  worktree: 'modified',
  kind: 'ordinary',
  ...overrides
})

const status = (
  changes: FileChange[],
  overrides: Partial<RepositoryStatus> = {}
): RepositoryStatus => ({
  branch: 'main',
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes,
  ...overrides
})

/** Shows the selected path so tests can read what the pane stored. */
function SelectedPath(): React.JSX.Element {
  const { selectedPath } = useSelection()
  return <output aria-label="selected path">{selectedPath ?? ''}</output>
}

function renderPane() {
  return renderWithProviders(
    <>
      <ChangedFiles root={ROOT} />
      <SelectedPath />
    </>,
    { tabs: [ROOT] }
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  clearAllDrafts()
})

afterEach(cleanup)

describe('rows', () => {
  it('shows one row per path, including a partially staged file', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('staged.txt', { index: 'modified', worktree: 'unmodified' }),
        change('partial.txt', { index: 'modified', worktree: 'modified' }),
        change('plain.txt'),
        change('new.txt', { index: null, worktree: null, kind: 'untracked' })
      ])
    )
    renderPane()

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(4)
    const partial = rows.find((row) => within(row).queryByText('partial.txt'))!
    expect(within(partial).getByRole('checkbox').getAttribute('aria-checked')).toBe('mixed')
    expect(within(partial).getByRole('img', { name: 'Modified (staged)' })).toBeTruthy()
    expect(within(partial).getByRole('img', { name: 'Modified (unstaged)' })).toBeTruthy()
  })

  it('checks a staged change and leaves an unstaged one empty', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('a.txt', { index: 'added', worktree: 'unmodified' }),
        change('b.txt'),
        change('c.txt', { index: null, worktree: null, kind: 'untracked' })
      ])
    )
    renderPane()

    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
  })

  it('shows an untracked file as one row with an Untracked badge', async () => {
    api.getStatus.mockResolvedValue(
      status([change('new.txt', { index: null, worktree: null, kind: 'untracked' })])
    )
    renderPane()

    const row = await screen.findByRole('listitem')
    expect(within(row).getByRole('img', { name: 'Untracked' })).toBeTruthy()
  })

  it('shows the file name with its folder', async () => {
    api.getStatus.mockResolvedValue(status([change('src/my docs/a b.txt')]))
    renderPane()

    expect(await screen.findByText('a b.txt')).toBeTruthy()
    expect(screen.getByText('src/my docs/')).toBeTruthy()
  })

  it('leaves ignored files out', async () => {
    api.getStatus.mockResolvedValue(
      status([change('a.txt'), change('dist', { kind: 'ignored', index: null, worktree: null })])
    )
    renderPane()

    expect(await screen.findAllByRole('listitem')).toHaveLength(1)
  })
})

describe('order', () => {
  it('lists conflicts first, then by path', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('b.txt'),
        change('z.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' }),
        change('a.txt')
      ])
    )
    renderPane()

    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('z.txt'),
      expect.stringContaining('a.txt'),
      expect.stringContaining('b.txt')
    ])
  })
})

describe('conflicts', () => {
  it('flags a conflict, with no checkbox, and cannot be selected', async () => {
    api.getStatus.mockResolvedValue(
      status([change('c.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' })])
    )
    renderPane()

    const row = await screen.findByRole('listitem')
    expect(within(row).getByRole('img', { name: 'Conflict' })).toBeTruthy()
    expect(within(row).queryByRole('checkbox')).toBeNull()
    expect(within(row).queryByRole('button')).toBeNull()
  })
})

describe('renames', () => {
  it('shows old → new', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('src/new.ts', {
          originalPath: 'src/old.ts',
          index: 'renamed',
          worktree: 'unmodified',
          kind: 'renamed'
        })
      ])
    )
    renderPane()

    const row = await screen.findByRole('listitem')
    expect(row.textContent).toContain('old.ts')
    expect(row.textContent).toContain('new.ts')
    expect(within(row).getByRole('img', { name: 'Renamed (staged)' })).toBeTruthy()
    expect(row.textContent).toMatch(/old\.ts\s*new\.ts/)
  })

  it('shows both full paths when a rename moves between folders', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('lib/new.ts', {
          originalPath: 'src/old.ts',
          index: 'renamed',
          worktree: 'unmodified',
          kind: 'renamed'
        })
      ])
    )
    renderPane()

    expect(await screen.findByText('src/old.ts')).toBeTruthy()
    expect(screen.getByText('lib/new.ts')).toBeTruthy()
  })
})

describe('selection', () => {
  it('selects one change at a time, by path', async () => {
    api.getStatus.mockResolvedValue(status([change('a.txt'), change('b.txt')]))
    renderPane()

    fireEvent.click(await screen.findByRole('button', { name: /a\.txt/ }))
    expect(screen.getByLabelText('selected path').textContent).toBe('a.txt')
    expect(screen.getByRole('button', { name: /a\.txt/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: /b\.txt/ }))
    expect(screen.getByLabelText('selected path').textContent).toBe('b.txt')
    expect(screen.getByRole('button', { name: /a\.txt/ }).getAttribute('aria-pressed')).toBe(
      'false'
    )
  })
})

describe('header', () => {
  it('shows the branch, upstream and ahead/behind', async () => {
    api.getStatus.mockResolvedValue(
      status([], { branch: 'feature/x', upstream: 'origin/feature/x', ahead: 2, behind: 1 })
    )
    renderPane()

    expect(await screen.findByText('feature/x')).toBeTruthy()
    expect(screen.getByText('origin/feature/x')).toBeTruthy()
    expect(screen.getByRole('img', { name: '2 ahead, 1 behind' })).toBeTruthy()
  })

  it('says HEAD is detached when there is no branch', async () => {
    api.getStatus.mockResolvedValue(
      status([], { branch: null, detached: true, headOid: 'abc1234' })
    )
    renderPane()

    expect(await screen.findByText(/detached at abc1234/i)).toBeTruthy()
  })
})

describe('empty and error states', () => {
  it('says "No changes" for a clean repository', async () => {
    api.getStatus.mockResolvedValue(status([]))
    renderPane()

    expect(await screen.findByText('No changes')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('says "Repository not found" with a Remove button when the repository is gone', async () => {
    api.getStatus.mockRejectedValue(
      new ApiError({ code: 'NOT_A_REPOSITORY', message: 'Not a repository.' })
    )
    api.confirmRemoveMissingRepository.mockResolvedValue(false)
    api.listRepositories.mockResolvedValue([])
    renderPane()

    expect(await screen.findByText('Repository not found')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(api.confirmRemoveMissingRepository).toHaveBeenCalledWith(ROOT))
  })

  it('shows other errors as an alert', async () => {
    api.getStatus.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git blew up' })
    )
    renderPane()

    expect((await screen.findByRole('alert')).textContent).toContain('git blew up')
  })
})

describe('large lists', () => {
  it('renders 5,000 changes', async () => {
    const changes = Array.from({ length: 5000 }, (_, i) => change(`dir/file-${i}.txt`))
    api.getStatus.mockResolvedValue(status(changes))
    renderPane()

    expect(await screen.findAllByRole('listitem', {}, { timeout: 10000 })).toHaveLength(5000)
  }, 20000)
})

/** The row checkbox for one path. */
const box = (path: string): HTMLElement => screen.getByRole('checkbox', { name: new RegExp(path) })

describe('staging', () => {
  it('stages an unstaged change when its checkbox is clicked', async () => {
    api.getStatus.mockResolvedValue(status([change('a.txt')]))
    api.stageFiles.mockResolvedValue()
    renderPane()

    fireEvent.click(await screen.findByRole('checkbox', { name: /a\.txt/ }))

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['a.txt']))
  })

  it('unstages a staged change when its checkbox is clicked', async () => {
    api.getStatus.mockResolvedValue(
      status([change('a.txt', { index: 'modified', worktree: 'unmodified' })])
    )
    api.unstageFiles.mockResolvedValue()
    renderPane()

    fireEvent.click(await screen.findByRole('checkbox', { name: /a\.txt/ }))

    await waitFor(() => expect(api.unstageFiles).toHaveBeenCalledWith(ROOT, ['a.txt']))
  })

  it('stages the rest of a partially staged change', async () => {
    api.getStatus.mockResolvedValue(
      status([change('a.txt', { index: 'modified', worktree: 'modified' })])
    )
    api.stageFiles.mockResolvedValue()
    renderPane()

    fireEvent.click(await screen.findByRole('checkbox', { name: /a\.txt/ }))

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['a.txt']))
  })

  it('ticks the checkbox before git answers and unticks it if git refuses', async () => {
    api.getStatus.mockResolvedValue(status([change('a.txt')]))
    api.stageFiles.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'index locked' })
    )
    renderPane()

    fireEvent.click(await screen.findByRole('checkbox', { name: /a\.txt/ }))

    expect((await screen.findByRole('alert')).textContent).toContain('index locked')
    await waitFor(() => expect(box('a.txt').getAttribute('aria-checked')).toBe('false'))
  })

  it('stages the selected row on Space, without changing the selection', async () => {
    api.getStatus.mockResolvedValue(status([change('a.txt')]))
    api.stageFiles.mockResolvedValue()
    renderPane()

    const row = await screen.findByRole('button', { name: /a\.txt/ })
    fireEvent.click(row)
    fireEvent.keyDown(row, { key: ' ' })

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['a.txt']))
    expect(screen.getByLabelText('selected path').textContent).toBe('a.txt')
  })

  it('stages every change except conflicts from the header', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('a.txt'),
        change('b.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' }),
        change('c.txt', { index: null, worktree: null, kind: 'untracked' })
      ])
    )
    api.stageFiles.mockResolvedValue()
    renderPane()

    fireEvent.click(await screen.findByRole('button', { name: 'Stage All' }))

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['a.txt', 'c.txt']))
  })

  it('offers Unstage All, never disabled, when everything is staged already', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('a.txt', { index: 'modified', worktree: 'unmodified' }),
        change('b.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' }),
        change('c.txt', { index: 'added', worktree: 'unmodified' })
      ])
    )
    api.unstageFiles.mockResolvedValue()
    renderPane()

    const button = await screen.findByRole('button', { name: 'Unstage All' })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: 'Stage All' })).toBeNull()

    fireEvent.click(button)

    await waitFor(() => expect(api.unstageFiles).toHaveBeenCalledWith(ROOT, ['a.txt', 'c.txt']))
  })

  it('offers no stage-all button when the only changes are conflicts', async () => {
    api.getStatus.mockResolvedValue(
      status([change('b.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' })])
    )
    renderPane()

    // The row is there — a conflict has no row button, so it is found by its name.
    expect(await screen.findByText('b.txt')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stage All' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unstage All' })).toBeNull()
  })

  it('keeps Stage All while a change is partially staged, and stages the remainder', async () => {
    api.getStatus.mockResolvedValue(
      status([
        change('a.txt', { index: 'modified', worktree: 'unmodified' }),
        change('b.txt', { index: 'modified', worktree: 'modified' })
      ])
    )
    api.stageFiles.mockResolvedValue()
    renderPane()

    const button = await screen.findByRole('button', { name: 'Stage All' })
    expect(button.hasAttribute('disabled')).toBe(false)

    fireEvent.click(button)

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['b.txt']))
  })

  it('offers no Stage All button for a clean repository', async () => {
    api.getStatus.mockResolvedValue(status([]))
    renderPane()

    expect(await screen.findByText('No changes')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stage All' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unstage All' })).toBeNull()
  })
})

describe('the commit form', () => {
  it('is shown for a clean repository, and for one with no commits yet', async () => {
    api.getStatus.mockResolvedValue(status([], { branch: 'main', headOid: null }))
    renderPane()

    expect(await screen.findByRole('form', { name: 'Commit' })).toBeTruthy()
  })

  it('holds the Stage All button, which has left the pane header', async () => {
    api.getStatus.mockResolvedValue(status([change('a.txt')]))
    renderPane()

    const form = await screen.findByRole('form', { name: 'Commit' })
    expect(within(form).getByRole('button', { name: 'Stage All' })).toBeTruthy()
    const header = screen.getByText('main').closest('header') as HTMLElement
    expect(within(header).queryByRole('button', { name: 'Stage All' })).toBeNull()
  })

  it('sits above the changes list', async () => {
    api.getStatus.mockResolvedValue(status([change('a.txt')]))
    renderPane()

    const form = await screen.findByRole('form', { name: 'Commit' })
    const list = screen.getByRole('list', { name: 'Changes' })
    expect(form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps a repository’s draft through a switch to another repository and back', async () => {
    api.getStatus.mockResolvedValue(status([change('a.txt')]))
    const OTHER = '/repos/other'
    function Switcher(): React.JSX.Element {
      const [root, setRoot] = useState(ROOT)
      return (
        <>
          {/* Keyed on the root, as App does, so the pane remounts on a switch. */}
          <ChangedFiles key={root} root={root} />
          <button type="button" onClick={() => setRoot(root === ROOT ? OTHER : ROOT)}>
            Switch
          </button>
        </>
      )
    }
    renderWithProviders(<Switcher />)

    const subject = await screen.findByRole('textbox', { name: 'Commit subject' })
    fireEvent.focus(subject)
    fireEvent.change(subject, { target: { value: 'A draft subject' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Commit description' }), {
      target: { value: 'And its description.' }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Commit subject' }) as HTMLInputElement).value
      ).toBe('')
    )

    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))

    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'Commit subject' }) as HTMLInputElement).value
      ).toBe('A draft subject')
    )
    // The description was not empty, so the form came back expanded, with it intact.
    expect(
      (screen.getByRole('textbox', { name: 'Commit description' }) as HTMLTextAreaElement).value
    ).toBe('And its description.')
  })

  it('moves focus to the changes list once a commit lands', async () => {
    const staged = change('staged.txt', { index: 'modified', worktree: 'unmodified' })
    const left = change('left.txt')
    api.getStatus.mockResolvedValueOnce(status([staged, left]))
    // After the commit only the unstaged change is left, so there is still a list to focus.
    api.getStatus.mockResolvedValue(status([left]))
    api.commit.mockResolvedValue()
    renderPane()

    const subject = await screen.findByRole('textbox', { name: 'Commit subject' })
    fireEvent.change(subject, { target: { value: 'Commit the staged file' } })
    fireEvent.click(screen.getByRole('button', { name: /^Commit/ }))

    await waitFor(() => expect(api.commit).toHaveBeenCalledWith(ROOT, 'Commit the staged file\n'))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('list', { name: 'Changes' }))
    )
  })
})
