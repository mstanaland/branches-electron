/** Pure functions over changes (see GLOSSARY.md), shared so main and the renderer agree. */
import type { FileChange, FileStatus } from './git'

export type StagingState = 'staged' | 'unstaged' | 'partial'

/** A side's status when that side differs, or null when it has nothing (or isn't tracked). */
export function changedSide(status: FileChange['index']): Exclude<FileStatus, 'unmodified'> | null {
  return status === null || status === 'unmodified' ? null : status
}

/**
 * Whether a change is fully in the index, not in it, or split. Untracked files and conflicts
 * have no staged side that counts, so they are unstaged.
 */
export function stagingState(change: FileChange): StagingState {
  if (change.kind === 'unmerged') return 'unstaged'
  const staged = changedSide(change.index) !== null
  const unstaged = changedSide(change.worktree) !== null
  if (staged && unstaged) return 'partial'
  return staged ? 'staged' : 'unstaged'
}

const conflictRank = (change: FileChange): number => (change.kind === 'unmerged' ? 0 : 1)

/** The list the user sees: conflicts first, then by path. Ignored files are left out. */
export function sortChanges(changes: readonly FileChange[]): FileChange[] {
  return changes
    .filter((change) => change.kind !== 'ignored')
    .toSorted((a, b) => {
      const byConflict = conflictRank(a) - conflictRank(b)
      if (byConflict !== 0) return byConflict
      // Code point order, so the list doesn't reshuffle with the user's locale.
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    })
}

/** Splits "a/b/c.ts" into the folder "a/b/" (with its trailing slash) and the name "c.ts". */
export function splitPath(path: string): { folder: string; name: string } {
  const slash = path.lastIndexOf('/')
  return { folder: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}
