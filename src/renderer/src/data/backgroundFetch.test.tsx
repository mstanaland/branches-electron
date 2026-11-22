// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowApi } from '../../../shared/api'
import type { UnwrappedApi } from '../unwrapApi'
import { createTestQueryClient } from './testUtils'

const api = vi.hoisted(() => ({
  setActiveRepository: vi.fn<UnwrappedApi['setActiveRepository']>(),
  onRemoteRefsChanged: vi.fn<WindowApi['onRemoteRefsChanged']>(),
  onMergedBranchesChanged: vi.fn<WindowApi['onMergedBranchesChanged']>()
}))
vi.mock('../api', () => ({ api }))

import { useBackgroundFetch } from './backgroundFetch'
import { keys } from './keys'
import { TabsProvider, useSelection, useTabs } from './tabs'

/** Hands back the listener the hook subscribed with, so a test can push an event at it. */
function emitter(
  subscribe:
    | typeof api.onRemoteRefsChanged
    | typeof api.onMergedBranchesChanged = api.onRemoteRefsChanged
) {
  const listeners = new Set<(root: string) => void>()
  subscribe.mockImplementation((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  })
  return {
    emit: (root: string) => act(() => listeners.forEach((listener) => listener(root))),
    get count() {
      return listeners.size
    }
  }
}

function setup() {
  const client = createTestQueryClient()
  function wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <QueryClientProvider client={client}>
        <TabsProvider>{children}</TabsProvider>
      </QueryClientProvider>
    )
  }
  const hook = renderHook(
    () => {
      useBackgroundFetch()
      return { ...useSelection(), chooseRepository: useTabs().chooseRepository }
    },
    { wrapper }
  )
  return { client, ...hook }
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.setActiveRepository.mockResolvedValue(undefined)
  api.onRemoteRefsChanged.mockReturnValue(() => {})
  api.onMergedBranchesChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('useBackgroundFetch', () => {
  it('tells main there is no active repository at first', () => {
    setup()

    expect(api.setActiveRepository).toHaveBeenCalledWith(null)
  })

  it('tells main which repository the focused tab holds when it changes', async () => {
    const { result } = setup()

    act(() => result.current.chooseRepository('/repo'))

    await waitFor(() => expect(api.setActiveRepository).toHaveBeenLastCalledWith('/repo'))
  })

  it('survives a failure to reach main', async () => {
    api.setActiveRepository.mockRejectedValue(new Error('no window'))

    const { result } = setup()
    act(() => result.current.chooseRepository('/repo'))

    await waitFor(() => expect(api.setActiveRepository).toHaveBeenLastCalledWith('/repo'))
  })

  it('re-reads branches and status when a background fetch moved a ref', () => {
    const events = emitter()
    const { client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    events.emit('/repo')

    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.branches('/repo') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.status('/repo') })
  })

  it('leaves diffs alone, since a fetch changes no working-tree file', () => {
    const events = emitter()
    const { client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    events.emit('/repo')

    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: keys.diffs('/repo') })
  })

  it('re-reads the merged branches when main says they changed', () => {
    const events = emitter(api.onMergedBranchesChanged)
    const { client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    events.emit('/repo')

    expect(invalidate).toHaveBeenCalledWith({ queryKey: keys.mergedBranches('/repo') })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: keys.branches('/repo') })
  })

  it('leaves the merged branches alone when only refs moved, since main reports those itself', () => {
    const events = emitter()
    const { client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    events.emit('/repo')

    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: keys.mergedBranches('/repo') })
  })

  it('unsubscribes from the merged-branches event when it goes away', () => {
    const events = emitter(api.onMergedBranchesChanged)
    const { unmount } = setup()
    expect(events.count).toBe(1)

    unmount()

    expect(events.count).toBe(0)
  })

  it('unsubscribes when it goes away', () => {
    const events = emitter()
    const { unmount } = setup()
    expect(events.count).toBe(1)

    unmount()

    expect(events.count).toBe(0)
  })
})
