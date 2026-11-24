// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnwrappedApi } from '../unwrapApi'
import { createTestQueryClient, queryWrapper } from './testUtils'

const api = vi.hoisted(() => ({
  recheckMergedBranches: vi.fn<UnwrappedApi['recheckMergedBranches']>()
}))
vi.mock('../api', () => ({ api }))

import { keys } from './keys'
import { useRefreshRepository } from './refresh'

function setup() {
  const client = createTestQueryClient()
  const hook = renderHook(() => useRefreshRepository('/repos/alpha'), {
    wrapper: queryWrapper(client)
  })
  return { client, ...hook }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(cleanup)

describe('useRefreshRepository', () => {
  it('asks main to check the merged branches again', async () => {
    api.recheckMergedBranches.mockResolvedValue(undefined)
    const { result } = setup()

    act(() => result.current.start())

    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(api.recheckMergedBranches).toHaveBeenCalledWith('/repos/alpha')
  })

  it('stays busy until GitHub has answered', async () => {
    let answer: (() => void) | undefined
    api.recheckMergedBranches.mockImplementation(
      () => new Promise<void>((resolve) => (answer = resolve))
    )
    const { result } = setup()

    act(() => result.current.start())
    await waitFor(() => expect(answer).toBeDefined())
    expect(result.current.busy).toBe(true)

    act(() => answer?.())
    await waitFor(() => expect(result.current.busy).toBe(false))
  })

  it('still re-reads from disk when the merged-branch check fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.recheckMergedBranches.mockRejectedValue(new Error('offline'))
    const { client, result } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    act(() => result.current.start())

    await waitFor(() => expect(result.current.busy).toBe(false))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.repository('/repos/alpha') })
  })
})
