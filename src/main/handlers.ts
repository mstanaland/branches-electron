import { ApiError } from '../shared/apiError'
import type { Branch, RepositoryStatus } from '../shared/git'
import { listBranches, getStatus, resolveRepositoryRoot } from './git'

export interface HandlerDeps {
  /** Shows the folder picker. Resolves null if the user cancels. */
  pickFolder: () => Promise<string | null>
}

export interface Handlers {
  openRepository: () => Promise<string | null>
  getStatus: (root: string) => Promise<RepositoryStatus>
  listBranches: (root: string) => Promise<Branch[]>
}

/**
 * The logic behind `window.api`, as plain functions so it can be tested without Electron.
 * Git only runs against repositories the user opened through `openRepository`.
 */
export function createHandlers(deps: HandlerDeps): Handlers {
  const openRoots = new Set<string>()

  function assertOpen(root: string): void {
    if (!openRoots.has(root)) {
      throw new ApiError({
        code: 'REPOSITORY_NOT_OPEN',
        message: `${root} has not been opened in this session.`
      })
    }
  }

  return {
    async openRepository() {
      const folder = await deps.pickFolder()
      if (folder === null) return null
      const root = await resolveRepositoryRoot(folder)
      openRoots.add(root)
      return root
    },
    async getStatus(root) {
      assertOpen(root)
      return getStatus(root)
    },
    async listBranches(root) {
      assertOpen(root)
      return listBranches(root)
    }
  }
}
