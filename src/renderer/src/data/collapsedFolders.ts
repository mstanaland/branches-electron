import { useState } from 'react'

const storageKey = (root: string): string => `branches.collapsedFolders.${root}`

/** localStorage can be missing or throw, and its contents can be stale or hand-edited. */
function readCollapsed(root: string): ReadonlySet<string> {
  try {
    const text = localStorage.getItem(storageKey(root))
    const data: unknown = text === null ? [] : JSON.parse(text)
    if (Array.isArray(data) && data.every((entry) => typeof entry === 'string')) {
      return new Set(data)
    }
  } catch {
    // Unreadable: start with every folder expanded.
  }
  return new Set()
}

function writeCollapsed(root: string, collapsed: ReadonlySet<string>): void {
  try {
    localStorage.setItem(storageKey(root), JSON.stringify([...collapsed]))
  } catch {
    // Not remembered next time; the tree still works.
  }
}

export interface FolderExpansion {
  isExpanded: (folderPath: string) => boolean
  setExpanded: (folderPath: string, expanded: boolean) => void
}

/**
 * Which branch folders are expanded in `root`'s tree, remembered per repository.
 * Stores what is collapsed, so folders that appear later start expanded.
 */
export function useFolderExpansion(root: string): FolderExpansion {
  const [state, setState] = useState(() => ({ root, collapsed: readCollapsed(root) }))

  // Switching repository swaps in that repository's saved state.
  let current = state
  if (state.root !== root) {
    current = { root, collapsed: readCollapsed(root) }
    setState(current)
  }

  return {
    isExpanded: (folderPath) => !current.collapsed.has(folderPath),
    setExpanded: (folderPath, expanded) => {
      // Built from the latest state, not the render's copy, so several calls in one event
      // handler all count. The write is idempotent, so a repeated updater run is harmless.
      setState((latest) => {
        const collapsed = new Set(latest.root === root ? latest.collapsed : readCollapsed(root))
        if (expanded) collapsed.delete(folderPath)
        else collapsed.add(folderPath)
        writeCollapsed(root, collapsed)
        return { root, collapsed }
      })
    }
  }
}
