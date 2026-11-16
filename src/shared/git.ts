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
  /**
   * Full object id of HEAD, or null in a repository with no commits. Full, not git's own
   * abbreviation, so the renderer can shorten it the one way it shortens every oid
   * (`shortOid`) and the same commit never reads two different lengths on screen.
   */
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

/**
 * One commit in a branch's history. `parents` is what the graph is built from: no parents
 * makes it a root, more than one makes it a merge.
 */
export interface Commit {
  /** Full object id. */
  oid: string
  /** The first eight characters of `oid`. Always eight — see `shortOid`. */
  shortOid: string
  /** Full object ids of the parents, in git's order: the first is the commit's own line. */
  parents: string[]
  /** First line of the commit message. */
  subject: string
  authorName: string
  /** ISO 8601, from the author date. */
  authorDate: string
}

/** What a user can choose from a branch's context menu. */
export type BranchMenuAction = 'checkout'

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

/** One line of a diff. Added lines have no old number; removed lines have no new number. */
export interface DiffLine {
  kind: 'context' | 'added' | 'removed'
  oldNumber: number | null
  newNumber: number | null
  /** The line without its +, - or space prefix. */
  text: string
  /** True when git marked this line "\ No newline at end of file". */
  noNewline: boolean
}

export interface DiffHunk {
  /** The `@@ -1,3 +1,4 @@ …` line. */
  header: string
  lines: DiffLine[]
}

/**
 * A parsed diff of one file on one side. A rename with no edits or a mode-only change has
 * no hunks. `truncated` means the diff was cut short because it was very large.
 */
export type FileDiff = { binary: true } | { binary: false; hunks: DiffHunk[]; truncated: boolean }

/**
 * What differs for one change. Each side is null when it has no diff: a partially staged
 * change has both, an untracked file only `unstaged`.
 */
export interface ChangeDiff {
  staged: FileDiff | null
  unstaged: FileDiff | null
}
