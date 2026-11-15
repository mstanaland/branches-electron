import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

const STORAGE_KEY = 'branches.activeRoot'

export interface Selection {
  /** The repository shown in the main pane, or null if none. Remembered across launches. */
  activeRoot: string | null
  /** Switching repository also clears the selected change. */
  setActiveRoot: (root: string | null) => void
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
    selectedPath: null as string | null
  }))

  const setActiveRoot = useCallback((root: string | null) => {
    storeRoot(root)
    setState((current) =>
      current.activeRoot === root ? current : { activeRoot: root, selectedPath: null }
    )
  }, [])

  const setSelectedPath = useCallback((path: string | null) => {
    setState((current) => ({ ...current, selectedPath: path }))
  }, [])

  const value = useMemo(
    () => ({ ...state, setActiveRoot, setSelectedPath }),
    [state, setActiveRoot, setSelectedPath]
  )

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function useSelection(): Selection {
  const selection = useContext(SelectionContext)
  if (selection === null) throw new Error('useSelection must be used inside <SelectionProvider>')
  return selection
}
