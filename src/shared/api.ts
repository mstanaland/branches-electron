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
  /** `root` must be a saved repository or one the user opened this session. */
  getStatus: (root: string) => Promise<ApiResult<RepositoryStatus>>
  /** `root` must be a saved repository or one the user opened this session. */
  listBranches: (root: string) => Promise<ApiResult<Branch[]>>
}
