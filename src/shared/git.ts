/** Data types for git state, shared by the main process and the renderer. */

/** What happened to a file on one side (index or work tree). */
export type FileStatus =
  | 'unmodified'
  | 'modified'
  | 'typeChanged'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged'

export type FileChangeKind = 'ordinary' | 'renamed' | 'unmerged' | 'untracked' | 'ignored'

export interface FileChange {
  /** Path relative to the repository root. */
  path: string
  /** For renames and copies, the path the file came from. */
  originalPath: string | null
  /** Status in the index (staged). Null for untracked and ignored files. */
  index: FileStatus | null
  /** Status in the work tree (unstaged). Null for untracked and ignored files. */
  worktree: FileStatus | null
  kind: FileChangeKind
}

export interface RepositoryStatus {
  /** Current branch name, or null when HEAD is detached. */
  branch: string | null
  /** Short commit id of HEAD, or null in a repository with no commits. */
  headOid: string | null
  detached: boolean
  /** Upstream branch, e.g. "origin/main", or null if none is set. */
  upstream: string | null
  ahead: number
  behind: number
  changes: FileChange[]
}

export interface Branch {
  /** Full short name, e.g. "feature/login". */
  name: string
  isCurrent: boolean
  shortOid: string
  upstream: string | null
  /** True when the upstream is configured but no longer exists on the remote. */
  upstreamGone: boolean
  ahead: number
  behind: number
}

/** A repository in the user's saved list (see GLOSSARY.md). */
export interface SavedRepository {
  /** Symlink-resolved top level of the work tree; the identity (ADR 0001). */
  root: string
  /** Defaults to the root's folder name. */
  name: string
  /** ISO 8601 timestamp. */
  lastOpenedAt: string
  /** True when the folder no longer exists or is no longer a repository root. Never auto-deleted. */
  missing: boolean
}
