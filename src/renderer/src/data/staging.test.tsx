// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { FileChange, RepositoryStatus } from '../../../shared/git'
import type { UnwrappedApi } from '../unwrapApi'
import { keys } from './keys'
import { createTestQueryClient, queryWrapper } from './testUtils'

const api = vi.hoisted(() => ({
  stageFiles: vi.fn<UnwrappedApi['stageFiles']>(),
  unstageFiles: vi.fn<UnwrappedApi['unstageFiles']>()
}))
vi.mock('../api', () => ({ api }))

import { useStaging } from './staging'

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

/** A hook with the repository's status already cached, as the pane would have it. */
function renderStaging(changes: FileChange[]) {
  const client = createTestQueryClient()
  client.setQueryData(keys.status(ROOT), status(changes))
  const { result } = renderHook(() => useStaging(ROOT, changes), { wrapper: queryWrapper(client) })
  const cached = () => client.getQueryData<RepositoryStatus>(keys.status(ROOT))!.changes
  return { client, result, cached }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(cleanup)

describe('toggle', () => {
  it('stages an unstaged change', async () => {
    api.stageFiles.mockResolvedValue()
    const { result } = renderStaging([change('a.txt')])

    act(() => result.current.toggle(change('a.txt')))

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['a.txt']))
  })

  it('stages the rest of a partially staged change', async () => {
    api.stageFiles.mockResolvedValue()
    const partial = change('a.txt', { index: 'modified', worktree: 'modified' })
    const { result } = renderStaging([partial])

    act(() => result.current.toggle(partial))

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['a.txt']))
  })

  it('unstages a staged change', async () => {
    api.unstageFiles.mockResolvedValue()
    const staged = change('a.txt', { index: 'modified', worktree: 'unmodified' })
    const { result } = renderStaging([staged])

    act(() => result.current.toggle(staged))

    await waitFor(() => expect(api.unstageFiles).toHaveBeenCalledWith(ROOT, ['a.txt']))
  })
})

describe('optimistic updates', () => {
  it('shows the change as staged before git answers, and keeps it after', async () => {
    // Never resolves, so what the test sees is only ever the optimistic status.
    api.stageFiles.mockReturnValue(new Promise<void>(() => {}))
    const { result, cached } = renderStaging([change('a.txt')])

    act(() => result.current.toggle(change('a.txt')))

    await waitFor(() =>
      expect(cached()).toEqual([
        expect.objectContaining({ path: 'a.txt', index: 'modified', worktree: 'unmodified' })
      ])
    )
    expect(result.current.pending).toBe(true)
  })

  it('puts the change back and reports the error when staging fails', async () => {
    api.stageFiles.mockRejectedValue(new ApiError({ code: 'COMMAND_FAILED', message: 'no' }))
    const { result, cached } = renderStaging([change('a.txt')])

    act(() => result.current.toggle(change('a.txt')))

    await waitFor(() => expect(result.current.error?.message).toBe('no'))
    expect(cached()).toEqual([
      expect.objectContaining({ path: 'a.txt', index: 'unmodified', worktree: 'modified' })
    ])
  })
})

describe('stageAll', () => {
  it('stages every change except conflicts', async () => {
    api.stageFiles.mockResolvedValue()
    const { result } = renderStaging([
      change('a.txt'),
      change('b.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' }),
      change('c.txt', { index: null, worktree: null, kind: 'untracked' }),
      change('d.txt', { kind: 'ignored', index: null, worktree: null })
    ])

    act(() => result.current.stageAll())

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['a.txt', 'c.txt']))
  })

  it('does nothing when every change is a conflict', () => {
    const { result } = renderStaging([
      change('b.txt', { kind: 'unmerged', index: 'unmerged', worktree: 'unmerged' })
    ])

    expect(result.current.canStageAll).toBe(false)
    act(() => result.current.stageAll())
    expect(api.stageFiles).not.toHaveBeenCalled()
  })

  it('leaves an already fully staged change out', async () => {
    api.stageFiles.mockResolvedValue()
    const { result } = renderStaging([
      change('a.txt', { index: 'modified', worktree: 'unmodified' }),
      change('b.txt')
    ])

    act(() => result.current.stageAll())

    await waitFor(() => expect(api.stageFiles).toHaveBeenCalledWith(ROOT, ['b.txt']))
  })
})
