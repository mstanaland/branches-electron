// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectionProvider, useSelection } from './selection'

const STORAGE_KEY = 'branches.activeRoot'

function wrapper({ children }: { children: ReactNode }): React.JSX.Element {
  return <SelectionProvider>{children}</SelectionProvider>
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('active repository', () => {
  it('starts with no repository when nothing was saved', () => {
    const { result } = renderHook(() => useSelection(), { wrapper })
    expect(result.current.activeRoot).toBeNull()
  })

  it('reopens the repository that was active last launch', () => {
    localStorage.setItem(STORAGE_KEY, '/repos/a')
    const { result } = renderHook(() => useSelection(), { wrapper })
    expect(result.current.activeRoot).toBe('/repos/a')
  })

  it('remembers the active repository for the next launch', () => {
    const { result } = renderHook(() => useSelection(), { wrapper })
    act(() => result.current.setActiveRoot('/repos/b'))
    expect(result.current.activeRoot).toBe('/repos/b')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('/repos/b')
  })

  it('forgets it when cleared', () => {
    localStorage.setItem(STORAGE_KEY, '/repos/a')
    const { result } = renderHook(() => useSelection(), { wrapper })
    act(() => result.current.setActiveRoot(null))
    expect(result.current.activeRoot).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useSelection(), { wrapper })
    expect(result.current.activeRoot).toBeNull()
    act(() => result.current.setActiveRoot('/repos/a'))
    expect(result.current.activeRoot).toBe('/repos/a')
  })
})

describe('selected change', () => {
  it('holds the one selected path', () => {
    const { result } = renderHook(() => useSelection(), { wrapper })
    act(() => result.current.setSelectedPath('src/a.ts'))
    act(() => result.current.setSelectedPath('src/b.ts'))
    expect(result.current.selectedPath).toBe('src/b.ts')
  })

  it('resets when the active repository changes', () => {
    const { result } = renderHook(() => useSelection(), { wrapper })
    act(() => result.current.setActiveRoot('/repos/a'))
    act(() => result.current.setSelectedPath('src/a.ts'))
    act(() => result.current.setActiveRoot('/repos/b'))
    expect(result.current.selectedPath).toBeNull()
  })

  it('is not persisted across launches', () => {
    const first = renderHook(() => useSelection(), { wrapper })
    act(() => first.result.current.setSelectedPath('src/a.ts'))
    first.unmount()
    const second = renderHook(() => useSelection(), { wrapper })
    expect(second.result.current.selectedPath).toBeNull()
  })
})
