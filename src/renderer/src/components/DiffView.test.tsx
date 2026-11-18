// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type {
  ChangeDiff,
  DiffHunk,
  DiffLine,
  FileChange,
  FileDiff,
  RepositoryStatus
} from '../../../shared/git'
import type { RendererApi } from '../api'
import { useSelection } from '../data'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  getStatus: vi.fn<RendererApi['getStatus']>(),
  getDiff: vi.fn<RendererApi['getDiff']>()
}))
vi.mock('../api', () => ({ api }))

import { DiffView } from './DiffView'

const ROOT = '/repos/demo'

const change = (path: string, overrides: Partial<FileChange> = {}): FileChange => ({
  path,
  originalPath: null,
  index: 'unmodified',
  worktree: 'modified',
  kind: 'ordinary',
  ...overrides
})

const status = (changes: FileChange[]): RepositoryStatus => ({
  branch: 'main',
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes
})

const line = (
  kind: DiffLine['kind'],
  oldNumber: number | null,
  newNumber: number | null,
  text: string,
  noNewline = false
): DiffLine => ({ kind, oldNumber, newNumber, text, noNewline })

const textDiff = (hunks: DiffHunk[], truncated = false): FileDiff => ({
  binary: false,
  hunks,
  truncated
})

const simpleHunk: DiffHunk = {
  header: '@@ -1,2 +1,2 @@ heading',
  lines: [
    line('context', 1, 1, 'same'),
    line('removed', 2, null, 'old'),
    line('added', null, 2, 'new')
  ]
}

/** Selects a path as soon as it mounts, like clicking its row in the changes list. */
function Select({ path }: { path: string | null }): null {
  const { setSelectedPath } = useSelection()
  useEffect(() => setSelectedPath(path), [path, setSelectedPath])
  return null
}

function renderDiff(selected: string | null, changes: FileChange[], diff?: ChangeDiff) {
  api.getStatus.mockResolvedValue(status(changes))
  if (diff) api.getDiff.mockResolvedValue(diff)
  return renderWithProviders(
    <>
      <Select path={selected} />
      <DiffView root={ROOT} />
    </>,
    { tabs: [ROOT] }
  )
}

/** Each line of a table as "kind old new sign text". */
function linesOf(table: HTMLElement): string[] {
  return [...table.querySelectorAll('tr[data-kind]')].map((row) => {
    const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent)
    return `${row.getAttribute('data-kind')} ${cells.join('|')}`
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

afterEach(cleanup)

describe('with nothing to show', () => {
  it('asks the user to select a file when none is selected', async () => {
    renderDiff(null, [change('a.txt')])

    expect(await screen.findByText('Select a file to see its changes')).toBeTruthy()
    expect(api.getDiff).not.toHaveBeenCalled()
  })

  it('shows the same when the selected path is no longer a change', async () => {
    renderDiff('gone.txt', [change('a.txt')])

    expect(await screen.findByText('Select a file to see its changes')).toBeTruthy()
    expect(api.getDiff).not.toHaveBeenCalled()
  })

  it('says a file has no changes when git reports no diff on either side', async () => {
    renderDiff('a.txt', [change('a.txt')], { staged: null, unstaged: null })

    expect(await screen.findByText('No changes in this file')).toBeTruthy()
  })
})

describe('conflicts', () => {
  it('tells the user to resolve it in their editor, and asks git for no diff', async () => {
    renderDiff('c.txt', [
      change('c.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' })
    ])

    expect(await screen.findByText('Resolve this conflict in your editor')).toBeTruthy()
    expect(api.getDiff).not.toHaveBeenCalled()
  })
})

describe('a text diff', () => {
  it('requests the diff of the selected path', async () => {
    renderDiff('a.txt', [change('a.txt'), change('b.txt')], {
      staged: null,
      unstaged: textDiff([simpleHunk])
    })

    await screen.findByRole('table', { name: 'Unstaged changes' })
    expect(api.getDiff).toHaveBeenCalledWith(ROOT, 'a.txt', null)
  })

  it('shows two line-number gutters, the hunk header, and each line by kind', async () => {
    renderDiff('a.txt', [change('a.txt')], { staged: null, unstaged: textDiff([simpleHunk]) })

    const table = await screen.findByRole('table', { name: 'Unstaged changes' })

    expect(within(table).getByText('@@ -1,2 +1,2 @@ heading')).toBeTruthy()
    expect(linesOf(table)).toEqual(['context 1|1| |same', 'removed 2||-|old', 'added |2|+|new'])
  })

  it('shows a missing final newline after the line it belongs to', async () => {
    const hunk: DiffHunk = {
      header: '@@ -1 +1 @@',
      lines: [line('removed', 1, null, 'a', true), line('added', null, 1, 'b', true)]
    }
    renderDiff('a.txt', [change('a.txt')], { staged: null, unstaged: textDiff([hunk]) })

    const table = await screen.findByRole('table', { name: 'Unstaged changes' })

    expect(within(table).getAllByText('No newline at end of file')).toHaveLength(2)
  })

  it('keeps leading spaces and tabs in a line', async () => {
    const hunk: DiffHunk = {
      header: '@@ -0,0 +1 @@',
      lines: [line('added', null, 1, '\t  indented')]
    }
    renderDiff('a.txt', [change('a.txt')], { staged: null, unstaged: textDiff([hunk]) })

    const table = await screen.findByRole('table', { name: 'Unstaged changes' })

    expect(linesOf(table)).toEqual(['added |1|+|\t  indented'])
  })
})

describe('staged and unstaged', () => {
  it('stacks a Staged and an Unstaged view for a partially staged change', async () => {
    renderDiff('a.txt', [change('a.txt', { index: 'modified', worktree: 'modified' })], {
      staged: textDiff([
        {
          header: '@@ -1 +1 @@',
          lines: [line('removed', 1, null, 'one'), line('added', null, 1, 'two')]
        }
      ]),
      unstaged: textDiff([
        {
          header: '@@ -1 +1 @@',
          lines: [line('removed', 1, null, 'two'), line('added', null, 1, 'three')]
        }
      ])
    })

    const staged = await screen.findByRole('table', { name: 'Staged changes' })
    const unstaged = screen.getByRole('table', { name: 'Unstaged changes' })

    expect(screen.getByRole('heading', { name: 'Staged' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Unstaged' })).toBeTruthy()
    expect(linesOf(staged)).toEqual(['removed 1||-|one', 'added |1|+|two'])
    expect(linesOf(unstaged)).toEqual(['removed 1||-|two', 'added |1|+|three'])
    // Stacked: the staged view comes first in the page.
    expect(staged.compareDocumentPosition(unstaged) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows only the side that has a diff', async () => {
    renderDiff('a.txt', [change('a.txt', { index: 'modified', worktree: 'unmodified' })], {
      staged: textDiff([simpleHunk]),
      unstaged: null
    })

    await screen.findByRole('table', { name: 'Staged changes' })

    expect(screen.queryByRole('table', { name: 'Unstaged changes' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Unstaged' })).toBeNull()
  })
})

describe('renames', () => {
  it('asks for the staged diff with the original path, and shows old → new', async () => {
    renderDiff(
      'src/new.ts',
      [
        change('src/new.ts', {
          originalPath: 'src/old.ts',
          index: 'renamed',
          worktree: 'unmodified',
          kind: 'renamed'
        })
      ],
      { staged: textDiff([simpleHunk]), unstaged: null }
    )

    await screen.findByRole('table', { name: 'Staged changes' })

    expect(api.getDiff).toHaveBeenCalledWith(ROOT, 'src/new.ts', 'src/old.ts')
    const title = screen.getByRole('heading', { level: 2 })
    expect(title.textContent).toContain('src/old.ts')
    expect(title.textContent).toContain('src/new.ts')
  })

  it('says there are no content changes for a rename without edits', async () => {
    renderDiff(
      'new.txt',
      [
        change('new.txt', {
          originalPath: 'old.txt',
          index: 'renamed',
          worktree: 'unmodified',
          kind: 'renamed'
        })
      ],
      { staged: textDiff([]), unstaged: null }
    )

    expect(await screen.findByText('No changes to the contents')).toBeTruthy()
  })
})

describe('binary and truncated diffs', () => {
  it('says a binary file cannot be shown', async () => {
    renderDiff('blob.bin', [change('blob.bin')], { staged: null, unstaged: { binary: true } })

    expect(await screen.findByText('Binary file')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('shows what there is of a truncated diff, with a note', async () => {
    renderDiff('big.txt', [change('big.txt')], {
      staged: null,
      unstaged: textDiff([simpleHunk], true)
    })

    expect(await screen.findByText('Diff too large to show in full')).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Unstaged changes' })).toBeTruthy()
  })

  it('has no truncation note for a whole diff', async () => {
    renderDiff('a.txt', [change('a.txt')], { staged: null, unstaged: textDiff([simpleHunk]) })

    await screen.findByRole('table', { name: 'Unstaged changes' })

    expect(screen.queryByText('Diff too large to show in full')).toBeNull()
  })
})

describe('errors', () => {
  it('shows a failed diff as an alert', async () => {
    api.getDiff.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git diff failed' })
    )
    renderDiff('a.txt', [change('a.txt')])

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('git diff failed'))
  })
})
