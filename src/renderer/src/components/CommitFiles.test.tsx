// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { Commit, CommitFile, FileDiff } from '../../../shared/git'
import type { RendererApi } from '../api'
import { renderWithProviders } from '../data/testUtils'

const api = vi.hoisted(() => ({
  listCommitFiles: vi.fn<RendererApi['listCommitFiles']>(),
  getCommitFileDiff: vi.fn<RendererApi['getCommitFileDiff']>()
}))
vi.mock('../api', () => ({ api }))

import { CommitFiles } from './CommitFiles'

const ROOT = '/repos/alpha'

function commit(seed: string, parents: string[] = ['p'.repeat(40)]): Commit {
  const oid = seed.padEnd(40, '0')
  return {
    oid,
    shortOid: oid.slice(0, 8),
    parents,
    subject: `Subject ${seed}`,
    authorName: 'Test',
    authorDate: '2026-11-14T17:31:27-05:00'
  }
}

function file(
  path: string,
  kind: CommitFile['kind'] = 'modified',
  originalPath = null as string | null
): CommitFile {
  return { kind, path, originalPath }
}

const TEXT_DIFF: FileDiff = {
  binary: false,
  truncated: false,
  hunks: [
    {
      header: '@@ -1,2 +1,2 @@',
      lines: [
        { kind: 'removed', oldNumber: 1, newNumber: null, text: 'old line', noNewline: false },
        { kind: 'added', oldNumber: null, newNumber: 1, text: 'new line', noNewline: false },
        { kind: 'added', oldNumber: null, newNumber: 2, text: 'another', noNewline: false }
      ]
    }
  ]
}

function show(subject = commit('abc')) {
  return renderWithProviders(<CommitFiles root={ROOT} commit={subject} />, { tabs: [ROOT] })
}

const row = (name: RegExp): HTMLElement => screen.getByRole('button', { name })

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
})

afterEach(cleanup)

describe('the file rows', () => {
  it('lists each file with its change kind, collapsed, without reading any diff', async () => {
    api.listCommitFiles.mockResolvedValue([
      file('src/app.ts'),
      file('new.txt', 'added'),
      file('gone.txt', 'deleted')
    ])
    show()

    const app = await screen.findByRole('button', { name: /src\/app\.ts/ })
    expect(app.textContent).toContain('modified')
    expect(app.textContent).toContain('M')
    expect(row(/new\.txt/).textContent).toContain('added')
    expect(row(/gone\.txt/).textContent).toContain('deleted')
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-expanded')).toBe('false')
    }
    expect(api.listCommitFiles).toHaveBeenCalledWith(ROOT, commit('abc').oid)
    expect(api.getCommitFileDiff).not.toHaveBeenCalled()
  })

  it('shows a rename as old → new', async () => {
    api.listCommitFiles.mockResolvedValue([file('new name.ts', 'renamed', 'old name.ts')])
    show()

    const rename = await screen.findByRole('button', { name: /renamed/ })
    expect(rename.textContent).toContain('old name.ts')
    expect(rename.textContent).toContain('new name.ts')
    expect(within(rename).getByRole('img', { name: 'renamed to' })).toBeTruthy()
  })

  it('says when the commit changed no files', async () => {
    api.listCommitFiles.mockResolvedValue([])
    show()

    expect(await screen.findByText('No files changed')).toBeTruthy()
  })

  it('notes that a merge is compared with its first parent', async () => {
    api.listCommitFiles.mockResolvedValue([file('a.txt')])
    show(commit('abc', ['1'.repeat(40), '2'.repeat(40)]))

    expect(await screen.findByText(/first parent/i)).toBeTruthy()
  })

  it('has no merge note for an ordinary commit', async () => {
    api.listCommitFiles.mockResolvedValue([file('a.txt')])
    show()

    await screen.findByRole('button', { name: /a\.txt/ })
    expect(screen.queryByText(/first parent/i)).toBeNull()
  })

  it('shows an error when the list cannot be read', async () => {
    api.listCommitFiles.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git diff-tree failed: boom' })
    )
    show()

    expect((await screen.findByRole('alert')).textContent).toContain('boom')
  })
})

describe('an expanded file', () => {
  it('reads its diff the first time it opens, and shows a summary and the diff', async () => {
    api.listCommitFiles.mockResolvedValue([file('new.ts', 'renamed', 'old.ts'), file('b.txt')])
    api.getCommitFileDiff.mockResolvedValue(TEXT_DIFF)
    show()

    fireEvent.click(await screen.findByRole('button', { name: /new\.ts/ }))

    expect(await screen.findByText('1 hunk, 2 insertions, 1 deletion')).toBeTruthy()
    expect(screen.getByText('new line')).toBeTruthy()
    expect(api.getCommitFileDiff).toHaveBeenCalledTimes(1)
    expect(api.getCommitFileDiff).toHaveBeenCalledWith(ROOT, commit('abc').oid, 'new.ts', 'old.ts')
  })

  it('keeps several files open at once', async () => {
    api.listCommitFiles.mockResolvedValue([file('a.txt'), file('b.txt')])
    api.getCommitFileDiff.mockResolvedValue(TEXT_DIFF)
    show()

    fireEvent.click(await screen.findByRole('button', { name: /a\.txt/ }))
    fireEvent.click(row(/b\.txt/))

    await waitFor(() =>
      expect(screen.getAllByText('1 hunk, 2 insertions, 1 deletion')).toHaveLength(2)
    )
  })

  it('says a truncated diff was truncated instead of counting it', async () => {
    api.listCommitFiles.mockResolvedValue([file('big.txt')])
    api.getCommitFileDiff.mockResolvedValue({ ...TEXT_DIFF, truncated: true })
    show()

    fireEvent.click(await screen.findByRole('button', { name: /big\.txt/ }))

    expect(await screen.findByText(/truncated/i)).toBeTruthy()
    expect(screen.queryByText(/insertion/)).toBeNull()
  })

  it('shows the binary notice for a binary file', async () => {
    api.listCommitFiles.mockResolvedValue([file('image.png')])
    api.getCommitFileDiff.mockResolvedValue({ binary: true })
    show()

    fireEvent.click(await screen.findByRole('button', { name: /image\.png/ }))

    expect(await screen.findByText('Binary file')).toBeTruthy()
  })

  it('says a mode-only change has no content changes', async () => {
    api.listCommitFiles.mockResolvedValue([file('run.sh')])
    api.getCommitFileDiff.mockResolvedValue({ binary: false, hunks: [], truncated: false })
    show()

    fireEvent.click(await screen.findByRole('button', { name: /run\.sh/ }))

    expect(await screen.findByText('No content changes')).toBeTruthy()
  })

  it('shows a failed diff inside that file only', async () => {
    api.listCommitFiles.mockResolvedValue([file('bad.txt'), file('good.txt')])
    api.getCommitFileDiff.mockImplementation(async (_root, _oid, path) => {
      if (path === 'bad.txt') {
        throw new ApiError({ code: 'COMMAND_FAILED', message: 'git diff-tree failed: nope' })
      }
      return TEXT_DIFF
    })
    show()

    fireEvent.click(await screen.findByRole('button', { name: /bad\.txt/ }))
    fireEvent.click(row(/good\.txt/))

    expect((await screen.findByRole('alert')).textContent).toContain('nope')
    expect(await screen.findByText('1 hunk, 2 insertions, 1 deletion')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('collapses everything when a different commit is shown', async () => {
    api.listCommitFiles.mockResolvedValue([file('a.txt')])
    api.getCommitFileDiff.mockResolvedValue(TEXT_DIFF)
    const { rerender } = show()

    fireEvent.click(await screen.findByRole('button', { name: /a\.txt/ }))
    await screen.findByText('new line')
    rerender(<CommitFiles root={ROOT} commit={commit('def')} />)

    const next = await screen.findByRole('button', { name: /a\.txt/ })
    expect(next.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('new line')).toBeNull()
  })
})
