// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { FileChange, RepositoryStatus } from '../../../shared/git'
import type { RendererApi } from '../api'
import { useSelection } from '../data'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  getStatus: vi.fn<RendererApi['getStatus']>(),
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
    </>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
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
