// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { Branch, ChangeDiff, RepositoryStatus, SavedRepository } from '../../../shared/git'
import type { UnwrappedApi } from '../unwrapApi'
import { createTestQueryClient, queryWrapper } from './testUtils'

const api = vi.hoisted(() => ({
  openRepository: vi.fn<UnwrappedApi['openRepository']>(),
  listRepositories: vi.fn<UnwrappedApi['listRepositories']>(),
  removeRepository: vi.fn<UnwrappedApi['removeRepository']>(),
  getStatus: vi.fn<UnwrappedApi['getStatus']>(),
  listBranches: vi.fn<UnwrappedApi['listBranches']>(),
  getDiff: vi.fn<UnwrappedApi['getDiff']>()
}))
vi.mock('../api', () => ({ api }))

import { useBranches, useDiff, useRepositories, useStatus } from './queries'

const status = (branch: string): RepositoryStatus => ({
  branch,
  headOid: 'abc1234',
  detached: false,
  upstream: null,
  ahead: 0,
  behind: 0,
  changes: []
})

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(cleanup)

describe('useStatus', () => {
  it('loads the status of the given repository', async () => {
    api.getStatus.mockResolvedValue(status('main'))
    const { result } = renderHook(() => useStatus('/repos/a'), {
      wrapper: queryWrapper(createTestQueryClient())
    })
    await waitFor(() => expect(result.current.data?.branch).toBe('main'))
    expect(api.getStatus).toHaveBeenCalledWith('/repos/a')
  })

  it('does not call git while there is no active repository', () => {
    const { result } = renderHook(() => useStatus(null), {
      wrapper: queryWrapper(createTestQueryClient())
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.getStatus).not.toHaveBeenCalled()
  })

  it('keeps showing the previous data while refetching', async () => {
    api.getStatus.mockResolvedValueOnce(status('main'))
    const client = createTestQueryClient()
    // Spread so every field is tracked: TanStack only re-renders for fields the hook has read.
    const { result } = renderHook(() => ({ ...useStatus('/repos/a') }), {
      wrapper: queryWrapper(client)
    })
    await waitFor(() => expect(result.current.data?.branch).toBe('main'))

    let finish!: (value: RepositoryStatus) => void
    api.getStatus.mockReturnValueOnce(
      new Promise<RepositoryStatus>((resolve) => (finish = resolve))
    )
    await act(async () => {
      void client.invalidateQueries()
    })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    expect(result.current.data?.branch).toBe('main')

    finish(status('dev'))
    await waitFor(() => expect(result.current.data?.branch).toBe('dev'))
  })

  it('exposes a NOT_A_REPOSITORY failure as an ApiError the UI can check', async () => {
    api.getStatus.mockRejectedValue(new ApiError({ code: 'NOT_A_REPOSITORY', message: 'gone' }))
    const { result } = renderHook(() => useStatus('/repos/a'), {
      wrapper: queryWrapper(createTestQueryClient())
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect((result.current.error as ApiError).code).toBe('NOT_A_REPOSITORY')
  })
})

describe('useBranches', () => {
  it('loads branches for the repository, and not without one', async () => {
    const branches: Branch[] = [
      {
        name: 'main',
        isCurrent: true,
        shortOid: 'abc1234',
        upstream: null,
        upstreamGone: false,
        ahead: 0,
        behind: 0
      }
    ]
    api.listBranches.mockResolvedValue(branches)
    const wrapper = queryWrapper(createTestQueryClient())
    const idle = renderHook(() => useBranches(null), { wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')

    const { result } = renderHook(() => useBranches('/repos/a'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(branches))
    expect(api.listBranches).toHaveBeenCalledWith('/repos/a')
  })
})

describe('useDiff', () => {
  const diff: ChangeDiff = { staged: null, unstaged: { binary: true } }

  it('loads the diff of one path, passing the original path of a rename', async () => {
    api.getDiff.mockResolvedValue(diff)
    const { result } = renderHook(() => useDiff('/repos/a', 'new.txt', 'old.txt'), {
      wrapper: queryWrapper(createTestQueryClient())
    })

    await waitFor(() => expect(result.current.data).toEqual(diff))
    expect(api.getDiff).toHaveBeenCalledWith('/repos/a', 'new.txt', 'old.txt')
  })

  it('does not call git without a repository or without a path', () => {
    const wrapper = queryWrapper(createTestQueryClient())
    const noRoot = renderHook(() => useDiff(null, 'a.txt', null), { wrapper })
    const noPath = renderHook(() => useDiff('/repos/a', null, null), { wrapper })

    expect(noRoot.result.current.fetchStatus).toBe('idle')
    expect(noPath.result.current.fetchStatus).toBe('idle')
    expect(api.getDiff).not.toHaveBeenCalled()
  })

  it('keeps a separate result for each path', async () => {
    api.getDiff.mockImplementation(async (_root, path) => ({
      staged: null,
      unstaged: { binary: false, hunks: [], truncated: path === 'b.txt' }
    }))
    const wrapper = queryWrapper(createTestQueryClient())
    const a = renderHook(() => useDiff('/repos/a', 'a.txt', null), { wrapper })
    const b = renderHook(() => useDiff('/repos/a', 'b.txt', null), { wrapper })

    await waitFor(() => expect(a.result.current.data).toBeDefined())
    await waitFor(() => expect(b.result.current.data).toBeDefined())
    expect(a.result.current.data?.unstaged).toMatchObject({ truncated: false })
    expect(b.result.current.data?.unstaged).toMatchObject({ truncated: true })
  })
})

describe('useRepositories', () => {
  it('loads the saved repositories, including their missing flag', async () => {
    const repos: SavedRepository[] = [
      { root: '/repos/a', name: 'a', lastOpenedAt: '2026-11-14T00:00:00.000Z', missing: true }
    ]
    api.listRepositories.mockResolvedValue(repos)
    const { result } = renderHook(() => useRepositories(), {
      wrapper: queryWrapper(createTestQueryClient())
    })
    await waitFor(() => expect(result.current.data).toEqual(repos))
  })
})
