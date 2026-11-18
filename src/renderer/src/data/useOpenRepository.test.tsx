// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowApi } from '../../../shared/api'
import { ApiError } from '../../../shared/apiError'
import type { UnwrappedApi } from '../unwrapApi'
import { createTestQueryClient } from './testUtils'

const api = vi.hoisted(() => ({
  openRepository: vi.fn<UnwrappedApi['openRepository']>(),
  onOpenRepositoryRequested: vi.fn<WindowApi['onOpenRepositoryRequested']>(),
  listRepositories: vi.fn<UnwrappedApi['listRepositories']>(),
  removeRepository: vi.fn<UnwrappedApi['removeRepository']>(),
  getStatus: vi.fn<UnwrappedApi['getStatus']>(),
  listBranches: vi.fn<UnwrappedApi['listBranches']>()
}))
vi.mock('../api', () => ({ api }))

import { keys } from './keys'
import { TabsProvider, useSelection } from './tabs'
import { useOpenRepository } from './useOpenRepository'

function setup() {
  const client = createTestQueryClient()
  function wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <QueryClientProvider client={client}>
        <TabsProvider>{children}</TabsProvider>
      </QueryClientProvider>
    )
  }
  const hook = renderHook(() => ({ open: useOpenRepository(), selection: useSelection() }), {
    wrapper
  })
  return { client, ...hook }
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.onOpenRepositoryRequested.mockReturnValue(() => {})
})

afterEach(cleanup)

describe('useOpenRepository', () => {
  it('puts the opened repository in a tab and refreshes the saved list', async () => {
    api.openRepository.mockResolvedValue('/repos/a')
    const { client, result } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await act(() => result.current.open.mutateAsync())

    expect(result.current.selection.activeRoot).toBe('/repos/a')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.repositories() })
  })

  it('changes nothing when the user cancels the picker', async () => {
    api.openRepository.mockResolvedValue(null)
    const { client, result } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await act(() => result.current.open.mutateAsync())

    expect(result.current.selection.activeRoot).toBeNull()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('surfaces a failure as an error the UI can display', async () => {
    api.openRepository.mockRejectedValue(
      new ApiError({ code: 'NOT_A_REPOSITORY', message: 'not a repo' })
    )
    const { result } = setup()

    await act(async () => {
      await result.current.open.mutateAsync().catch(() => undefined)
    })

    await waitFor(() => expect(result.current.open.error).toBeInstanceOf(ApiError))
    expect(result.current.selection.activeRoot).toBeNull()
  })
})

describe('File > Open Repository… (Cmd+O)', () => {
  it('runs the open flow when main asks, and stops listening on unmount', async () => {
    const unsubscribe = vi.fn<() => void>()
    const listeners: Array<() => void> = []
    api.onOpenRepositoryRequested.mockImplementation((listener) => {
      listeners.push(listener)
      return unsubscribe
    })
    api.openRepository.mockResolvedValue('/repos/a')
    const { result, unmount } = setup()

    await act(async () => listeners[0]())

    await waitFor(() => expect(result.current.selection.activeRoot).toBe('/repos/a'))

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
