import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { WORKING, isSameView } from './view'
import type { View } from './view'

const STORAGE_KEY = 'branches.tabs'

/**
 * How many tabs the strip holds, of any kind (ADR 0007). The `+` button is absent once it is
 * full, so the limit is visible rather than discovered by a click that does nothing.
 */
export const MAX_TABS = 4

/**
 * One slot in the strip. `root` is null for a **Repositories tab**, which has no repository
 * yet; choosing one turns that same tab into a **repository tab** in place.
 */
export interface Tab {
  readonly id: string
  readonly root: string | null
  /** Per session: a branch open last launch may not exist this one (ADR 0006). */
  readonly view: View
  readonly selectedPath: string | null
}

export interface TabsState {
  tabs: readonly Tab[]
  /** The **focused tab**, or null when there is none and the backdrop is showing. */
  focused: Tab | null
  /** False once the strip is full, which is what hides the `+` button. */
  canOpenTab: boolean
  /** Opens a Repositories tab and focuses it. Does nothing when the strip is full. */
  openTab: () => void
  /**
   * Puts `root` in a tab and focuses it. A focused Repositories tab becomes it in place; a
   * repository that is already open has its own tab focused instead, and the Repositories tab
   * that was used to choose it closes (one repository, one tab); otherwise — the backdrop, or
   * Cmd+O from a repository tab — it opens in a new tab, unless the strip is full.
   */
  chooseRepository: (root: string) => void
  focusTab: (id: string) => void
  closeTab: (id: string) => void
  /** Closes any tab showing `root`, for when it leaves the saved list. */
  closeRepository: (root: string) => void
  /** Changes the focused tab's view. Nothing happens on the backdrop. */
  setView: (view: View) => void
  /** Changes the focused tab's selected change. Nothing happens on the backdrop. */
  setSelectedPath: (path: string | null) => void
}

interface Stored {
  tabs: readonly { id: string; root: string | null }[]
  focusedId: string | null
}

/** Ids only have to be unique within one launch's strip, and restored ones come from storage. */
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36)}`
}

/**
 * localStorage can be missing or throw (private windows, blocked site data), and its contents
 * can be stale or hand-edited, so nothing in there is trusted: anything unreadable degrades to
 * no tabs, which is the backdrop, never a crash.
 */
function readStored(): Stored {
  const empty: Stored = { tabs: [], focusedId: null }
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (text === null) return empty
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return empty
    const { tabs, focusedId } = data as Partial<Stored>
    if (!Array.isArray(tabs)) return empty
    const valid = tabs
      .filter(
        (tab): tab is { id: string; root: string | null } =>
          typeof tab === 'object' &&
          tab !== null &&
          typeof (tab as { id: unknown }).id === 'string' &&
          ((tab as { root: unknown }).root === null ||
            typeof (tab as { root: unknown }).root === 'string')
      )
      // One repository, one tab: a hand-edited file doesn't get to break that invariant.
      .filter(
        (tab, index, all) =>
          tab.root === null || all.findIndex((other) => other.root === tab.root) === index
      )
      .slice(0, MAX_TABS)
    const focused = valid.some((tab) => tab.id === focusedId) ? (focusedId as string) : null
    return { tabs: valid, focusedId: focused ?? valid[0]?.id ?? null }
  } catch {
    return empty
  }
}

function writeStored(tabs: readonly Tab[], focusedId: string | null): void {
  try {
    const stored: Stored = {
      tabs: tabs.map(({ id, root }) => ({ id, root })),
      focusedId
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Not remembered next launch; the app still works.
  }
}

/**
 * Test helper: fills the strip as a previous launch would have, before the provider reads it,
 * so a test can render one tab's worth of UI without walking through the picker. The first
 * tab is the focused one.
 */
export function seedTabs(roots: readonly (string | null)[]): void {
  const tabs = roots
    .slice(0, MAX_TABS)
    .map((root) => ({ id: newId(), root, view: WORKING, selectedPath: null }))
  writeStored(tabs, tabs[0]?.id ?? null)
}

interface State {
  tabs: readonly Tab[]
  focusedId: string | null
}

/** Views and selected changes don't persist: a restored tab starts at Working (ADR 0006). */
function initialState(): State {
  const stored = readStored()
  return {
    tabs: stored.tabs.map((tab) => ({ ...tab, view: WORKING, selectedPath: null })),
    focusedId: stored.focusedId
  }
}

/**
 * Closes the one tab `doomed` picks out. Focus moves to the neighbour on the right, or the
 * left when there is none, and stays put when the tab that closed was not the focused one.
 */
function close(current: State, doomed: (tab: Tab) => boolean): State {
  const index = current.tabs.findIndex(doomed)
  if (index === -1) return current
  const closed = current.tabs[index]
  const tabs = current.tabs.filter((tab) => tab !== closed)
  if (current.focusedId !== closed.id) return { tabs, focusedId: current.focusedId }
  return { tabs, focusedId: (tabs[index] ?? tabs[index - 1])?.id ?? null }
}

const TabsContext = createContext<TabsState | null>(null)

export function TabsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState(initialState)

  // Persisted from the committed strip rather than from inside an updater, which React may
  // run speculatively or throw away. The write is what makes the strip come back next launch.
  useEffect(() => {
    writeStored(state.tabs, state.focusedId)
  }, [state])

  const openTab = useCallback(
    () =>
      setState((current) => {
        if (current.tabs.length >= MAX_TABS) return current
        const tab: Tab = { id: newId(), root: null, view: WORKING, selectedPath: null }
        return { tabs: [...current.tabs, tab], focusedId: tab.id }
      }),
    []
  )

  const chooseRepository = useCallback(
    (root: string) =>
      setState((current) => {
        const open = current.tabs.find((tab) => tab.root === root)
        if (open !== undefined) {
          // Already open: focus it, and clear away the Repositories tab that asked for it.
          const asked = current.tabs.find(
            (tab) => tab.id === current.focusedId && tab.root === null
          )
          const tabs =
            asked === undefined ? current.tabs : current.tabs.filter((tab) => tab !== asked)
          return { tabs, focusedId: open.id }
        }
        const focused = current.tabs.find((tab) => tab.id === current.focusedId)
        if (focused !== undefined && focused.root === null) {
          return {
            tabs: current.tabs.map((tab) => (tab === focused ? { ...tab, root } : tab)),
            focusedId: focused.id
          }
        }
        if (current.tabs.length >= MAX_TABS) return current
        const tab: Tab = { id: newId(), root, view: WORKING, selectedPath: null }
        return { tabs: [...current.tabs, tab], focusedId: tab.id }
      }),
    []
  )

  const focusTab = useCallback(
    (id: string) =>
      setState((current) =>
        current.focusedId === id || !current.tabs.some((tab) => tab.id === id)
          ? current
          : { ...current, focusedId: id }
      ),
    []
  )

  const closeTab = useCallback(
    (id: string) => setState((current) => close(current, (tab) => tab.id === id)),
    []
  )

  const closeRepository = useCallback(
    (root: string) => setState((current) => close(current, (tab) => tab.root === root)),
    []
  )

  // A view and a selected change belong to one tab, so these edit the focused tab's slice.
  const updateFocused = useCallback(
    (update: (tab: Tab) => Tab) =>
      setState((current) => {
        const focused = current.tabs.find((tab) => tab.id === current.focusedId)
        if (focused === undefined) return current
        const updated = update(focused)
        if (updated === focused) return current
        return {
          tabs: current.tabs.map((tab) => (tab === focused ? updated : tab)),
          focusedId: current.focusedId
        }
      }),
    []
  )

  const setView = useCallback(
    (view: View) => updateFocused((tab) => (isSameView(tab.view, view) ? tab : { ...tab, view })),
    [updateFocused]
  )

  const setSelectedPath = useCallback(
    (selectedPath: string | null) =>
      updateFocused((tab) => (tab.selectedPath === selectedPath ? tab : { ...tab, selectedPath })),
    [updateFocused]
  )

  const value = useMemo<TabsState>(() => {
    const focused = state.tabs.find((tab) => tab.id === state.focusedId) ?? null
    return {
      tabs: state.tabs,
      focused,
      canOpenTab: state.tabs.length < MAX_TABS,
      openTab,
      chooseRepository,
      focusTab,
      closeTab,
      closeRepository,
      setView,
      setSelectedPath
    }
  }, [
    state,
    openTab,
    chooseRepository,
    focusTab,
    closeTab,
    closeRepository,
    setView,
    setSelectedPath
  ])

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>
}

export function useTabs(): TabsState {
  const tabs = useContext(TabsContext)
  if (tabs === null) throw new Error('useTabs must be used inside <TabsProvider>')
  return tabs
}

export interface Selection {
  /** The **active repository**: the focused tab's, or null on a Repositories tab or backdrop. */
  activeRoot: string | null
  /** What the focused tab shows. Working on the backdrop, which shows no repository. */
  view: View
  /**
   * Chosen by the user, and only by the user — HEAD moving on its own never calls this
   * (ADR 0006). Checking out from our own UI does, with the branch it checked out.
   */
  setView: (view: View) => void
  /** Path of the focused tab's one selected change. */
  selectedPath: string | null
  setSelectedPath: (path: string | null) => void
}

/**
 * The focused tab's slice, for the components that only care which repository, view and change
 * are in front of the user rather than about the strip itself.
 */
export function useSelection(): Selection {
  const { focused, setView, setSelectedPath } = useTabs()
  return useMemo(
    () => ({
      activeRoot: focused?.root ?? null,
      view: focused?.view ?? WORKING,
      setView,
      selectedPath: focused?.selectedPath ?? null,
      setSelectedPath
    }),
    [focused, setView, setSelectedPath]
  )
}
