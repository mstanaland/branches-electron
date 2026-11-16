import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'branches.activeRoot'

/**
 * What the main pane is showing (see ADR 0006). One value with three kinds, rather than
 * separate flags, so it can't be showing two things at once or nothing at all.
 */
export type View =
  | { kind: 'working' }
  | { kind: 'branch'; name: string }
  /** HEAD is detached, and the user picked the row standing in for it. */
  | { kind: 'detached'; oid: string }

/** Where a repository starts, and where it falls back to. Always available. */
export const WORKING: View = { kind: 'working' }

/** The ref a view asks git for, or null for Working, which asks for no history. */
export function viewRef(view: View): string | null {
  switch (view.kind) {
    case 'working':
      return null
    case 'branch':
      return view.name
    case 'detached':
      return view.oid
  }
}

/** True when both views are the same thing, for marking the selected row. */
export function isSameView(a: View, b: View): boolean {
  return a.kind === b.kind && viewRef(a) === viewRef(b)
}

export interface Selection {
  /** The repository shown in the main pane, or null if none. Remembered across launches. */
  activeRoot: string | null
  /** Switching repository also clears the selected change and goes back to Working. */
  setActiveRoot: (root: string | null) => void
  /**
   * What the main pane shows. Per session: a branch selected last launch may not exist this
   * one, and Working always does.
   */
  view: View
  /**
   * Chosen by the user, and only by the user — HEAD moving on its own never calls this
   * (ADR 0006). Checking out from our own UI does, with the branch it checked out.
   */
  setView: (view: View) => void
  /** Path of the one selected change. Resets with the active repository and on relaunch. */
  selectedPath: string | null
  setSelectedPath: (path: string | null) => void
}

/** localStorage can be missing or throw (private windows, blocked site data), so never trust it. */
function readStoredRoot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function storeRoot(root: string | null): void {
  try {
    if (root === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, root)
  } catch {
    // Not remembered next launch; the app still works.
  }
}

const SelectionContext = createContext<Selection | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState(() => ({
    activeRoot: readStoredRoot(),
    view: WORKING,
    selectedPath: null as string | null
  }))

  const setActiveRoot = useCallback((root: string | null) => {
    storeRoot(root)
    setState((current) =>
      current.activeRoot === root
        ? current
        : { activeRoot: root, view: WORKING, selectedPath: null }
    )
  }, [])

  const setView = useCallback((view: View) => {
    setState((current) => (isSameView(current.view, view) ? current : { ...current, view }))
  }, [])

  const setSelectedPath = useCallback((path: string | null) => {
    setState((current) => ({ ...current, selectedPath: path }))
  }, [])

  const value = useMemo(
    () => ({ ...state, setActiveRoot, setView, setSelectedPath }),
    [state, setActiveRoot, setView, setSelectedPath]
  )

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function useSelection(): Selection {
  const selection = useContext(SelectionContext)
  if (selection === null) throw new Error('useSelection must be used inside <SelectionProvider>')
  return selection
}
