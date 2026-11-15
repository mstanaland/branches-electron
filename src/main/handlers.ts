import { ApiError } from '../shared/apiError'
import type {
  Branch,
  BranchMenuAction,
  ChangeDiff,
  RepositoryStatus,
  SavedRepository
} from '../shared/git'
import { assertRelativePath } from '../shared/path'
import { assertInsideRoot } from './assertInsideRoot'
import {
  checkoutBranch,
  commit,
  isRepositoryRoot,
  listBranches,
  getDiff,
  getStatus,
  resolveRepositoryRoot,
  stageFiles,
  unstageFiles
} from './git'
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
  /** Pops up a branch's context menu. Resolves with the user's choice, or null if dismissed. */
  showBranchMenu: (branch: Pick<Branch, 'name' | 'isCurrent'>) => Promise<BranchMenuAction | null>
  /**
   * Told which repository the user is looking at, so background work — the periodic fetch —
   * follows along.
   */
  setActiveRepository: (root: string | null) => void
}

export interface Handlers {
  openRepository: () => Promise<string | null>
  listRepositories: () => Promise<SavedRepository[]>
  removeRepository: (root: string) => Promise<void>
  showRepositoryMenu: (root: string) => Promise<boolean>
  confirmRemoveMissingRepository: (root: string) => Promise<boolean>
  getStatus: (root: string) => Promise<RepositoryStatus>
  listBranches: (root: string) => Promise<Branch[]>
  getDiff: (root: string, path: string, originalPath: string | null) => Promise<ChangeDiff>
  stageFiles: (root: string, paths: readonly string[]) => Promise<void>
  unstageFiles: (root: string, paths: readonly string[]) => Promise<void>
  commit: (root: string, message: string) => Promise<void>
  setActiveRepository: (root: string | null) => Promise<void>
  checkoutBranch: (root: string, name: string) => Promise<void>
  showBranchMenu: (root: string, name: string) => Promise<BranchMenuAction | null>
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

  /**
   * Checks a staging request before any of it reaches git, so one bad path stages nothing.
   *
   * Unlike `getDiff` this doesn't need `assertInsideRoot`: git refuses a pathspec that is
   * "beyond a symbolic link" itself, and checking every path would mean a `realpath` per file
   * on a repository-wide Stage All.
   */
  async function assertStageable(root: string, paths: readonly string[]): Promise<void> {
    await assertOpen(root)
    for (const path of paths) assertRelativePath(path)
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
    },
    async getDiff(root, path, originalPath) {
      await assertOpen(root)
      assertRelativePath(path)
      if (originalPath !== null) assertRelativePath(originalPath)
      await assertInsideRoot(root, path)
      return getDiff(root, path, originalPath)
    },
    async stageFiles(root, paths) {
      await assertStageable(root, paths)
      await stageFiles(root, paths)
    },
    async unstageFiles(root, paths) {
      await assertStageable(root, paths)
      await unstageFiles(root, paths)
    },
    async commit(root, message) {
      await assertOpen(root)
      await commit(root, message)
    },
    async setActiveRepository(root) {
      // null is always allowed: it only stops background work.
      if (root !== null) await assertOpen(root)
      deps.setActiveRepository(root)
    },
    async checkoutBranch(root, name) {
      await assertOpen(root)
      await checkoutBranch(root, name)
    },
    async showBranchMenu(root, name) {
      await assertOpen(root)
      const branch = (await listBranches(root)).find((candidate) => candidate.name === name)
      return deps.showBranchMenu({ name, isCurrent: branch?.isCurrent ?? false })
    }
  }
}
