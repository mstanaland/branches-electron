import type { Branch, RepositoryStatus } from './git'
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
  /** `root` must be a repository the user opened this session. */
  getStatus: (root: string) => Promise<ApiResult<RepositoryStatus>>
  /** `root` must be a repository the user opened this session. */
  listBranches: (root: string) => Promise<ApiResult<Branch[]>>
}
