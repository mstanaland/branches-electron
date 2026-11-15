// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient, queryWrapper } from './testUtils'
import { installWindowFocusListener } from './windowFocus'

afterEach(cleanup)

function renderCountingQuery(queryFn: () => Promise<string>) {
  return renderHook(() => useQuery({ queryKey: ['thing'], queryFn }), {
    wrapper: queryWrapper(createTestQueryClient())
  })
}

describe('installWindowFocusListener', () => {
  it('refetches when the window regains focus, which an Electron window reports with blur and focus rather than visibilitychange', async () => {
    const teardown = installWindowFocusListener()
    const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue('value')
    const { result } = renderCountingQuery(queryFn)
    await waitFor(() => expect(result.current.data).toBe('value'))
    expect(queryFn).toHaveBeenCalledTimes(1)

    // Switching to another app and back: the window stays visible the whole time.
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
    teardown()
  })

  it('still refetches when the window becomes visible again', async () => {
    const teardown = installWindowFocusListener()
    const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue('value')
    const { result } = renderCountingQuery(queryFn)
    await waitFor(() => expect(result.current.data).toBe('value'))

    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    visibility.mockReturnValue('hidden')
    window.dispatchEvent(new Event('visibilitychange'))
    visibility.mockReturnValue('visible')
    window.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
    visibility.mockRestore()
    teardown()
  })

  it('does not refetch when the window merely loses focus', async () => {
    const teardown = installWindowFocusListener()
    const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue('value')
    const { result } = renderCountingQuery(queryFn)
    await waitFor(() => expect(result.current.data).toBe('value'))

    window.dispatchEvent(new Event('blur'))

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(queryFn).toHaveBeenCalledTimes(1)
    teardown()
  })
})
