import { ApiError } from '../shared/apiError'
import type { Branch, RepositoryStatus, SavedRepository } from '../shared/git'
import { isRepositoryRoot, listBranches, getStatus, resolveRepositoryRoot } from './git'
import type { RepositoryStore } from './repositoryStore'

export interface HandlerDeps {
  /** Saved repositories. Their roots are allowed without being reopened. */
  store: RepositoryStore
  /** Shows the folder picker. Resolves null if the user cancels. */
  pickFolder: () => Promise<string | null>
  /** Pops up the repository's context menu. Resolves true if the user chose Remove from List. */
  showRepositoryMenu: (repository: SavedRepository) => Promise<boolean>
  /** Asks whether to remove a missing repository. Resolves true if the user confirmed. */
  confirmRemoval: (repository: SavedRepository) => Promise<boolean>
}

export interface Handlers {
  openRepository: () => Promise<string | null>
  listRepositories: () => Promise<SavedRepository[]>
  removeRepository: (root: string) => Promise<void>
  showRepositoryMenu: (root: string) => Promise<boolean>
  confirmRemoveMissingRepository: (root: string) => Promise<boolean>
  getStatus: (root: string) => Promise<RepositoryStatus>
  listBranches: (root: string) => Promise<Branch[]>
}

/**
 * The logic behind `window.api`, as plain functions so it can be tested without Electron.
 * Git only runs against repositories the user opened through `openRepository`, this session
 * or earlier (saved repositories).
 */
export function createHandlers(deps: HandlerDeps): Handlers {
  const openRoots = new Set<string>()

  async function assertOpen(root: string): Promise<void> {
    if (openRoots.has(root)) return
    // A saved root is trusted only while it is still a repository root; then it is remembered.
    if ((await deps.store.has(root)) && (await isRepositoryRoot(root))) {
      openRoots.add(root)
      return
    }
    throw new ApiError({
      code: 'REPOSITORY_NOT_OPEN',
      message: `${root} has not been opened in this session.`
    })
  }

  /** Asks the user about a saved repository and removes it if they agree. */
  async function removeIfAgreed(
    root: string,
    ask: (repository: SavedRepository) => Promise<boolean>
  ): Promise<boolean> {
    const repository = (await deps.store.list()).find((saved) => saved.root === root)
    if (!repository) {
      throw new ApiError({
        code: 'REPOSITORY_NOT_OPEN',
        message: `${root} is not a saved repository.`
      })
    }
    if (!(await ask(repository))) return false
    openRoots.delete(root)
    await deps.store.remove(root)
    return true
  }

  return {
    async openRepository() {
      const folder = await deps.pickFolder()
      if (folder === null) return null
      const root = await resolveRepositoryRoot(folder)
      openRoots.add(root)
      // Remembering the repository is a convenience; failing to save must not block opening it.
      await deps.store.add(root).catch((error: unknown) => {
        console.error('Could not save repository list:', error)
      })
      return root
    },
    listRepositories: () => deps.store.list(),
    removeRepository: async (root) => {
      openRoots.delete(root)
      await deps.store.remove(root)
    },
    showRepositoryMenu: (root) => removeIfAgreed(root, deps.showRepositoryMenu),
    confirmRemoveMissingRepository: (root) => removeIfAgreed(root, deps.confirmRemoval),
    async getStatus(root) {
      await assertOpen(root)
      return getStatus(root)
    },
    async listBranches(root) {
      await assertOpen(root)
      return listBranches(root)
    }
  }
}
