/** Data types for git state, shared by the main process and the renderer. */

import type { PullRequest } from './github'

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
  /** True when another work tree has it checked out, so it can't be deleted from here. */
  checkedOutElsewhere: boolean
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

/**
 * Where the **default branch**'s line starts in one branch's history: the newest commit of
 * the history that the default branch has. Its tip, when the branch merged it in, otherwise
 * where the branch forked from it.
 */
export interface DefaultBranchBase {
  /** Full object id of that commit. */
  oid: string
  /**
   * Whether the default branch has commits since that the history doesn't — it moved on
   * after the fork, or after it was last merged in. False when the history contains its tip.
   */
  movedOn: boolean
}

/**
 * What **commit details** shows about one commit beyond its row in the history: who wrote it
 * and who committed it, when, and its **commit description**. The subject is the row's.
 */
export interface CommitDetails {
  /** Full object id: the **commit ID**. */
  oid: string
  authorName: string
  authorEmail: string
  /** ISO 8601. */
  authorDate: string
  committerName: string
  committerEmail: string
  /** ISO 8601. */
  committerDate: string
  /** Everything below the subject, line breaks kept. Empty when there is none. */
  description: string
}

/** What a commit did to one file. Copies are never detected, so there is no `copied`. */
export type CommitFileKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'typeChanged'

/**
 * One file a commit changed, as **commit details** lists it: against the commit's parent, the
 * empty tree for a root commit, or the first parent for a **merge**.
 */
export interface CommitFile {
  kind: CommitFileKind
  /** Path relative to the repository root, after the commit. */
  path: string
  /** For a rename, the path the file came from. Null otherwise. */
  originalPath: string | null
}

/** What a user can choose from a branch's context menu. */
export type BranchMenuAction = 'checkout' | 'create' | 'delete'

/**
 * What the Delete Branch dialog warns about, read when it opens (see ADR 0009). The delete it
 * confirms only goes ahead while the branch is still at `oid`, so the warning matches what is
 * actually deleted.
 */
export interface BranchDeletion {
  name: string
  /** Full object id the branch pointed at when its **branch-only commits** were counted. */
  oid: string
  /** How many commits deleting the branch would lose. */
  branchOnlyCommits: number
  /** The branch's **upstream**, when it is **gone**: e.g. `origin/foo` on `origin`. Else null. */
  goneUpstream: { name: string; remote: string } | null
  /**
   * The branch's **upstream**, when the dialog may offer to delete it too: it exists (not
   * **gone**) on a **remote**, and isn't the branch the remote's HEAD points at. Else null.
   */
  deletableUpstream: DeletableUpstream | null
  /**
   * The **pull request** that merged the branch, when main's last **merged branches** result
   * names one that carried `oid` (ADR 0011). Null otherwise, including for a branch with
   * commits made since, so the dialog never calls commits it is about to lose merged.
   */
  mergedBy: PullRequest | null
}

/** An **upstream** the Delete Branch dialog can offer to delete along with its branch. */
export interface DeletableUpstream {
  /** Its real name, which may differ from the branch's: e.g. `origin/bar` for branch `foo`. */
  name: string
  remote: string
  /** Full object id the upstream pointed at when read: the lease its delete runs under. */
  oid: string
  /**
   * The **branch-only commits** if the upstream is deleted too: it no longer counts as
   * somewhere else, and commits only the upstream has count as well.
   */
  branchOnlyCommits: number
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

/** A **remote** as the Publish Branch dialog offers it. */
export interface PublishRemote {
  name: string
  /** Where a push to it goes (its push URL), or null if it has none configured. */
  url: string | null
  /**
   * True when `refs/remotes/<name>/<branch>` exists here — the remote had the current branch
   * as of the last fetch. Local refs only: nothing reaches the network to find out.
   */
  hasBranch: boolean
}

/** What Push and Publish need to know about where the **current branch** can go. */
export interface PublishTarget {
  /** The current branch, or null when HEAD is detached. */
  branch: string | null
  /** Every remote, alphabetically. Empty for a repository with no remote. */
  remotes: PublishRemote[]
  /** The remote the current branch's **upstream** was on, when that upstream is **gone**. */
  goneFrom: string | null
}

/** A `PublishTarget` with a current branch to publish — what the Publish Branch dialog needs. */
export type PublishableTarget = PublishTarget & { branch: string }

/** A **commit subject** and **commit description**, as the commit form holds them. */
export interface CommitMessage {
  subject: string
  description: string
}
