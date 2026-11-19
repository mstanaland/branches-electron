// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_TABS } from '../../../shared/tabs'
import { TabsProvider, useSelection, useTabs } from './tabs'

const STORAGE_KEY = 'branches.tabs'

function wrapper({ children }: { children: ReactNode }): React.JSX.Element {
  return <TabsProvider>{children}</TabsProvider>
}

function setup() {
  return renderHook(() => ({ tabs: useTabs(), selection: useSelection() }), { wrapper })
}

/** The roots in the strip, with null standing for a Repositories tab. */
const roots = (result: { current: { tabs: { tabs: readonly { root: string | null }[] } } }) =>
  result.current.tabs.tabs.map((tab) => tab.root)

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('opening tabs', () => {
  it('starts with no tabs at all, which is the backdrop', () => {
    const { result } = setup()

    expect(result.current.tabs.tabs).toHaveLength(0)
    expect(result.current.tabs.focused).toBeNull()
    expect(result.current.selection.activeRoot).toBeNull()
  })

  it('opens a Repositories tab, focused, with no repository', () => {
    const { result } = setup()

    act(() => result.current.tabs.openTab())

    expect(roots(result)).toEqual([null])
    expect(result.current.tabs.focused?.root).toBeNull()
  })

  it('turns the focused Repositories tab into a repository tab in place', () => {
    const { result } = setup()
    act(() => result.current.tabs.openTab())
    const id = result.current.tabs.focused?.id

    act(() => result.current.tabs.chooseRepository('/repos/a'))

    expect(roots(result)).toEqual(['/repos/a'])
    expect(result.current.tabs.focused?.id).toBe(id)
    expect(result.current.selection.activeRoot).toBe('/repos/a')
  })

  it('opens the first tab when there is no tab to convert', () => {
    const { result } = setup()

    act(() => result.current.tabs.chooseRepository('/repos/a'))

    expect(roots(result)).toEqual(['/repos/a'])
  })

  it('opens another tab rather than replacing a repository tab', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))

    act(() => result.current.tabs.chooseRepository('/repos/b'))

    expect(roots(result)).toEqual(['/repos/a', '/repos/b'])
    expect(result.current.tabs.focused?.root).toBe('/repos/b')
  })
})

describe('one repository, one tab', () => {
  it('focuses the existing tab instead of opening a second', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    const first = result.current.tabs.focused?.id
    act(() => result.current.tabs.chooseRepository('/repos/b'))

    act(() => result.current.tabs.chooseRepository('/repos/a'))

    expect(roots(result)).toEqual(['/repos/a', '/repos/b'])
    expect(result.current.tabs.focused?.id).toBe(first)
  })

  it('closes the Repositories tab that was used to choose an already-open repository', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    const first = result.current.tabs.focused?.id
    act(() => result.current.tabs.openTab())

    act(() => result.current.tabs.chooseRepository('/repos/a'))

    expect(roots(result)).toEqual(['/repos/a'])
    expect(result.current.tabs.focused?.id).toBe(first)
  })
})

describe('the four-tab limit', () => {
  it('stops opening tabs once the strip is full, counting Repositories tabs', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    act(() => result.current.tabs.chooseRepository('/repos/b'))
    act(() => result.current.tabs.chooseRepository('/repos/c'))
    act(() => result.current.tabs.openTab())

    expect(result.current.tabs.tabs).toHaveLength(MAX_TABS)
    expect(result.current.tabs.canOpenTab).toBe(false)

    act(() => result.current.tabs.openTab())
    expect(result.current.tabs.tabs).toHaveLength(MAX_TABS)
  })

  it('refuses a new repository when the strip is full, leaving the tabs alone', () => {
    const { result } = setup()
    for (const name of ['a', 'b', 'c', 'd']) {
      act(() => result.current.tabs.chooseRepository(`/repos/${name}`))
    }

    act(() => result.current.tabs.chooseRepository('/repos/e'))

    expect(roots(result)).toEqual(['/repos/a', '/repos/b', '/repos/c', '/repos/d'])
  })
})

describe('closing tabs', () => {
  it('focuses the tab on the right, or the left when there is none', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    act(() => result.current.tabs.chooseRepository('/repos/b'))
    act(() => result.current.tabs.chooseRepository('/repos/c'))
    const b = result.current.tabs.tabs[1]
    act(() => result.current.tabs.focusTab(b.id))

    act(() => result.current.tabs.closeTab(b.id))
    expect(result.current.tabs.focused?.root).toBe('/repos/c')

    act(() => result.current.tabs.closeTab(result.current.tabs.focused!.id))
    expect(result.current.tabs.focused?.root).toBe('/repos/a')
  })

  it('leaves the focus where it is when another tab closes', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    act(() => result.current.tabs.chooseRepository('/repos/b'))

    act(() => result.current.tabs.closeTab(result.current.tabs.tabs[0].id))

    expect(result.current.tabs.focused?.root).toBe('/repos/b')
  })

  it('leaves the backdrop when the last tab closes', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))

    act(() => result.current.tabs.closeTab(result.current.tabs.tabs[0].id))

    expect(result.current.tabs.tabs).toHaveLength(0)
    expect(result.current.tabs.focused).toBeNull()
  })

  it('closes the tab showing a repository that has left the saved list', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    act(() => result.current.tabs.chooseRepository('/repos/b'))

    act(() => result.current.tabs.closeRepository('/repos/a'))

    expect(roots(result)).toEqual(['/repos/b'])
  })

  it('ignores a repository that is in no tab', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))

    act(() => result.current.tabs.closeRepository('/repos/b'))

    expect(roots(result)).toEqual(['/repos/a'])
  })
})

describe('what a tab holds', () => {
  it('keeps a view and a selected change per tab', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    act(() => result.current.selection.setView({ kind: 'branch', name: 'main' }))
    act(() => result.current.selection.setSelectedPath('src/a.ts'))

    act(() => result.current.tabs.chooseRepository('/repos/b'))
    expect(result.current.selection.view).toEqual({ kind: 'working' })
    expect(result.current.selection.selectedPath).toBeNull()

    act(() => result.current.tabs.focusTab(result.current.tabs.tabs[0].id))
    expect(result.current.selection.view).toEqual({ kind: 'branch', name: 'main' })
    expect(result.current.selection.selectedPath).toBe('src/a.ts')
  })

  it('keeps a selected commit per tab, across a tab switch', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    act(() => result.current.selection.setView({ kind: 'branch', name: 'main' }))
    act(() => result.current.selection.setSelectedCommit('a'.repeat(40)))

    act(() => result.current.tabs.chooseRepository('/repos/b'))
    expect(result.current.selection.selectedCommit).toBeNull()

    act(() => result.current.tabs.focusTab(result.current.tabs.tabs[0].id))
    expect(result.current.selection.selectedCommit).toBe('a'.repeat(40))
  })

  it('clears the selected commit when a different branch is selected, but not the same one', () => {
    const { result } = setup()
    act(() => result.current.tabs.chooseRepository('/repos/a'))
    act(() => result.current.selection.setView({ kind: 'branch', name: 'main' }))
    act(() => result.current.selection.setSelectedCommit('a'.repeat(40)))

    act(() => result.current.selection.setView({ kind: 'branch', name: 'main' }))
    expect(result.current.selection.selectedCommit).toBe('a'.repeat(40))

    act(() => result.current.selection.setView({ kind: 'branch', name: 'feature' }))
    expect(result.current.selection.selectedCommit).toBeNull()
  })

  it('has nothing to change on the backdrop', () => {
    const { result } = setup()

    act(() => result.current.selection.setView({ kind: 'branch', name: 'main' }))
    act(() => result.current.selection.setSelectedPath('src/a.ts'))

    expect(result.current.selection.view).toEqual({ kind: 'working' })
    expect(result.current.selection.selectedPath).toBeNull()
  })
})

describe('persistence', () => {
  it('brings back the tabs and the focused one, each starting at Working', () => {
    const first = setup()
    act(() => first.result.current.tabs.chooseRepository('/repos/a'))
    act(() => first.result.current.tabs.chooseRepository('/repos/b'))
    act(() => first.result.current.tabs.openTab())
    act(() => first.result.current.tabs.focusTab(first.result.current.tabs.tabs[0].id))
    act(() => first.result.current.selection.setView({ kind: 'branch', name: 'main' }))
    first.unmount()

    const { result } = setup()

    expect(roots(result)).toEqual(['/repos/a', '/repos/b', null])
    expect(result.current.tabs.focused?.root).toBe('/repos/a')
    expect(result.current.selection.view).toEqual({ kind: 'working' })
    expect(result.current.selection.selectedPath).toBeNull()
  })

  it('starts on the backdrop when nothing was saved', () => {
    const { result } = setup()

    expect(result.current.tabs.tabs).toHaveLength(0)
  })

  it('starts on the backdrop when what was saved is unreadable', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')

    const { result } = setup()

    expect(result.current.tabs.tabs).toHaveLength(0)
  })

  it('ignores entries that are not tabs, and extra tabs past the limit', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [
          { id: '1', root: '/repos/a' },
          { id: '2' },
          'nonsense',
          { id: '3', root: 7 },
          { id: '4', root: '/repos/b' },
          { id: '5', root: '/repos/c' },
          { id: '6', root: '/repos/d' },
          { id: '7', root: '/repos/e' }
        ],
        focusedId: '4'
      })
    )

    const { result } = setup()

    expect(roots(result)).toEqual(['/repos/a', '/repos/b', '/repos/c', '/repos/d'])
    expect(result.current.tabs.focused?.root).toBe('/repos/b')
  })

  it('keeps one repository to one tab even if the stored list says otherwise', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        tabs: [
          { id: '1', root: '/repos/a' },
          { id: '2', root: '/repos/a' },
          { id: '3', root: null },
          { id: '4', root: null }
        ],
        focusedId: '2'
      })
    )

    const { result } = setup()

    expect(roots(result)).toEqual(['/repos/a', null, null])
    // The focused tab is gone, so focus falls back to the first rather than to nothing.
    expect(result.current.tabs.focused?.root).toBe('/repos/a')
  })

  it('works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    const { result } = setup()
    expect(result.current.tabs.tabs).toHaveLength(0)

    act(() => result.current.tabs.chooseRepository('/repos/a'))
    expect(roots(result)).toEqual(['/repos/a'])
  })
})
