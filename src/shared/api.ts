import type { Branch, RepositoryStatus, SavedRepository } from './git'
import type { ApiResult } from './result'

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
}

/**
 * Things the main process tells the renderer about. Not calls, so they don't return an
 * `ApiResult` and `unwrapApi` leaves them alone.
 */
export interface BranchesEvents {
  /** The user chose File > Open Repository… (Cmd+O). Returns a function that unsubscribes. */
  onOpenRepositoryRequested: (listener: () => void) => () => void
}

/** Everything the preload exposes as `window.api`. */
export type WindowApi = BranchesApi & BranchesEvents
