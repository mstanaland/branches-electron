import { ApiError } from '../shared/apiError'
import type {
  Branch,
  BranchDeletion,
  BranchMenuAction,
  ChangeDiff,
  Commit,
  CommitDetails,
  CommitFile,
  CommitMessage,
  FileDiff,
  PublishTarget,
  RepositoryStatus,
  SavedRepository
} from '../shared/git'
import { assertRelativePath } from '../shared/path'
import { isTabCount } from '../shared/tabs'
import { assertInsideRoot } from './assertInsideRoot'
import { ClaudeError, type CommitMessageGenerator } from './claude'
import {
  checkoutBranch,
  commit,
  createBranch,
  deleteBranch,
  readBranchDeletion,
  undeletableBranches,
  fetchRemote,
  hasRemote,
  isRepositoryRoot,
  listBranches,
  getCommitDetails,
  getCommitFileDiff,
  getDiff,
  getPublishTarget,
  getStatus,
  listCommitFiles,
  listCommits,
  listUnpushedCommits,
  publishBranch,
  pullFastForward,
  pushBranch,
  resolveRepositoryRoot,
  stageFiles,
  unstageFiles
} from './git'
import type { BranchMenuTarget } from './menu'
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
  showBranchMenu: (branch: BranchMenuTarget) => Promise<BranchMenuAction | null>
  /**
   * Told which repository the user is looking at, so background work — the periodic fetch —
   * follows along.
   */
  setActiveRepository: (root: string | null) => void
  /**
   * Told how many tabs the renderer's strip holds, so the application menu can be rebuilt
   * around it.
   */
  setTabCount: (count: number) => void
  /** Runs **Generate**, one run per repository. */
  generator: CommitMessageGenerator
  /** Tells the user why **Generate** failed, in a native warning sheet. */
  showGenerateError: (message: string) => Promise<void>
}

export interface Handlers {
  openRepository: () => Promise<string | null>
  listRepositories: () => Promise<SavedRepository[]>
  removeRepository: (root: string) => Promise<void>
  showRepositoryMenu: (root: string) => Promise<boolean>
  confirmRemoveMissingRepository: (root: string) => Promise<boolean>
  getStatus: (root: string) => Promise<RepositoryStatus>
  listBranches: (root: string) => Promise<Branch[]>
  listCommits: (root: string, ref: string, limit: number, skip: number) => Promise<Commit[]>
  listUnpushedCommits: (root: string, ref: string) => Promise<string[]>
  getCommitDetails: (root: string, oid: string) => Promise<CommitDetails>
  listCommitFiles: (root: string, oid: string) => Promise<CommitFile[]>
  getCommitFileDiff: (
    root: string,
    oid: string,
    path: string,
    originalPath: string | null
  ) => Promise<FileDiff>
  getDiff: (root: string, path: string, originalPath: string | null) => Promise<ChangeDiff>
  stageFiles: (root: string, paths: readonly string[]) => Promise<void>
  unstageFiles: (root: string, paths: readonly string[]) => Promise<void>
  commit: (root: string, message: string) => Promise<void>
  generateCommitMessage: (root: string, draft: CommitMessage) => Promise<CommitMessage>
  cancelGenerate: (root: string) => Promise<void>
  setActiveRepository: (root: string | null) => Promise<void>
  fetchRepository: (root: string) => Promise<void>
  pullRepository: (root: string) => Promise<void>
  pushRepository: (root: string) => Promise<void>
  publishBranch: (root: string, remote: string) => Promise<void>
  getPublishTarget: (root: string) => Promise<PublishTarget>
  setTabCount: (count: number) => Promise<void>
  checkoutBranch: (root: string, name: string) => Promise<void>
  createBranch: (root: string, source: string, name: string) => Promise<void>
  showBranchMenu: (root: string, name: string) => Promise<BranchMenuAction | null>
  getBranchDeletion: (root: string, name: string) => Promise<BranchDeletion>
  deleteBranch: (
    root: string,
    name: string,
    oid: string,
    upstreamOid: string | null
  ) => Promise<void>
}

/**
 * Checks a ref before it reaches git. The renderer only ever sends a branch it was given
 * or an oid it read back from a commit, but it is still a string off IPC, so it is matched
 * against what exists rather than trusted: nothing user-written becomes a git argument.
 */
async function assertRef(root: string, ref: string): Promise<void> {
  if (isFullOid(ref)) return
  if ((await listBranches(root)).some((branch) => branch.name === ref)) return
  throw new ApiError({ code: 'INVALID_REF', message: `${ref} is not a branch or a commit id.` })
}

/** A branch name off IPC: matched against the local branches, never trusted. */
async function assertBranch(root: string, name: string): Promise<Branch> {
  const branch = (await listBranches(root)).find((candidate) => candidate.name === name)
  if (branch === undefined) {
    throw new ApiError({ code: 'INVALID_REF', message: `${name} is not a branch.` })
  }
  return branch
}

function isFullOid(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value)
}

/** An oid off IPC that becomes a git argument: a full object id and nothing else. */
function assertFullOid(oid: string): void {
  if (!isFullOid(oid)) {
    throw new ApiError({ code: 'INVALID_REF', message: `${oid} is not a commit id.` })
  }
}

const MAX_DRAFT_LENGTH = 64 * 1024

function isDraftText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_DRAFT_LENGTH
}

/**
 * A draft off IPC. It only becomes part of Claude Code's prompt, never a git argument, but it is
 * still checked to be what it claims, and kept to a size a commit message could be.
 */
function assertDraft(draft: unknown): asserts draft is CommitMessage {
  if (
    typeof draft !== 'object' ||
    draft === null ||
    !('subject' in draft) ||
    !('description' in draft) ||
    !isDraftText(draft.subject) ||
    !isDraftText(draft.description)
  ) {
    throw new ApiError({
      code: 'INVALID_DRAFT',
      message: 'That isn’t a commit subject and description.'
    })
  }
}

/** Paging numbers off IPC: they go into git arguments, so they must really be numbers. */
function assertCount(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ApiError({ code: 'INVALID_REF', message: `${name} must be a whole number.` })
  }
  return value
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
    deps.generator.cancel(root)
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
      deps.generator.cancel(root)
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
    async listCommits(root, ref, limit, skip) {
      await assertOpen(root)
      await assertRef(root, ref)
      return listCommits(root, ref, assertCount(limit, 'limit'), assertCount(skip, 'skip'))
    },
    async listUnpushedCommits(root, ref) {
      await assertOpen(root)
      await assertRef(root, ref)
      return listUnpushedCommits(root, ref)
    },
    async getCommitDetails(root, oid) {
      await assertOpen(root)
      assertFullOid(oid)
      return getCommitDetails(root, oid)
    },
    async listCommitFiles(root, oid) {
      await assertOpen(root)
      assertFullOid(oid)
      return listCommitFiles(root, oid)
    },
    async getCommitFileDiff(root, oid, path, originalPath) {
      await assertOpen(root)
      assertFullOid(oid)
      // Unlike `getDiff` there is no `assertInsideRoot`: this reads committed objects, never
      // the work tree, so a symlink there leads nowhere. The checks still keep a path that is
      // absolute, empty or climbing out from reaching git.
      assertRelativePath(path)
      if (originalPath !== null) assertRelativePath(originalPath)
      return getCommitFileDiff(root, oid, path, originalPath)
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
    async generateCommitMessage(root, draft) {
      await assertOpen(root)
      assertDraft(draft)
      try {
        return await deps.generator.generate(root, {
          subject: draft.subject,
          description: draft.description
        })
      } catch (error) {
        // The sheet, not the form, says what went wrong, so the form's layout never shifts.
        // Stop is the user's own doing and needs no explaining.
        if (!(error instanceof ClaudeError && error.code === 'GENERATE_CANCELLED')) {
          // Not awaited: the form unlocks now, rather than once the sheet is dismissed.
          void deps.showGenerateError(error instanceof Error ? error.message : String(error))
        }
        throw error
      }
    },
    async cancelGenerate(root) {
      await assertOpen(root)
      deps.generator.cancel(root)
    },
    async setActiveRepository(root) {
      // null is always allowed: it only stops background work.
      if (root !== null) await assertOpen(root)
      deps.setActiveRepository(root)
    },
    async fetchRepository(root) {
      await assertOpen(root)
      // `git fetch` with nothing configured exits 0 having done nothing, which would read as
      // a fetch that worked. The user asked for this one, so say what happened instead.
      if (!(await hasRemote(root))) {
        throw new ApiError({
          code: 'NO_REMOTE',
          message: 'This repository has no remote to fetch from.'
        })
      }
      // Whatever else git says — offline, a remote that is gone, refused credentials —
      // travels back as a failed result rather than being swallowed.
      await fetchRemote(root)
    },
    async pullRepository(root) {
      await assertOpen(root)
      // Same reasoning as fetchRepository: a pull with no remote configured would fail with
      // git's own words about tracking information, which say nothing about the real cause.
      if (!(await hasRemote(root))) {
        throw new ApiError({
          code: 'NO_REMOTE',
          message: 'This repository has no remote to pull from.'
        })
      }
      await pullFastForward(root)
    },
    async pushRepository(root) {
      await assertOpen(root)
      // As for Pull: with no remote, git would complain about a missing destination, which
      // says nothing about the real cause. Publish Repository (#46) will start from here.
      if (!(await hasRemote(root))) {
        throw new ApiError({
          code: 'NO_REMOTE',
          message: 'This repository has no remote to push to.'
        })
      }
      await pushBranch(root)
    },
    async publishBranch(root, remote) {
      await assertOpen(root)
      const { remotes } = await getPublishTarget(root)
      if (remotes.length === 0) {
        throw new ApiError({
          code: 'NO_REMOTE',
          message: 'This repository has no remote to publish to.'
        })
      }
      // A string off IPC that becomes a git argument, so it is matched against the remotes
      // that exist rather than trusted — which also keeps an option like `--mirror` out.
      if (!remotes.some((candidate) => candidate.name === remote)) {
        throw new ApiError({ code: 'INVALID_REF', message: `${remote} is not a remote.` })
      }
      await publishBranch(root, remote)
    },
    async getPublishTarget(root) {
      await assertOpen(root)
      return getPublishTarget(root)
    },
    async setTabCount(count) {
      // A number off IPC, and the menu is built from it, so a strip of -1 or 7.5 tabs is
      // refused rather than quietly clamped.
      if (!isTabCount(count)) {
        throw new ApiError({
          code: 'INVALID_TAB_COUNT',
          message: `${String(count)} is not a number of tabs a strip can hold.`
        })
      }
      deps.setTabCount(count)
    },
    async checkoutBranch(root, name) {
      await assertOpen(root)
      await checkoutBranch(root, name)
    },
    async createBranch(root, source, name) {
      await assertOpen(root)
      await createBranch(root, source, name)
    },
    async showBranchMenu(root, name) {
      await assertOpen(root)
      const [branches, undeletable] = await Promise.all([
        listBranches(root),
        undeletableBranches(root)
      ])
      const branch = branches.find((candidate) => candidate.name === name)
      return deps.showBranchMenu({
        name,
        isCurrent: branch?.isCurrent ?? false,
        deletable: branch !== undefined && !undeletable.has(name)
      })
    },
    async getBranchDeletion(root, name) {
      await assertOpen(root)
      await assertBranch(root, name)
      return readBranchDeletion(root, name)
    },
    async deleteBranch(root, name, oid, upstreamOid) {
      await assertOpen(root)
      assertFullOid(oid)
      if (upstreamOid !== null) assertFullOid(upstreamOid)
      await assertBranch(root, name)
      // The menu never offers these, but the call is still checked: a string off IPC.
      if ((await undeletableBranches(root)).has(name)) {
        throw new ApiError({ code: 'INVALID_REF', message: `${name} can’t be deleted.` })
      }
      // The remote and its branch are read from the repository's config, never taken off IPC.
      await deleteBranch(root, name, oid, upstreamOid)
    }
  }
}
