// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UnwrappedApi } from '../unwrapApi'
import { createTestQueryClient } from './testUtils'

const api = vi.hoisted(() => ({ cancelGenerate: vi.fn<UnwrappedApi['cancelGenerate']>() }))
vi.mock('../api', () => ({ api }))

import { useStopGenerateBehindTabs } from './generate'
import { seedTabs, TabsProvider, useTabs } from './tabs'

function setup(roots: string[]) {
  seedTabs(roots)
  const client = createTestQueryClient()
  function wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <QueryClientProvider client={client}>
        <TabsProvider>{children}</TabsProvider>
      </QueryClientProvider>
    )
  }
  return renderHook(
    () => {
      useStopGenerateBehindTabs()
      return useTabs()
    },
    { wrapper }
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  api.cancelGenerate.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('useStopGenerateBehindTabs', () => {
  it('stops nothing while the focused tab stays in front', () => {
    setup(['/repos/a', '/repos/b'])

    expect(api.cancelGenerate).not.toHaveBeenCalled()
  })

  it('stops the run of a repository whose tab leaves the front', () => {
    const { result } = setup(['/repos/a', '/repos/b'])

    act(() => result.current.focusIndex(1))

    expect(api.cancelGenerate).toHaveBeenCalledExactlyOnceWith('/repos/a')
  })

  it('stops the run of a repository whose tab closes', () => {
    const { result } = setup(['/repos/a', '/repos/b'])

    act(() => result.current.closeFocused())

    expect(api.cancelGenerate).toHaveBeenCalledExactlyOnceWith('/repos/a')
  })
})
