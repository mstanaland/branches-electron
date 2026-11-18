import type {
  Branch,
  BranchMenuAction,
  ChangeDiff,
  Commit,
  RepositoryStatus,
  SavedRepository
} from './git'
import type { ApiResult } from './result'
import type { TabCommand } from './tabs'

/**
 * The typed bridge between the renderer (React) and the main process (Node).
 * The renderer never touches Node or git directly; it only calls these.
 *
 * Calls resolve with an `ApiResult` instead of rejecting, because Electron's contextBridge
 * strips an error's `code` and `stderr`. The renderer calls them through `unwrapApi`
 * (see `src/renderer/src/api.ts`), which rejects with a real `ApiError`.
 */
export interface BranchesApi {
  /** Shows the native folder picker and returns the chosen repository's root, or null if cancelled. */
  openRepository: () => Promise<ApiResult<string | null>>
  /** The saved repositories, each flagged `missing` if its folder is gone. Checked on every call. */
  listRepositories: () => Promise<ApiResult<SavedRepository[]>>
  /** Forgets a saved repository. Never touches the folder. */
  removeRepository: (root: string) => Promise<ApiResult<void>>
  /**
   * Pops up the native context menu for a saved repository. Resolves true if the user chose
   * "Remove from List" (already done by the time this resolves), false if they dismissed it.
   */
  showRepositoryMenu: (root: string) => Promise<ApiResult<boolean>>
  /**
   * Asks, in a native dialog, whether to remove a saved repository whose folder is gone.
   * Resolves true if the user confirmed (already removed), false if they cancelled.
   */
  confirmRemoveMissingRepository: (root: string) => Promise<ApiResult<boolean>>
  /** `root` must be a saved repository or one the user opened this session. */
  getStatus: (root: string) => Promise<ApiResult<RepositoryStatus>>
  /** `root` must be a saved repository or one the user opened this session. */
  listBranches: (root: string) => Promise<ApiResult<Branch[]>>
  /**
   * One page of the commits reachable from `ref`, newest first and in topological order.
   *
   * `ref` is a local branch name or a full object id — the renderer anchors every page after
   * the first to the oid the first page started from, so a branch that moves restarts the
   * list instead of shifting rows underneath it. A ref that resolves to nothing, as in a
   * repository with no commits, gives an empty list rather than an error.
   *
   * `root` must be a saved repository or one the user opened this session.
   */
  listCommits: (
    root: string,
    ref: string,
    limit: number,
    skip: number
  ) => Promise<ApiResult<Commit[]>>
  /**
   * The staged and unstaged diffs of one change. `path` is relative to the repository root
   * and must not climb out of it. For a renamed file pass `originalPath` (else null) so the
   * staged side shows a rename. `root` must be a saved repository or one opened this session.
   */
  getDiff: (
    root: string,
    path: string,
    originalPath: string | null
  ) => Promise<ApiResult<ChangeDiff>>
  /**
   * Puts whole changes into the index. Each path is relative to the repository root and must
   * not climb out of it; an empty list does nothing. `root` must be a saved repository or one
   * the user opened this session.
   */
  stageFiles: (root: string, paths: readonly string[]) => Promise<ApiResult<void>>
  /** Takes whole changes back out of the index, leaving the work tree alone. Same path rules. */
  unstageFiles: (root: string, paths: readonly string[]) => Promise<ApiResult<void>>
  /**
   * Commits what is in the index with `message` — its first line is the commit subject, the
   * rest the commit description. Hooks run, and a hook or signing failure comes back as
   * `COMMAND_FAILED` with what git printed, so the form can show it. `root` must be a saved
   * repository or one the user opened this session.
   */
  commit: (root: string, message: string) => Promise<ApiResult<void>>
  /**
   * Switches to an existing local branch. Fails with `CHECKOUT_BLOCKED_BY_CHANGES`, whose
   * `files` lists what stands in the way, when local changes would be overwritten.
   * `root` must be a saved repository or one the user opened this session.
   */
  checkoutBranch: (root: string, name: string) => Promise<ApiResult<void>>
  /**
   * Updates `root`'s remote-tracking refs now, with the same `git fetch --prune` the
   * background fetch runs. Unlike that one it reports what went wrong: being offline or
   * having credentials refused comes back as `COMMAND_FAILED`, and a repository with no
   * remote as `NO_REMOTE`, because a fetch the user asked for that silently did nothing is
   * worse than no button at all. `root` must be a saved repository or one the user opened
   * this session.
   */
  fetchRepository: (root: string) => Promise<ApiResult<void>>
  /**
   * Tells main which repository the user is looking at, so it can keep that one's
   * remote-tracking refs current with a periodic `git fetch`. Pass null when none is active.
   * `root` must be a saved repository or one the user opened this session.
   */
  setActiveRepository: (root: string | null) => Promise<ApiResult<void>>
  /**
   * Tells main how many tabs the strip holds, so the Window menu can enable only what the
   * strip can actually do — and so Cmd+W knows whether there is a tab to close or only the
   * window. Called whenever the count changes; `count` must be between 0 and `MAX_TABS`.
   */
  setTabCount: (count: number) => Promise<ApiResult<void>>
  /**
   * Pops up the native context menu for a branch. Resolves with what the user chose, or null
   * if they dismissed it. It only reports the choice; the renderer then makes the call, so it
   * can show progress and errors.
   */
  showBranchMenu: (root: string, name: string) => Promise<ApiResult<BranchMenuAction | null>>
}

/**
 * Things the main process tells the renderer about. Not calls, so they don't return an
 * `ApiResult` and `unwrapApi` leaves them alone.
 */
export interface BranchesEvents {
  /** The user chose File > Open Repository… (Cmd+O). Returns a function that unsubscribes. */
  onOpenRepositoryRequested: (listener: () => void) => () => void
  /**
   * The user chose one of the Window menu's tab items — New Tab, Close Tab, Show Previous /
   * Next Tab, or one of Cmd+1 … Cmd+4. The strip lives here, so main only reports the choice.
   * Returns a function that unsubscribes.
   */
  onTabCommand: (listener: (command: TabCommand) => void) => () => void
  /**
   * A background fetch moved, added or pruned a remote-tracking ref in `root`, so the
   * ahead/behind counts the renderer is showing are stale. Returns an unsubscribe function.
   */
  onRemoteRefsChanged: (listener: (root: string) => void) => () => void
}

/** Everything the preload exposes as `window.api`. */
export type WindowApi = BranchesApi & BranchesEvents
