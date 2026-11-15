import { changedSide } from '../../../shared/changes'
import type { FileChange } from '../../../shared/git'

/**
 * What a change will look like once it is staged or unstaged, so a row can redraw before git
 * has answered. Only the staging state has to be right: the badges are corrected by the
 * refetch that follows, which is why an exotic case (unstaging half a rename, say) may show
 * a slightly wrong side for a moment rather than being predicted exactly.
 *
 * A conflict is returned unchanged: conflicts aren't staged from the list.
 */
export function predictStaged(change: FileChange): FileChange {
  if (change.kind === 'unmerged') return change
  if (change.kind === 'untracked') {
    return { ...change, index: 'added', worktree: 'unmodified', kind: 'ordinary' }
  }
  return {
    ...change,
    // A change already in the index keeps the status it has there; otherwise the work tree's
    // status moves across.
    index: changedSide(change.index) ?? changedSide(change.worktree) ?? 'modified',
    worktree: 'unmodified'
  }
}

export function predictUnstaged(change: FileChange): FileChange {
  if (change.kind === 'unmerged') return change
  if (change.kind === 'untracked') return change
  // A staged new file goes back to being untracked, not a change with an unstaged side.
  if (change.index === 'added') {
    return { ...change, index: null, worktree: null, kind: 'untracked' }
  }
  return {
    ...change,
    index: 'unmodified',
    worktree: changedSide(change.worktree) ?? changedSide(change.index) ?? 'modified'
  }
}
