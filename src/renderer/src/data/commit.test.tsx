// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/apiError'
import type { UnwrappedApi } from '../unwrapApi'
import { keys } from './keys'
import { createTestQueryClient, queryWrapper } from './testUtils'

const api = vi.hoisted(() => ({ commit: vi.fn<UnwrappedApi['commit']>() }))
vi.mock('../api', () => ({ api }))

import { buildCommitMessage, useCommit } from './commit'

const ROOT = '/repos/demo'

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(cleanup)

describe('buildCommitMessage', () => {
  it('is just the subject when there is no description', () => {
    expect(buildCommitMessage({ subject: 'Fix the thing', description: '' })).toBe(
      'Fix the thing\n'
    )
  })

  it('separates the subject and the description with a blank line', () => {
    expect(buildCommitMessage({ subject: 'Fix the thing', description: 'It was broken.' })).toBe(
      'Fix the thing\n\nIt was broken.\n'
    )
  })

  it('keeps the paragraphs inside a description', () => {
    expect(
      buildCommitMessage({ subject: 'Fix it', description: 'One reason.\n\nAnd another.' })
    ).toBe('Fix it\n\nOne reason.\n\nAnd another.\n')
  })

  it('ignores a description of only whitespace', () => {
    expect(buildCommitMessage({ subject: 'Fix it', description: '  \n\n ' })).toBe('Fix it\n')
  })

  it('trims stray whitespace around both parts', () => {
    expect(buildCommitMessage({ subject: '  Fix it  ', description: '\nWhy.\n\n' })).toBe(
      'Fix it\n\nWhy.\n'
    )
  })
})

describe('useCommit', () => {
  it('sends the built message to git', async () => {
    api.commit.mockResolvedValue()
    const client = createTestQueryClient()
    const { result } = renderHook(() => useCommit(ROOT), { wrapper: queryWrapper(client) })

    act(() => result.current.mutate({ subject: 'Fix it', description: 'Why.' }))

    await waitFor(() => expect(api.commit).toHaveBeenCalledWith(ROOT, 'Fix it\n\nWhy.\n'))
  })

  it('refreshes the status and the branches once the commit lands', async () => {
    api.commit.mockResolvedValue()
    const client = createTestQueryClient()
    const invalidated: unknown[][] = []
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async (filters) => {
      invalidated.push(filters?.queryKey as unknown[])
    })
    const { result } = renderHook(() => useCommit(ROOT), { wrapper: queryWrapper(client) })

    act(() => result.current.mutate({ subject: 'Fix it', description: '' }))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidated).toEqual(
      expect.arrayContaining([keys.status(ROOT), keys.branches(ROOT), keys.diffs(ROOT)])
    )
  })

  it('reports a failure instead of throwing it away', async () => {
    api.commit.mockRejectedValue(
      new ApiError({ code: 'COMMAND_FAILED', message: 'git commit failed: hook said no' })
    )
    const client = createTestQueryClient()
    const { result } = renderHook(() => useCommit(ROOT), { wrapper: queryWrapper(client) })

    act(() => result.current.mutate({ subject: 'Fix it', description: '' }))

    await waitFor(() => expect(result.current.error?.message).toContain('hook said no'))
  })
})
